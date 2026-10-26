#!/usr/bin/env node
/**
 * hf_build.mjs - turn an ad JSON (the same shape mg_plan writes and mg_check checks) into a HyperFrames project and
 * render it. One sub-composition per scene; the animation library runs in it (assets/vendor/mv-runtime.js).
 *
 *   node hf_build.mjs <project>/ads/<name>.json [--out <file>] [--draft] [--blur] [--lint]
 *   node hf_build.mjs <project>/ads/<name>.json --isolate <scene>:<part> --format png-sequence|mov|mp4 --out <path>
 *   node hf_build.mjs <project>/ads/<name>-overlay.json --overlay --out <file.mov>
 *   node hf_build.mjs <captions>.json --captions --project <project> --out <file.mov>   (build_ad.mjs does this)
 *
 *   --draft    fast encode for review (the frames are full size either way - HyperFrames renders 1080p quickly)
 *   --blur     final renders: a light motion blur (render at 60fps, blend each pair of frames down to 30)
 *   --isolate  one part of one scene on transparency (export_ae.mjs): base, v<k>, text, list, endcard, lowerthird,
 *              ring, cutout, custom - the same part names as the Remotion template had
 *   --overlay  {"duration", "items"} JSON -> a transparent ProRes 4444 .mov for build_ad.mjs overlays
 *   --captions {"duration", "style", "captions"} JSON -> the animated caption layer (transparent .mov) build_ad lays on top
 *   --layer <parts>  the whole timeline, but only these parts of every scene ("base", "text", "!base,!text" ... - the
 *              same names as --isolate). Add --transparent for alpha (mov / png-sequence), --with-look to keep the look
 *   --look-only  just the ad's look (grain, vignette, sweep) on transparency, the whole timeline
 *   --range a:b  render only frames [a, b) of the timeline (each scene starts part-way in, its clips seek to match)
 *   --incremental  render the timeline as one window per scene (from where the scene's transition begins to where the
 *              next one's begins), each cached by its content in <project>/build/_windows; only windows whose scenes,
 *              clips or assets changed are rendered again, then the windows are joined. Works with --draft and --blur.
 *              --jobs N renders N windows at once (default 2). Writes <out>.windows.json (what was rendered, what cached)
 *   --lint     run `hyperframes lint` on the generated project and print what it finds
 *   --keep     leave the generated project in <project>/build/<name>/ (always kept; this flag only prints its path)
 *
 * The project needs hf_init.mjs first (runtime, GSAP, theme, fonts, logo, packshots). Clips the ad uses must be in
 * <project>/assets/clips (fetch_clips.mjs / the library download). Each clip is re-encoded for the stretch a scene
 * uses, with a keyframe every second - HyperFrames freezes on sparse keyframes when it seeks.
 */
import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {transitionFrames as tFrames} from './lib/transitions.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const slug = (p) => String(p).replace(/[^\w-]+/g, '_');
const file = argv[0];
if (!file || !fs.existsSync(file)) {
  console.error('usage: node hf_build.mjs <project>/ads/<name>.json [--out <file>] [--draft] [--blur] | --isolate <scene>:<part> --format png-sequence | --overlay');
  process.exit(2);
}
const FPS = 30, sec = (s) => Math.round(s * FPS);
const adPath = path.resolve(file);
const project = path.resolve(opt('--project', path.join(path.dirname(adPath), '..')));
const name = path.basename(adPath, '.json');
const readJ = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const theme = readJ(path.join(project, 'theme.json'));
const motifs = fs.existsSync(path.join(project, 'motifs.json')) ? readJ(path.join(project, 'motifs.json')) : null;
const W = theme.aspect === '16:9' ? 1920 : 1080, H = theme.aspect === '16:9' ? 1080 : 1920;
const ROOT = process.env.MAKE_VIDEO_ROOT || path.join(os.homedir(), '.claude', 'make-video');
const TOOLS = path.join(ROOT, 'tools', 'hyperframes');
const CAPTIONS = argv.includes('--captions');
const OVERLAY = argv.includes('--overlay') || CAPTIONS;
const isoArg = opt('--isolate');
const isolate = isoArg ? {scene: Number(isoArg.split(':')[0]), part: isoArg.split(':').slice(1).join(':')} : null;
const format = opt('--format', OVERLAY ? 'mov' : 'mp4');
const out = path.resolve(opt('--out', path.join(project, 'out', `${name}${isolate ? `-s${isolate.scene}-${slug(isolate.part)}` : ''}.${format === 'png-sequence' ? 'frames' : format}`)));
const LAYER = opt('--layer');
const LOOK_ONLY = argv.includes('--look-only');
const rangeArg = opt('--range');
const RANGE = rangeArg ? rangeArg.split(':').map(Number) : null;
const BLUR = argv.includes('--blur') && !isolate && !OVERLAY;
const transparent = OVERLAY || !!isolate || LOOK_ONLY || argv.includes('--transparent');
const ad = readJ(adPath);
const scenes = OVERLAY ? [] : (ad.scenes || ad.ad?.scenes || []);
if (!OVERLAY && !scenes.length) { console.error(`${file}: no scenes`); process.exit(1); }

// ---- timing: each scene's host starts where the previous one's transition begins (they overlap by its length)
const transitionFrames = (t) => tFrames(t, FPS);
const frames = scenes.map((s) => Math.max(1, sec(s.duration)));
const tIn = scenes.map((s, i) => (i > 0 && s.transition ? transitionFrames(s.transition) : 0));
const starts = [];
scenes.forEach((s, i) => starts.push(i === 0 ? 0 : starts[i - 1] + frames[i - 1] - tIn[i]));
const totalFrames = OVERLAY ? sec(ad.duration || 0) : starts[starts.length - 1] + frames[frames.length - 1];

// ---- --incremental: one window per scene, each rendered by a child process (--range) through the window cache
if (argv.includes('--incremental') && !OVERLAY && !isolate && !RANGE && !LAYER && !LOOK_ONLY) {
  if (scenes.some((s) => s.type === 'custom' && s.html)) {
    console.log('  incremental: this ad has a hand-written custom scene (it cannot start part-way in) - rendering it whole');
  } else {
    const {spawn} = await import('node:child_process');
    // window k runs from where scene k's transition begins to where scene k+1's begins
    const cuts = [...new Set([0, ...starts.slice(1), totalFrames])].filter((x) => x >= 0 && x <= totalFrames).sort((a, b) => a - b);
    const wins = cuts.slice(1).map((b, k) => [cuts[k], b]).filter(([a, b]) => b > a);
    const cacheDir = path.join(project, 'build', '_windows');
    fs.mkdirSync(cacheDir, {recursive: true});
    const pass = ['--draft', '--blur'].filter((x) => argv.includes(x));
    if (opt('--project')) pass.push('--project', project);
    const jobs = Math.max(1, Number(opt('--jobs', 2)));
    const t0 = Date.now(), parts = [], status = [];
    let next = 0, failed = null;
    const runOne = (k) => new Promise((done) => {
      const [a, b] = wins[k];
      const segOut = path.join(cacheDir, `${slug(name)}_w${k}.mp4`);
      parts[k] = segOut;
      const c = spawn(process.execPath, [process.argv[1], adPath, '--range', `${a}:${b}`, '--out', segOut, '--window', String(k), ...pass], {env: process.env});
      let txt = '';
      c.stdout.on('data', (d) => (txt += d));
      c.stderr.on('data', (d) => (txt += d));
      c.on('close', (code) => {
        if (code !== 0) failed = failed || `  window ${k + 1} (frames ${a}-${b}) failed:\n${txt.slice(-2500)}`;
        else status[k] = /from cache/.test(txt) ? 'cached' : 'rendered';
        done();
      });
    });
    await Promise.all(Array.from({length: Math.min(jobs, wins.length)}, async () => { while (next < wins.length && !failed) await runOne(next++); }));
    if (failed) { console.error(failed); process.exit(1); }
    fs.mkdirSync(path.dirname(out), {recursive: true});
    const list = path.join(cacheDir, `${slug(name)}_concat.txt`);
    fs.writeFileSync(list, parts.map((p) => `file '${p.split(path.sep).join('/')}'`).join('\n'));
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out], {encoding: 'utf8'});
    if (r.status !== 0) { console.error(`  joining the windows failed: ${r.stderr}`); process.exit(1); }
    const got = Number(spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', out], {encoding: 'utf8'}).stdout.trim());
    if (got !== totalFrames) console.log(`  warn   the joined file has ${got} frames, the timeline ${totalFrames}`);
    const scenesIn = (k) => scenes.map((_, i) => i).filter((i) => starts[i] < wins[k][1] && starts[i] + frames[i] > wins[k][0]).map((i) => i + 1);
    const redone = status.map((st, k) => (st === 'rendered' ? k : -1)).filter((k) => k >= 0);
    console.log(`  ${scenes.length} scenes -> ${out}  (${(totalFrames / FPS).toFixed(2)}s; ${wins.length} windows, ${redone.length} rendered${redone.length ? ` [${redone.map((k) => `scenes ${scenesIn(k).join('+')}`).join(', ')}]` : ''}, ${wins.length - redone.length} from cache; ${((Date.now() - t0) / 1000).toFixed(1)}s${BLUR ? ', motion blur' : ''})`);
    fs.writeFileSync(out.replace(/\.mp4$/i, '') + '.windows.json', JSON.stringify({fps: FPS, totalFrames, starts, frames,
      windows: wins.map(([a, b], k) => ({from: a, to: b, scenes: scenesIn(k), status: status[k]}))}, null, 1));
    process.exit(0);
  }
}

// ---- the build folder: index.html, compositions/, assets/ (runtime, fonts, logo, packshots, the media this ad uses)
const buildDir = path.join(project, 'build', `${name}${isolate ? `__s${isolate.scene}_${slug(isolate.part)}` : ''}${LAYER ? `__L_${slug(LAYER)}` : ''}${LOOK_ONLY ? '__look' : ''}${RANGE ? `__w${opt('--window', `${RANGE[0]}_${RANGE[1]}`)}` : ''}`);
fs.rmSync(path.join(buildDir, 'compositions'), {recursive: true, force: true});
for (const d of ['compositions', 'assets/media']) fs.mkdirSync(path.join(buildDir, d), {recursive: true});
const A = (p) => path.join(project, 'assets', p);
const copyTree = (src, dst) => {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, {recursive: true});
  for (const e of fs.readdirSync(src, {withFileTypes: true})) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else if (!fs.existsSync(d) || fs.statSync(d).mtimeMs < fs.statSync(s).mtimeMs || fs.statSync(d).size !== fs.statSync(s).size) fs.copyFileSync(s, d);
  }
};
for (const d of ['vendor', 'fonts', 'products', 'custom']) copyTree(A(d), path.join(buildDir, 'assets', d));
for (const f of fs.readdirSync(path.join(project, 'assets'))) if (/^logo/i.test(f)) fs.copyFileSync(A(f), path.join(buildDir, 'assets', f));
for (const req of ['vendor/mv-runtime.js', 'vendor/gsap.min.js']) {
  if (!fs.existsSync(path.join(buildDir, 'assets', req))) { console.error(`  missing assets/${req} - run hf_init.mjs for this brand first`); process.exit(1); }
}

// ---- media: every <video> a scene shows, keyed exactly as the runtime's <Video> slots are (shim/remotion.tsx)
const ffmpeg = (args) => { const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], {encoding: 'utf8'}); if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`); };
const probeDur = (f) => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], {encoding: 'utf8'}).stdout.trim() || 0);
const staticFile = (p) => (/^(https?:|data:|assets\/)/.test(p) ? p : `assets/${p.replace(/^\/+/, '')}`);
const keyOf = (src, trimFrames) => `${staticFile(src)}@${Math.round(trimFrames)}`;
const mediaCache = new Map();
/** A clip, re-encoded for [from, from + dur): constant 30fps, a keyframe every second, no audio. */
const stageClip = (src, fromSec, durSec) => {
  if (/^https?:/.test(src)) throw new Error(`${src}: download the clip into assets/clips first (fetch_clips.mjs) - HyperFrames needs local media`);
  const abs = A(src.replace(/^assets\//, ''));
  if (!fs.existsSync(abs)) throw new Error(`clip not found: assets/${src.replace(/^assets\//, '')}`);
  const from = Math.max(0, fromSec), dur = Math.min(durSec + 0.3, Math.max(0.2, probeDur(abs) - from));
  const id = crypto.createHash('sha1').update(`${abs}|${fs.statSync(abs).mtimeMs}|${from.toFixed(3)}|${dur.toFixed(3)}`).digest('hex').slice(0, 10);
  const rel = `assets/media/${path.basename(abs, path.extname(abs)).replace(/[^\w-]/g, '_')}_${id}.mp4`;
  if (!mediaCache.has(rel)) {
    // encoded once per brand project (build/_media), then copied into this build - isolated renders share it
    const shared = path.join(project, 'build', '_media', path.basename(rel)), dst = path.join(buildDir, rel);
    fs.mkdirSync(path.dirname(shared), {recursive: true});
    if (!fs.existsSync(shared)) {
      // written under a temporary name, then renamed: --incremental windows stage the same clips at the same time
      const tmp = shared.replace(/\.mp4$/,`.${process.pid}.tmp.mp4`);
      ffmpeg(['-ss', from.toFixed(3), '-i', abs, '-t', dur.toFixed(3), '-an', '-r', String(FPS), '-g', String(FPS), '-keyint_min', String(FPS),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmp]);
      try { if (!fs.existsSync(shared)) fs.renameSync(tmp, shared); } catch { /* another window got there first */ }
      fs.rmSync(tmp, {force: true});
    }
    if (!fs.existsSync(dst) || fs.statSync(dst).size !== fs.statSync(shared).size) fs.copyFileSync(shared, dst);
    mediaCache.set(rel, true);
  }
  return rel;
};
/** The separated subject as transparent WebM (separate.mjs writes it; older cut-outs are encoded here from their frames). */
const stageCutout = (dir) => {
  const src = A(path.join(dir, 'cutout.webm'));
  if (!fs.existsSync(src)) {
    const framesDir = A(dir);
    if (!fs.existsSync(path.join(framesDir, 'frame_00000.png'))) throw new Error(`cut-out ${dir}: no cutout.webm or frames - run separate.mjs`);
    ffmpeg(['-framerate', String(FPS), '-i', path.join(framesDir, 'frame_%05d.png'), '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '30', '-g', String(FPS), '-row-mt', '1', '-auto-alt-ref', '0', src]);
  }
  const rel = `assets/${dir}/cutout.webm`;
  fs.mkdirSync(path.dirname(path.join(buildDir, rel)), {recursive: true});
  fs.copyFileSync(src, path.join(buildDir, rel));
  return rel;
};
/** The videos a scene renders, in render order: [{key, file, mediaStart}]. Mirrors components.tsx / visuals.tsx. */
const videosOf = (s, dur) => {
  const v = [];
  const push = (key, file, mediaStart = 0) => v.push({key, file, mediaStart});
  if (s.type === 'footage' && s.src) {
    const trim = s.trimBefore || 0, f = stageClip(s.src, trim, dur);
    if (s.fit === 'blurfill') push(keyOf(s.src, sec(trim)), f);
    push(keyOf(s.src, sec(trim)), f);
  } else if (s.bgStyle === 'blur-footage' && s.bgClip?.src) {
    const trim = s.bgClip.trimBefore || 0;
    push(keyOf(s.bgClip.src, sec(trim)), stageClip(s.bgClip.src, trim, dur));
  }
  for (const vis of s.visuals || []) {
    if (vis.kind !== 'split' && vis.kind !== 'slider') continue;
    for (const side of ['a', 'b']) {
      const p = vis[side] || {};
      if (p.footage) { const trim = p.trimBefore || 0; push(keyOf(p.footage, sec(trim)), stageClip(p.footage, trim, dur)); }
    }
  }
  if (s.type === 'footage' && s.cutout) {
    const info = readJ(A(path.join(s.cutout, 'cutout.json')));
    s.cutoutInfo = {start: info.start, frames: info.frames};
    const trim = (s.trimBefore || 0) - info.start;
    push(keyOf(`${s.cutout}/cutout.webm`, Math.round(trim * FPS)), stageCutout(s.cutout), Math.max(0, trim));
  }
  return v;
};

// ---- HTML
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
const BS = String.fromCharCode(92); // a backslash: '<' and the two line separators become unicode escapes in <script>
const js = (o) => JSON.stringify(o).replace(/</g, `${BS}u003c`).split(LS).join(`${BS}u2028`).split(PS).join(`${BS}u2029`);
const fontFaces = (theme.font?.files || []).map((f) => `@font-face { font-family: "${f.family}"; src: url('assets/fonts/${f.file}'); font-weight: ${f.weight}; }`).join('\n    ');
const secs = (fr) => +(fr / FPS).toFixed(4);
// the root's length rounded DOWN: HyperFrames renders ceil(duration x fps) frames, so 110 frames = 3.6667s would give 111
const secsFloor = (fr) => Math.floor((fr / FPS) * 1e4) / 1e4;

const sceneFile = (id, s, i, durFrames, win = {offset: 0, hostFrames: durFrames}) => {
  const vids = videosOf(s, durFrames / FPS);
  const seen = {};
  const videos = {};
  const tags = vids.map((v, k) => {
    const n = (seen[v.key] = (seen[v.key] ?? -1) + 1);
    videos[`${v.key}#${n}`] = `${id}-v${k}`;
    return `<video id="${id}-v${k}" class="clip" src="${esc(v.file)}" muted playsinline data-start="0" data-duration="${secs(win.hostFrames)}" data-media-start="${+(v.mediaStart + win.offset / FPS).toFixed(4)}"></video>`;
  });
  const spec = {scene: s, index: i, fps: FPS, width: W, height: H, enter: i > 0 ? s.transition : undefined, exit: scenes[i + 1]?.transition, only: isolate?.part ?? LAYER, videos,
    ...(win.offset || win.hostFrames !== durFrames ? {offset: win.offset, hostFrames: win.hostFrames} : {})};
  return `<template>
  <style>
    ${fontFaces}
    #root { position: absolute; inset: 0; overflow: hidden; }
    #${id}-mount { position: absolute; inset: 0; }
    #${id}-park { position: absolute; inset: 0; opacity: 0; pointer-events: none; }
  </style>
  <div id="root" data-composition-id="${id}" data-width="${W}" data-height="${H}">
    <div id="${id}-park">
      ${tags.join('\n      ')}
    </div>
    <div id="${id}-mount"></div>
  </div>
  <script>MV.scene(${js(id)}, ${js(spec)});</script>
</template>
`;
};

const hosts = [];
const write = (rel, text) => fs.writeFileSync(path.join(buildDir, rel), text);
// Lottie animations travel inside the scene data (no fetch while rendering): read assets/<src> into the visual's "data"
const inlineLottie = (v) => {
  if (v?.kind === 'lottie' && v.src && !v.data) {
    const p = A(v.src.replace(/^assets\//, ''));
    if (!fs.existsSync(p)) throw new Error(`lottie ${v.src} not found in assets/`);
    v.data = readJ(p);
  }
};
scenes.forEach((s) => (s.visuals || []).forEach(inlineLottie));
(ad.items || []).forEach((it) => inlineLottie(it.visual));
// the ad's look (film, paper, print, sweep): the scene list's "look", else the brand's motifs.json "look"
const LOOK = ad.look ?? motifs?.look ?? 'clean';
if (CAPTIONS) {
  if (!(ad.captions || []).length) { console.error(`${file}: no captions`); process.exit(1); }
  write('compositions/cap.html', `<template>
  <style>
    ${fontFaces}
    #root { position: absolute; inset: 0; overflow: hidden; }
    #cap-mount { position: absolute; inset: 0; }
  </style>
  <div id="root" data-composition-id="cap" data-width="${W}" data-height="${H}"><div id="cap-mount"></div></div>
  <script>MV.captions("cap", ${js({captions: ad.captions, style: ad.style || 'pop', duration: ad.duration, fps: FPS, width: W, height: H})});</script>
</template>
`);
  hosts.push({id: 'cap', start: 0, dur: totalFrames, z: 1});
} else if (OVERLAY) {
  if (!(ad.items || []).length) { console.error(`${file}: an overlay needs "items"`); process.exit(1); }
  write('compositions/ov.html', `<template>
  <style>
    ${fontFaces}
    #root { position: absolute; inset: 0; overflow: hidden; }
    #ov-mount { position: absolute; inset: 0; }
  </style>
  <div id="root" data-composition-id="ov" data-width="${W}" data-height="${H}"><div id="ov-mount"></div></div>
  <script>MV.overlay("ov", ${js({items: ad.items, duration: ad.duration, fps: FPS, width: W, height: H})});</script>
</template>
`);
  hosts.push({id: 'ov', start: 0, dur: totalFrames, z: 1});
} else {
  scenes.forEach((s, i) => {
    if (LOOK_ONLY) return;
    if (isolate && isolate.scene !== i) return;
    const id = `s${String(i + 1).padStart(2, '0')}`;
    const start = isolate ? 0 : starts[i];
    if (RANGE) {
      const [a, b] = RANGE, from = Math.max(starts[i], a), to = Math.min(starts[i] + frames[i], b);
      if (to <= from) return;
      if (s.type === 'custom' && s.html) throw new Error(`scene ${i + 1}: a custom scene can't start part-way in (--range) - render the whole ad`);
      write(`compositions/${id}.html`, sceneFile(id, s, i, frames[i], {offset: from - starts[i], hostFrames: to - from}));
      hosts.push({id, start: from - a, dur: to - from, z: i + 1});
      return;
    }
    if (s.type === 'custom' && s.html) {
      // a hand-written HyperFrames scene: mounted as written; its root's data-composition-id must be the host id
      const src = A(path.join('custom', s.html.replace(/^custom\//, '')));
      if (!fs.existsSync(src)) throw new Error(`scene ${i + 1}: custom scene ${src} not found`);
      const text = fs.readFileSync(src, 'utf8');
      const cid = text.match(/data-composition-id="([^"]+)"/)?.[1];
      if (!cid) throw new Error(`scene ${i + 1}: ${s.html} has no data-composition-id on its root`);
      write(`compositions/${cid}.html`, text);
      hosts.push({id: cid, start, dur: frames[i], z: i + 1});
      return;
    }
    write(`compositions/${id}.html`, sceneFile(id, s, i, frames[i]));
    hosts.push({id, start, dur: frames[i], z: i + 1});
  });
}
const withLook = LOOK_ONLY || (!isolate && !OVERLAY && (!LAYER || argv.includes('--with-look')));
// the look's clock restarts at every scene window (where a scene's transition begins). For a --range render it is given
// relative to the window, so the window's HTML - and its cache key - doesn't change when an earlier scene changes length.
const lookClock = () => {
  const cuts = [...new Set(starts.slice(1))].sort((x, y) => x - y);
  if (!RANGE) return {offset: 0, cuts};
  const [a, b] = RANGE, c0 = Math.max(0, ...cuts.filter((c) => c <= a));
  return {offset: a - c0, cuts: cuts.filter((c) => c > a && c < b).map((c) => c - c0)};
};
if (withLook && LOOK && LOOK !== 'clean') {
  write('compositions/look.html', `<template>
  <style>
    #root { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
    #look-mount { position: absolute; inset: 0; }
  </style>
  <div id="root" data-composition-id="look" data-width="${W}" data-height="${H}"><div id="look-mount"></div></div>
  <script>MV.look("look", ${js({look: LOOK, duration: (RANGE ? RANGE[1] - RANGE[0] : totalFrames) / FPS, fps: FPS, width: W, height: H, ...lookClock()})});</script>
</template>
`);
  hosts.push({id: 'look', start: 0, dur: RANGE ? RANGE[1] - RANGE[0] : totalFrames, z: 1000});
}
if (LOOK_ONLY && !hosts.length) { console.log(`  ${name}: the look is "${LOOK}" - no look layer to render`); process.exit(3); }
const rootDur = isolate ? frames[isolate.scene] : RANGE ? RANGE[1] - RANGE[0] : totalFrames;
write('index.html', `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${esc(name)}</title>
    <script>window.MV_THEME = ${js(theme)}; window.MV_MOTIFS = ${js(motifs)};</script>
    <script src="assets/vendor/gsap.min.js"></script>
    <script src="assets/vendor/mv-runtime.js"></script>
    <style>
      html, body { margin: 0; padding: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: ${transparent ? 'transparent' : '#000'}; }
      #root { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; }
      .mv-scene { position: absolute; inset: 0; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${secsFloor(rootDur)}" data-width="${W}" data-height="${H}">
${hosts.map((hh) => `      <div id="${hh.id}" class="mv-scene" data-composition-id="${hh.id}" data-composition-src="compositions/${hh.id}.html" data-start="${secs(hh.start)}" data-duration="${secs(hh.dur)}" data-track-index="${hh.z}" data-track-kind="graphics" data-width="${W}" data-height="${H}" style="z-index: ${hh.z}"></div>`).join('\n')}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`);

// ---- render with the pinned HyperFrames (telemetry and update checks off for this process)
const cliPkg = path.join(TOOLS, 'node_modules', 'hyperframes', 'package.json');
if (!fs.existsSync(cliPkg)) { console.error(`  HyperFrames is not installed in ${TOOLS} - run hf_init.mjs`); process.exit(1); }
const pkg = readJ(cliPkg);
const cli = path.join(TOOLS, 'node_modules', 'hyperframes', typeof pkg.bin === 'string' ? pkg.bin : Object.values(pkg.bin)[0]);
const env = {...process.env, HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1', HYPERFRAMES_NO_UPDATE_CHECK: '1', HYPERFRAMES_NO_AUTO_INSTALL: '1', HYPERFRAMES_SKIP_SKILLS: '1'};
const hf = (args, quiet = true) => spawnSync(process.execPath, [cli, ...args], {cwd: buildDir, env, encoding: 'utf8', stdio: quiet ? 'pipe' : 'inherit', maxBuffer: 1 << 26});

if (argv.includes('--lint')) {
  const l = hf(['lint']);
  process.stdout.write((l.stdout || '') + (l.stderr || ''));
}
fs.mkdirSync(path.dirname(out), {recursive: true});
const t0 = Date.now();
let cacheFile = null;
if (RANGE) {
  // a window's identity: the HTML written for it (scene data, offsets, media names - which carry their source's hash),
  // the bytes of every asset it loads, and the render settings
  const hsh = crypto.createHash('sha1');
  hsh.update(JSON.stringify({W, H, FPS, draft: argv.includes('--draft'), blur: BLUR, v: 1}));
  const walk = (d) => { for (const e of fs.readdirSync(d, {withFileTypes: true}).sort((x, y) => x.name.localeCompare(y.name))) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(html|js|json)$/i.test(e.name) || /logo/i.test(e.name)) hsh.update(e.name).update(fs.readFileSync(p));
    else { const st = fs.statSync(p); hsh.update(`${path.relative(buildDir, p)}|${st.size}|${Math.round(st.mtimeMs)}`); }
  } };
  for (const d of ['index.html', 'compositions', 'assets']) { const p = path.join(buildDir, d); if (fs.existsSync(p)) (fs.statSync(p).isDirectory() ? walk(p) : hsh.update(fs.readFileSync(p))); }
  cacheFile = path.join(project, 'build', '_windows', 'cache', `${hsh.digest('hex').slice(0, 16)}.mp4`);
  if (fs.existsSync(cacheFile)) {
    fs.copyFileSync(cacheFile, out);
    console.log(`  window ${RANGE[0]}-${RANGE[1]} from cache`);
    fs.rmSync(buildDir, {recursive: true, force: true});
    process.exit(0);
  }
}
const render = (output, extra) => {
  const r = hf(['render', '--output', output, '--quality', argv.includes('--draft') ? 'draft' : 'high', ...extra]);
  const log = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0 || !fs.existsSync(output)) {
    console.error(log.split('\n').filter((x) => /error|fail|warn/i.test(x)).slice(-15).join('\n') || log.slice(-3000));
    console.error(`\n  render failed - the generated project is ${buildDir} (open it with: npx hyperframes preview)`);
    process.exit(1);
  }
  for (const line of log.split('\n')) if (/\[WARN\].*(sparse keyframes|font|missing|not found)/i.test(line)) console.log('  ' + line.trim().slice(0, 220));
};
if (BLUR) {
  const tmp = path.join(buildDir, 'render60.mp4');
  render(tmp, ['--fps', '60']);
  ffmpeg(['-i', tmp, '-vf', "tmix=frames=2:weights='1 1',fps=30", '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  fs.rmSync(tmp, {force: true});
} else {
  if (format === 'png-sequence') fs.rmSync(out, {recursive: true, force: true});
  render(out, format === 'mp4' ? [] : ['--format', format]);
}
if (cacheFile) { fs.mkdirSync(path.dirname(cacheFile), {recursive: true}); fs.copyFileSync(out, cacheFile); if (!argv.includes('--keep')) fs.rmSync(buildDir, {recursive: true, force: true}); }
console.log(`  ${CAPTIONS ? `captions (${ad.style || 'pop'})` : OVERLAY ? 'overlay' : isolate ? `scene ${isolate.scene + 1} / ${isolate.part}` : LOOK_ONLY ? `look ${LOOK}` : RANGE ? `window ${RANGE[0]}-${RANGE[1]}` : `${scenes.length} scenes${LAYER ? ` [${LAYER}]` : ''}`} -> ${out}  (${(rootDur / FPS).toFixed(2)}s, ${((Date.now() - t0) / 1000).toFixed(1)}s to render${BLUR ? ', motion blur' : ''}${!isolate && !OVERLAY && LOOK !== 'clean' ? `, look ${LOOK}` : ''})`);
if (argv.includes('--keep') || argv.includes('--lint')) console.log(`  project: ${buildDir}  (npx hyperframes preview, from there)`);

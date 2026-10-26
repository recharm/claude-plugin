#!/usr/bin/env node
/**
 * export_nle.mjs - hand the ad to an editor as a layered Premiere Pro / DaVinci Resolve timeline.
 *
 *   node export_nle.mjs edl.json [--out <folder>] [--alpha png|prores|qtrle] [--blur] [--jobs 3] [--no-otio]
 *
 * Run it after build_ad.mjs, on the same EDL. Motion-graphics segments (EDL "motion": <ad>.json) are taken apart
 * instead of handed over as one flat video:
 *
 *   V1   plates     the backgrounds and footage of every scene, with the ad's look and every transition baked in -
 *                   one opaque H.264 render, cut on V1 at each transition's midpoint (so a re-trim never shows a gap)
 *   V2-3 graphics   each scene's animations (charts, badges, packshots, the subject cut-out...) as its own transparent
 *                   clip, alternating tracks where scenes overlap; each one fades out across the next scene's transition
 *   V4-5 text       each scene's heading / sub / list as its own transparent clip
 *   V6   captions   the animated captions (transparent), plus captions.srt for a native caption track
 *   V7   overlays   the EDL's graphic overlays, if any
 *   V8   sources    the original clips under every footage scene, trimmed to match (track OFF - for re-cutting)
 *   V9   reference  the finished MP4 (track OFF - switch it on to compare)
 *   A1 voiceover, A2 music with the ducking as keyframes, A3 sound effects, A4 the clips' own sound (when kept)
 *   markers         one per scene: its line, its animations, its transition, its camera move
 *
 * Footage-only segments are placed as clips with cross dissolves (as export_premiere.mjs always did).
 *
 * Transparent clips are PNG-in-MOV by default: lossless, and these graphics are mostly empty pixels, so a 3s graphic is
 * a few MB (ProRes 4444 is ~4x bigger here). --alpha prores for pipelines that insist on ProRes, qtrle for Animation.
 * Layers are cached by content in <out>/media, so exporting again after a review edit re-renders only changed scenes.
 *
 * --verify  rebuild the picture from the exported layers exactly as the timeline places them (plates, graphics with their
 *           fades, text, captions) and compare it with the finished MP4, scene by scene: PSNR per scene and verify.jpg,
 *           a frame of each scene - finished ad on the left, the layers on the right. Run it once per new kind of ad.
 *
 * Writes <out>/sequence.xml (Final Cut Pro 7 XML - Premiere: File > Import; Resolve: File > Import > Timeline),
 * sequence.otio (OpenTimelineIO - Resolve 18.5+ imports it directly; needs the optional otio tool, see setup.md),
 * captions.srt, media/ and README.txt.
 */
import {spawn, spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildTimeline, probe, srt, stage} from './lib/timeline.mjs';
import {transitionFrames as tFrames} from './lib/transitions.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const edlFile = argv[0];
if (!edlFile || !fs.existsSync(edlFile)) { console.error('usage: node export_nle.mjs edl.json [--out <folder>] [--alpha png|prores|qtrle] [--blur] [--jobs 3]'); process.exit(2); }
const ALPHA = opt('--alpha', 'png');
if (!['png', 'prores', 'qtrle'].includes(ALPHA)) { console.error('--alpha png | prores | qtrle'); process.exit(2); }
const JOBS = Math.max(1, Number(opt('--jobs', 3)));
const ROOT = process.env.MAKE_VIDEO_ROOT || path.join(os.homedir(), '.claude', 'make-video');

const T = await buildTimeline(edlFile);
const out = path.resolve(opt('--out', path.join(T.base, `${T.name}-edit`)));
const mediaDir = path.join(out, 'media');
fs.mkdirSync(mediaDir, {recursive: true});
const used = new Set();
const FPS = Math.round(T.fps);
const fr = (s) => Math.round(s * FPS);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const urlOf = (p) => 'file://localhost/' + path.resolve(p).split(path.sep).join('/').split('/').map((seg, i) => (i === 0 && /^[A-Za-z]:$/.test(seg) ? seg.replace(':', '%3a') : encodeURIComponent(seg))).join('/');
const rate = `<rate><timebase>${FPS}</timebase><ntsc>FALSE</ntsc></rate>`;
const lin = (db) => Math.pow(10, db / 20);
const ffmpeg = (args) => { const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], {encoding: 'utf8'}); if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`); };
T.edl.segments.forEach((sg, i) => { if (sg.motion && T.clips[i]) T.clips[i].motion = path.resolve(T.base, sg.motion); });

// ---- the parts of a scene - keep in step with SceneView's show() in the runtime's Ad.tsx (and export_ae's partsOf)
const TEXT_PARTS = 'text,list,lowerthird';
const GRAPHIC_PARTS = '!base,!text,!list,!lowerthird';
const hasGraphics = (s) => (s.visuals || []).length > 0 || s.type === 'endcard' || (s.type === 'footage' && (s.cutout || s.ring)) || (s.type === 'custom' && !s.html) || !!s.ring;
const hasText = (s) => s.type !== 'endcard' && !(s.type === 'custom') && !!(s.text || s.sub || ['stat', 'compare', 'product', 'title'].includes(s.type) || s.type === 'list' || s.lowerThird);
const kindsOf = (s) => (s.visuals || []).map((v) => v.kind).filter((k) => !['particles', 'sparkles', 'rays', 'scribble'].includes(k));

// ---- renders, run JOBS at a time
const queue = [];
const runAll = async () => {
  let next = 0, failed = null;
  const one = (job) => new Promise((done) => {
    const c = spawn(process.execPath, [path.join(HERE, 'hf_build.mjs'), ...job.args], {env: process.env});
    let txt = '';
    c.stdout.on('data', (d) => (txt += d));
    c.stderr.on('data', (d) => (txt += d));
    c.on('close', (code) => {
      if (code !== 0) failed = failed || `${job.label}: render failed\n${txt.slice(-2000)}`;
      else { try { job.after?.(); console.log(`  render   ${job.label}  ok`); } catch (e) { failed = failed || `${job.label}: ${e.message}`; } }
      done();
    });
  });
  await Promise.all(Array.from({length: Math.min(JOBS, queue.length)}, async () => { while (next < queue.length && !failed) await one(queue[next++]); }));
  if (failed) { console.error(failed); process.exit(1); }
};
/** A transparent PNG sequence from hf_build -> one alpha MOV in the chosen codec. */
const seqToMov = (dir, mov) => {
  const pngs = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
  if (!pngs.length) throw new Error(`no frames in ${dir}`);
  const m = pngs[0].match(/^(.*?)(\d+)(\.png)$/);
  const pattern = path.join(dir, `${m[1]}%0${m[2].length}d${m[3]}`);
  const codec = ALPHA === 'prores' ? ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0']
    : ALPHA === 'qtrle' ? ['-c:v', 'qtrle', '-pix_fmt', 'argb'] : ['-c:v', 'png', '-pix_fmt', 'rgba'];
  const tmp = mov.replace(/\.mov$/, '.tmp.mov');
  ffmpeg(['-framerate', String(FPS), '-start_number', String(Number(m[2])), '-i', pattern, ...codec, tmp]);
  fs.renameSync(tmp, mov);
  fs.rmSync(dir, {recursive: true, force: true});
};

// ---- take every motion segment apart into plates, graphics and text
const runtime = path.join(HERE, '..', 'assets', 'hyperframes-runtime', 'dist', 'mv-runtime.js');
const runtimeHash = fs.existsSync(runtime) ? crypto.createHash('sha1').update(fs.readFileSync(runtime)).digest('hex').slice(0, 8) : '';
const mg = []; // {clip, scenes:[{i, s, start, end, cut0, cut1, tOut, graphics?, text?, label, notes}], plates}
for (const c of T.clips.filter((x) => x.motion)) {
  const adFile = c.motion, project = path.resolve(path.dirname(adFile), '..');
  const ad = JSON.parse(fs.readFileSync(adFile, 'utf8'));
  const scenes = ad.scenes || [];
  const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
  const brandStamp = read(path.join(project, 'theme.json')) + read(path.join(project, 'motifs.json'));
  const frames = scenes.map((s) => Math.max(1, Math.round(s.duration * FPS)));
  const tIn = scenes.map((s, i) => (i > 0 && s.transition ? tFrames(s.transition, FPS) : 0));
  const starts = [];
  scenes.forEach((s, i) => starts.push(i === 0 ? 0 : starts[i - 1] + frames[i - 1] - tIn[i]));
  const total = starts[starts.length - 1] + frames[frames.length - 1];
  const stem = `seg${c.index + 1}`;
  const key = (o) => crypto.createHash('sha1').update(JSON.stringify([o, brandStamp, runtimeHash, ALPHA])).digest('hex').slice(0, 8);

  // the plates: every scene's base layer with the look and the transitions, the whole segment in one render
  // the plates' key leaves out what lives on the graphics and text layers, so a text or graphic edit doesn't re-render them
  const NOT_PLATE = ['visuals', 'text', 'sub', 'strike', 'preset', 'textY', 'glitch', 'lowerThird', 'items', 'marker', 'ring', 'cutout', 'title', 'value', 'label', '_plan'];
  const platesKey = key({scenes: scenes.map((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !NOT_PLATE.includes(k)))), look: ad.look, blur: argv.includes('--blur')});
  const plates = path.join(mediaDir, `${stem}_plates_${platesKey}.mp4`);
  if (!fs.existsSync(plates)) {
    const tmp = plates.replace(/\.mp4$/, '.tmp.mp4');
    queue.push({label: `${stem} plates (backgrounds, footage, look, transitions)`, args: [adFile, '--layer', 'base,custom', '--with-look', '--out', tmp, ...(argv.includes('--blur') ? ['--blur'] : [])],
      // re-encoded for editing: visually lossless (CRF 18), a keyframe every half second so the plate scrubs smoothly.
      // A grain look (film, paper) is most of this file's size - noise doesn't compress
      after: () => { ffmpeg(['-i', tmp, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-g', String(Math.round(FPS / 2)), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', plates]); fs.rmSync(tmp, {force: true}); }});
  }
  const entry = {clip: c, scenes: [], plates, total};
  scenes.forEach((s, i) => {
    const start = starts[i] / FPS, end = (starts[i] + frames[i]) / FPS;
    const cut0 = i === 0 ? 0 : (starts[i] + tIn[i] / 2) / FPS;
    const cut1 = i === scenes.length - 1 ? total / FPS : (starts[i + 1] + tIn[i + 1] / 2) / FPS;
    if (end <= c.in || start >= c.out) return; // trimmed out of the edit
    const kinds = kindsOf(s);
    const label = `S${String(i + 1).padStart(2, '0')}${kinds[0] ? ` ${kinds[0]}` : s.type === 'footage' ? ' footage' : ` ${s.type}`}`;
    const sc = {i, s, start, end, cut0, cut1, tOut: (tIn[i + 1] || 0) / FPS, label,
      notes: [s.text ? `"${s.text}"` : '', kinds.length ? `animates: ${kinds.join(', ')}` : '', s.transition ? `enters with ${s.transition.type}${s.transition.variant ? `/${s.transition.variant}` : ''}` : '',
        s.type === 'footage' ? `footage ${s.src}${s.camera ? `, camera ${s.camera} (baked into the plate)` : ''}${s.cutout ? ', subject cut-out on the graphics layer' : ''}` : `background ${s.bg || ''} ${s.bgStyle || ''}`.trim(),
        s._plan ? `plan: ${typeof s._plan === 'string' ? s._plan : JSON.stringify(s._plan)}` : ''].filter(Boolean).join(' | ')};
    // a scene's layer depends on itself and the transitions on either side of it
    const ctx = {s, i, enter: i > 0 ? s.transition : null, exit: scenes[i + 1]?.transition || null};
    for (const [kind, spec, wanted] of [['graphics', GRAPHIC_PARTS, hasGraphics(s) && !(s.type === 'custom' && s.html)], ['text', TEXT_PARTS, hasText(s)]]) {
      if (!wanted) continue;
      const mov = path.join(mediaDir, `${stem}_${label.replace(/\s+/g, '_')}_${kind}_${key({...ctx, kind})}.mov`);
      sc[kind] = mov;
      if (fs.existsSync(mov)) continue;
      const seq = mov.replace(/\.mov$/, '__frames');
      fs.rmSync(seq, {recursive: true, force: true});
      queue.push({label: `${label} ${kind}`, args: [adFile, '--isolate', `${i}:${spec}`, '--format', 'png-sequence', '--out', seq], after: () => seqToMov(seq, mov)});
    }
    entry.scenes.push(sc);
  });
  mg.push(entry);
}
// the animated captions build_ad rendered (a transparent ProRes in its work folder) -> the chosen alpha codec
const capSrc = path.resolve(T.base, T.edl.workDir ?? '.adwork', 'captions.mov');
let capMov = null;
if (T.edl.captionStyle?.animated && fs.existsSync(capSrc)) {
  capMov = path.join(mediaDir, `captions_${crypto.createHash('sha1').update(String(fs.statSync(capSrc).mtimeMs) + ALPHA).digest('hex').slice(0, 8)}.mov`);
  if (!fs.existsSync(capMov)) {
    const codec = ALPHA === 'prores' ? ['-c:v', 'copy'] : ALPHA === 'qtrle' ? ['-c:v', 'qtrle', '-pix_fmt', 'argb'] : ['-c:v', 'png', '-pix_fmt', 'rgba'];
    ffmpeg(['-i', capSrc, '-an', ...codec, capMov]);
  }
}
const pending = queue.length;
if (pending) console.log(`\n  rendering ${pending} layer${pending === 1 ? '' : 's'} (${JOBS} at a time)...`);
await runAll();

// ---- the XML (Final Cut Pro 7 / xmeml v4: Premiere and Resolve both import it)
const files = new Map();
let fileN = 0;
const fileRef = (src, stagedName, keepInPlace = false) => {
  if (files.has(src)) return `<file id="${files.get(src).id}"/>`;
  const p = keepInPlace ? src : stage(src, mediaDir, stagedName, used);
  const info = probe(p);
  const id = `file-${++fileN}`;
  files.set(src, {id, path: p});
  const v = info?.hasVideo ? `<video><samplecharacteristics>${rate}<width>${info.width}</width><height>${info.height}</height><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video>` : '';
  const a = info?.hasAudio ? `<audio><samplecharacteristics><depth>16</depth><samplerate>${info.sampleRate}</samplerate></samplecharacteristics><channelcount>${info.channels}</channelcount></audio>` : '';
  return `<file id="${id}"><name>${esc(path.basename(p))}</name><pathurl>${esc(urlOf(p))}</pathurl>${rate}<duration>${fr(info?.duration || 0)}</duration>` +
    `<timecode>${rate}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode><media>${v}${a}</media></file>`;
};
const marker = (name, comment, at, dur = 0) => `<marker><comment>${esc(comment)}</comment><name>${esc(name)}</name><in>${fr(at)}</in><out>${dur ? fr(at + dur) : -1}</out></marker>`;
const levels = (keys) => `<filter><effect><name>Audio Levels</name><effectid>audiolevels</effectid><effectcategory>audiolevels</effectcategory><effecttype>audiolevels</effecttype><mediatype>audio</mediatype>` +
  `<parameter authoringApp="PremierePro"><parameterid>level</parameterid><name>Level</name><valuemin>0</valuemin><valuemax>3.98109</valuemax><value>${lin(keys[0][1]).toFixed(5)}</value>` +
  (keys.length > 1 ? keys.map(([f, db]) => `<keyframe><when>${f}</when><value>${lin(db).toFixed(5)}</value></keyframe>`).join('') : '') + `</parameter></effect></filter>`;
const motion = (scale) => `<filter><effect><name>Basic Motion</name><effectid>basic</effectid><effectcategory>motion</effectcategory><effecttype>motion</effecttype><mediatype>video</mediatype>` +
  `<parameter authoringApp="PremierePro"><parameterid>scale</parameterid><name>Scale</name><valuemin>0</valuemin><valuemax>1000</valuemax><value>${scale.toFixed(2)}</value></parameter></effect></filter>`;
const dissolve = (start, end, alignment) => `<transitionitem><start>${fr(start)}</start><end>${fr(end)}</end><alignment>${alignment}</alignment>${rate}<effect><name>Cross Dissolve</name><effectid>Cross Dissolve</effectid><effectcategory>Dissolve</effectcategory><effecttype>transition</effecttype><mediatype>video</mediatype></effect></transitionitem>`;
let clipN = 0;
const clipitem = ({name, src, staged, keep, start, end, inS, mediaDur, video = true, audioTrack = 1, extra = '', markers = '', alpha = false}) => {
  const id = `clipitem-${++clipN}`;
  return `<clipitem id="${id}"><name>${esc(name)}</name><enabled>TRUE</enabled><duration>${fr(mediaDur)}</duration>${rate}` +
    `<start>${fr(start)}</start><end>${fr(end)}</end><in>${fr(inS)}</in><out>${fr(inS) + (fr(end) - fr(start))}</out>` +
    `${alpha ? '<alphatype>straight</alphatype>' : ''}${fileRef(src, staged, keep)}${video ? '' : `<sourcetrack><mediatype>audio</mediatype><trackindex>${audioTrack}</trackindex></sourcetrack>`}${extra}${markers}</clipitem>`;
};
const track = (items, enabled = true) => `<track><enabled>${enabled ? 'TRUE' : 'FALSE'}</enabled><locked>FALSE</locked>${items.join('')}</track>`;
const scaleFor = (inf, fit) => {
  const i = inf || {width: T.W, height: T.H};
  return (fit === 'contain' || fit === 'blurfill' ? Math.min(T.W / i.width, T.H / i.height) : Math.max(T.W / i.width, T.H / i.height)) * 100;
};

// V1/V2: footage clips alternate where a transition overlaps them; motion segments put their plates down butt-joined
const base = [[], []];
const seqMarkers = [];
const gfx = [[], []], txt = [[], []], src = [];
const comp = {plates: [], graphics: [[], []], text: [[], []], scenes: [], footage: false}; // what --verify composites
let lane = 0;
for (const c of T.clips) {
  if (c.index > 0 && c.trans.dur > 0) lane ^= 1;
  const toOut = (t) => c.start + (t - c.in); // motion time -> output time
  const m = mg.find((e) => e.clip === c);
  if (!m) {
    comp.footage = true;
    const notes = [c.beat, c.trans.dur ? `enters with ${c.trans.name} ${c.trans.dur.toFixed(2)}s (here: cross dissolve)` : '', c.move ? `camera move ${c.move} ${Math.round(c.moveAmount * 100)}% - add Scale/Position keyframes` : '',
      c.fit === 'blurfill' ? 'rendered with a blurred fill behind it - duplicate the clip below, scale it up and add Gaussian Blur' : ''].filter(Boolean).join(' | ');
    let x = c.trans.dur > 0 ? dissolve(c.start, c.start + c.trans.dur, 'start-black') : '';
    x += clipitem({name: `${c.index + 1} ${c.symbol}`, src: c.file, staged: `${String(c.index + 1).padStart(2, '0')}_${c.symbol}${path.extname(c.file)}`,
      start: c.start, end: c.end, inS: c.in, mediaDur: c.info?.duration || c.out, extra: motion(scaleFor(c.info, c.fit)), markers: notes ? marker(c.symbol, notes, 0) : ''});
    base[lane].push(x);
    seqMarkers.push(marker(`${c.index + 1}. ${c.symbol}`, notes || c.symbol, c.start));
    continue;
  }
  const platesDur = m.total / FPS;
  let k = 0;
  for (const sc of m.scenes) {
    const a = Math.max(c.in, sc.cut0), b = Math.min(c.out, sc.cut1);
    if (b > a) {
      base[lane].push((k === 0 && c.trans.dur > 0 ? dissolve(c.start, c.start + c.trans.dur, 'start-black') : '') +
        clipitem({name: `${sc.label} plate`, src: m.plates, staged: path.basename(m.plates), keep: true, start: toOut(a), end: toOut(b), inS: a, mediaDur: platesDur,
          markers: marker(sc.label, sc.notes, 0)}));
      k++;
    }
    seqMarkers.push(marker(sc.label, sc.notes, Math.max(c.start, toOut(sc.start))));
    if (b > a) comp.plates.push({file: m.plates, start: toOut(a), inS: a, dur: b - a});
    comp.scenes.push({label: sc.label, from: Math.max(c.start, toOut(sc.cut0)), to: Math.min(c.end, toOut(sc.cut1))});
    // graphics and text: the scene's whole span (its own enter animation), fading out across the next scene's transition
    for (const [kind, lanes] of [['graphics', gfx], ['text', txt]]) {
      if (!sc[kind]) continue;
      const a2 = Math.max(c.in, sc.start), b2 = Math.min(c.out, sc.end);
      if (b2 <= a2) continue;
      const L = lanes[0].length && lanes[0].lastEnd > toOut(a2) + 1e-6 ? 1 : 0;
      const item = clipitem({name: `${sc.label} ${kind}`, src: sc[kind], staged: path.basename(sc[kind]), keep: true, start: toOut(a2), end: toOut(b2), inS: a2 - sc.start,
        mediaDur: sc.end - sc.start, alpha: true}) + (sc.tOut > 0 && b2 === sc.end ? dissolve(toOut(b2) - sc.tOut, toOut(b2), 'end-black') : '');
      lanes[L].push(item);
      comp[kind][L].push({file: sc[kind], start: toOut(a2), inS: a2 - sc.start, dur: b2 - a2, fadeOut: sc.tOut > 0 && b2 === sc.end ? sc.tOut : 0});
      lanes[L].lastEnd = toOut(b2);
      if (L === 0) lanes[0].lastEnd = toOut(b2);
    }
    // the original clip under a footage scene, trimmed to the plate's stretch (for re-cutting; the plate has the move baked in)
    const s = sc.s;
    if (s.type === 'footage' && s.src && !/^https?:/.test(s.src)) {
      const clipFile = path.resolve(path.dirname(c.motion), '..', 'assets', s.src.replace(/^assets\//, ''));
      if (fs.existsSync(clipFile)) {
        const a3 = Math.max(c.in, sc.cut0), b3 = Math.min(c.out, sc.cut1), inf = probe(clipFile);
        if (b3 > a3) src.push(clipitem({name: `${sc.label} source ${path.basename(clipFile)}`, src: clipFile, staged: `${sc.label.replace(/\s+/g, '_')}_${path.basename(clipFile)}`,
          start: toOut(a3), end: toOut(b3), inS: (s.trimBefore || 0) + (a3 - sc.start), mediaDur: inf?.duration || 0, extra: motion(scaleFor(inf, s.fit))}));
      }
    }
  }
}
// two alternating lanes per layer kind: a lane is only needed when that kind has something on it
const vXml = [track(base[0]), base[1].length ? track(base[1]) : null, gfx[0].length ? track(gfx[0]) : null, gfx[1].length ? track(gfx[1]) : null,
  txt[0].length ? track(txt[0]) : null, txt[1].length ? track(txt[1]) : null,
  capMov ? track([clipitem({name: 'captions (animated)', src: capMov, staged: path.basename(capMov), keep: true, start: 0, end: T.total, inS: 0, mediaDur: probe(capMov)?.duration || T.total, alpha: true})]) : null,
  T.overlays.length ? track(T.overlays.map((o, k) => clipitem({name: `overlay ${k + 1}`, src: o.file, staged: `overlay_${k + 1}${path.extname(o.file)}`, start: o.at, end: Math.min(T.total, o.at + o.dur), inS: 0, mediaDur: o.dur, alpha: true}))) : null,
  src.length ? track(src, false) : null].filter(Boolean);
const finalMp4 = T.edl.output ? path.resolve(T.base, T.edl.output) : null;
if (finalMp4 && fs.existsSync(finalMp4)) vXml.push(track([clipitem({name: 'REFERENCE - the finished ad', src: finalMp4, staged: `REFERENCE_${path.basename(finalMp4)}`, start: 0, end: T.total, inS: 0, mediaDur: probe(finalMp4)?.duration || T.total})], false));

// ---- audio (as export_premiere): voiceover, music with ducking keyframes, sfx, the clips' own sound
const aXml = [];
if (T.vo) aXml.push(track([clipitem({name: 'Voiceover', src: T.vo.file, staged: `voiceover${path.extname(T.vo.file)}`, start: T.vo.start,
  end: Math.min(T.total, T.vo.start + T.vo.info.duration), inS: 0, mediaDur: T.vo.info.duration, video: false, extra: levels([[0, T.vo.gainDb]])})]));
if (T.music) {
  const m = T.music, end = Math.min(T.total, m.info.duration);
  const keys = [[0, m.gainDb]];
  if (m.duck) for (const [a, b] of m.speech) {
    if (a >= end) break;
    keys.push([fr(Math.max(0, a - 0.1)), m.gainDb], [fr(a), m.gainDb + m.duckDb], [fr(Math.min(end, b)), m.gainDb + m.duckDb], [fr(Math.min(end, b + 0.3)), m.gainDb]);
  }
  keys.push([fr(Math.max(0, end - m.fadeOut)), keys[keys.length - 1][1]], [fr(end), -60]);
  aXml.push(track([clipitem({name: 'Music', src: m.file, staged: `music${path.extname(m.file)}`, start: 0, end, inS: 0, mediaDur: m.info.duration, video: false,
    extra: levels(keys.filter((k, i, a) => i === 0 || k[0] > a[i - 1][0]))})]));
}
if (T.sfx.length) aXml.push(track(T.sfx.map((s, k) => clipitem({name: s.name, src: s.file, staged: `sfx_${String(k + 1).padStart(2, '0')}_${path.basename(s.file)}`,
  start: s.at, end: Math.min(T.total, s.at + s.info.duration), inS: 0, mediaDur: s.info.duration, video: false, extra: levels([[0, s.gainDb]])}))));
if (T.keepClipAudio) aXml.push(track(T.clips.filter((c) => !c.motion && c.info?.hasAudio).map((c) => clipitem({name: `${c.symbol} audio`, src: c.file,
  staged: `${String(c.index + 1).padStart(2, '0')}_${c.symbol}${path.extname(c.file)}`, start: c.start, end: c.end, inS: c.in, mediaDur: c.info.duration, video: false}))));

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
<sequence id="sequence-1"><name>${esc(T.name)}</name><duration>${fr(T.total)}</duration>${rate}
<timecode>${rate}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>
<media>
<video><format><samplecharacteristics>${rate}<width>${T.W}</width><height>${T.H}</height><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance><colordepth>24</colordepth></samplecharacteristics></format>
${vXml.join('\n')}
</video>
<audio><numOutputChannels>2</numOutputChannels><format><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics></format>
${aXml.join('\n')}
</audio>
</media>
${seqMarkers.join('\n')}
</sequence>
</xmeml>
`;
fs.writeFileSync(path.join(out, 'sequence.xml'), xml);
// layers of earlier versions (other content hashes) aren't on this timeline any more: drop them so media/ stays the
// size of this edit
const onTimeline = new Set([...files.values()].map((f) => path.resolve(f.path)));
for (const f of fs.readdirSync(mediaDir)) {
  const p = path.join(mediaDir, f);
  if (/^(seg\d+_|captions_)/.test(f) && !onTimeline.has(path.resolve(p))) fs.rmSync(p, {recursive: true, force: true});
}
if (T.captions.length) fs.writeFileSync(path.join(out, 'captions.srt'), srt(T.captions));

// ---- OpenTimelineIO copy (Resolve 18.5+ imports .otio natively) - also a check that the XML parses as FCP7 XML
let otio = 'skipped (--no-otio)';
if (!argv.includes('--no-otio')) {
  const py = path.join(ROOT, 'tools', 'otio', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (!fs.existsSync(py)) otio = 'skipped - the otio tool is not installed (setup.md -> OpenTimelineIO)';
  else {
    const r = spawnSync(py, ['-c', `import sys, opentimelineio as otio
t = otio.adapters.read_from_file(sys.argv[1], adapter_name="fcp_xml")
otio.adapters.write_to_file(t, sys.argv[2])
v = [tr for tr in t.tracks if tr.kind == "Video"]; a = [tr for tr in t.tracks if tr.kind == "Audio"]
print(len(v), len(a), sum(len(list(tr.find_clips())) for tr in t.tracks), t.duration().to_seconds())`, path.join(out, 'sequence.xml'), path.join(out, 'sequence.otio')], {encoding: 'utf8'});
    otio = r.status === 0 ? (() => { const [v, a, n, d] = r.stdout.trim().split(/\s+/); return `sequence.otio  ${v} video + ${a} audio tracks, ${n} clips, ${Number(d).toFixed(2)}s (the XML parsed cleanly)`; })()
      : `FAILED - the XML did not parse as FCP7 XML:\n${(r.stderr || '').split('\n').slice(-6).join('\n')}`;
  }
}

const nG = gfx[0].length + gfx[1].length, nT = txt[0].length + txt[1].length;
fs.writeFileSync(path.join(out, 'README.txt'), [
  `${T.name} - layered edit for Premiere Pro / DaVinci Resolve`, '',
  'PREMIERE PRO: File > Import > sequence.xml. A bin with the sequence and its media appears; open the sequence.',
  'RESOLVE: File > Import > Timeline > sequence.xml (or sequence.otio on 18.5+). Untick "Automatically set project settings"',
  `  only if your project is already ${T.W}x${T.H} @ ${FPS}fps. If clips come in offline, relink them to the media/ folder.`,
  '  Transparent clips: if a graphic shows a black box, select it > Clip Attributes > Alpha mode: Straight.',
  T.captions.length ? 'CAPTIONS: the animated captions are on their own track; for native captions import captions.srt instead and switch that track off.' : '',
  '', 'TRACKS (bottom to top):',
  `  V1     plates - backgrounds and footage with the look and every transition baked in, cut at each transition's midpoint`,
  `  V2-3   graphics - one transparent clip per scene (${nG}), fading out across the next transition`,
  `  V4-5   text - headings / subs / lists, one transparent clip per scene (${nT})`,
  capMov ? '  then   captions (animated, transparent)' : '',
  T.overlays.length ? '  then   overlays from the EDL' : '',
  src.length ? '  then   sources (OFF) - the original clip under every footage scene, trimmed to match; the plate has the camera move baked in' : '',
  finalMp4 ? '  top    REFERENCE (OFF) - the finished ad; switch it on to compare' : '',
  '  A1 voiceover, A2 music (ducking keyframed), A3 sound effects, A4 clip sound (when kept)',
  '', 'Markers name every scene: its line, its animations, its transition and its footage / camera move.',
  `Transparent clips are ${ALPHA === 'png' ? 'PNG-in-MOV (lossless)' : ALPHA === 'prores' ? 'ProRes 4444' : 'QuickTime Animation'}.`,
  'The finished MP4 was loudness-normalised to -14 LUFS; this timeline is not - normalise on export if you deliver from here.',
  'Not carried over as live effects: the transitions and camera moves are baked into the plates; the graphics and text are renders',
  '(change them in the ad JSON and export again - only the changed scenes re-render).',
].filter((l) => l !== '').join('\n'));

const mb = (p) => (fs.existsSync(p) ? fs.statSync(p).size / 1048576 : 0);
const mediaMb = [...files.values()].reduce((a, f) => a + mb(f.path), 0);
console.log(`\n  layered edit -> ${out}`);
console.log(`  sequence.xml  ${T.W}x${T.H} @ ${FPS}fps, ${T.total.toFixed(2)}s - ${vXml.length} video tracks (${nG} graphics, ${nT} text clips), ${aXml.length} audio tracks, ${seqMarkers.length} markers`);
console.log(`  ${otio}`);
console.log(`  media/        ${files.size} files, ${mediaMb.toFixed(0)} MB${T.captions.length ? `   captions.srt  ${T.captions.length} captions` : ''}`);
console.log('  Premiere: File > Import > sequence.xml.  Resolve: File > Import > Timeline. See README.txt.\n');

// ---- --verify: composite the layers the way the NLE will, compare with the finished ad
if (argv.includes('--verify')) {
  if (!finalMp4 || !fs.existsSync(finalMp4)) { console.log('  verify   skipped - the finished MP4 (EDL "output") is not there'); process.exit(0); }
  if (comp.footage || !comp.plates.length) { console.log('  verify   skipped - only motion-graphics segments are composited for the check'); process.exit(0); }
  const vdir = path.join(out, '.verify');
  fs.mkdirSync(vdir, {recursive: true});
  const inputs = [], chain = [];
  let last = 'base', n = 0;
  // plates butt-joined: one trimmed input per plate clip, concatenated
  comp.plates.forEach((p) => inputs.push('-ss', p.inS.toFixed(4), '-t', p.dur.toFixed(4), '-i', p.file));
  chain.push(`${comp.plates.map((_, k) => `[${k}:v]setpts=PTS-STARTPTS[p${k}]`).join(';')};${comp.plates.map((_, k) => `[p${k}]`).join('')}concat=n=${comp.plates.length}:v=1:a=0,fps=${FPS},format=yuva420p[base]`);
  let idx = comp.plates.length;
  const layers = [...comp.graphics[0], ...comp.graphics[1], ...comp.text[0], ...comp.text[1]];
  if (capMov) layers.push({file: capMov, start: 0, inS: 0, dur: T.total, fadeOut: 0});
  for (const L of layers) {
    inputs.push('-ss', L.inS.toFixed(4), '-t', L.dur.toFixed(4), '-i', L.file);
    const fade = L.fadeOut > 0 ? `,fade=t=out:st=${(L.start + L.dur - L.fadeOut).toFixed(4)}:d=${L.fadeOut.toFixed(4)}:alpha=1` : '';
    chain.push(`[${idx}:v]format=rgba,setpts=PTS-STARTPTS+${L.start.toFixed(4)}/TB${fade}[l${n}]`);
    chain.push(`[${last}][l${n}]overlay=eof_action=pass:format=auto[o${n}]`);
    last = `o${n}`; n++; idx++;
  }
  const rebuilt = path.join(vdir, 'rebuilt.mp4');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', chain.join(';') + `;[${last}]format=yuv420p[v]`, '-map', '[v]', '-t', T.total.toFixed(3),
    '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', rebuilt], {encoding: 'utf8', maxBuffer: 1 << 26});
  if (r.status !== 0) { console.log(`  verify   could not composite the layers: ${r.stderr.slice(-600)}`); process.exit(1); }
  const log = path.join(vdir, 'psnr.log');
  spawnSync('ffmpeg', ['-v', 'error', '-i', finalMp4, '-i', rebuilt, '-lavfi', `[0:v]fps=${FPS},setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];[a][b]psnr=stats_file=psnr.log`, '-f', 'null', '-'], {encoding: 'utf8', cwd: vdir});
  const per = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map((x) => { const v = x.match(/psnr_avg:(\S+)/)?.[1]; return v === 'inf' ? 99 : Number(v); }) : [];
  console.log('  verify   the layers composited as the timeline places them, against the finished ad (PSNR, higher = closer; 30+ = same picture):');
  console.log("           (dips are expected inside transitions - the graphics fade there - and where the look's grain sits over a big graphic)");
  const sheet = [];
  for (const sc of comp.scenes) {
    const a = Math.round(sc.from * FPS), b = Math.max(a + 1, Math.round(sc.to * FPS));
    const v = per.slice(a, b).filter(Number.isFinite);
    const avg = v.length ? v.reduce((x, y) => x + y, 0) / v.length : NaN, min = v.length ? Math.min(...v) : NaN;
    console.log(`           ${sc.label.padEnd(16)} avg ${avg.toFixed(1)} dB  min ${min.toFixed(1)} dB${avg < 25 ? '  <- look at this scene in verify.jpg' : ''}`);
    const t = ((sc.from + sc.to) / 2).toFixed(3);
    const tile = path.join(vdir, `t${sheet.length}.png`);
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', t, '-i', finalMp4, '-ss', t, '-i', rebuilt, '-filter_complex', '[0:v]scale=270:480[a];[1:v]scale=270:480[b];[a][b]hstack=inputs=2', '-frames:v', '1', tile]);
    if (fs.existsSync(tile)) sheet.push(tile);
  }
  if (sheet.length) {
    const cols = Math.min(5, sheet.length), rows = Math.ceil(sheet.length / cols);
    const pad = [...sheet]; while (pad.length < cols * rows) pad.push(null);
    const ins = pad.flatMap((t) => (t ? ['-i', t] : ['-f', 'lavfi', '-i', 'color=c=black:s=540x480']));
    const lay = pad.map((_, k) => `${k % cols ? Array.from({length: k % cols}, () => 'w0').join('+') : '0'}_${Math.floor(k / cols) ? Array.from({length: Math.floor(k / cols)}, () => 'h0').join('+') : '0'}`).join('|');
    spawnSync('ffmpeg', ['-v', 'error', '-y', ...ins, '-filter_complex', `xstack=inputs=${pad.length}:layout=${lay}:fill=black`, '-frames:v', '1', path.join(out, 'verify.jpg')]);
    sheet.forEach((t) => fs.rmSync(t, {force: true}));
    console.log(`           ${path.join(out, 'verify.jpg')}  (each pair: finished ad | rebuilt from the layers)\n`);
  }
}

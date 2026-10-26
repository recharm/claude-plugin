#!/usr/bin/env node
/**
 * export_ae.mjs - hand the ad to a motion designer as a layered After Effects comp (Option A: every element
 * its own layer, motion baked into each layer).
 *
 *   node export_ae.mjs edl.json [--motion <project>/ads/<name>.json] [--out <folder>]
 *
 * Run after build_ad.mjs, on the same EDL. Writes a self-contained folder ("<ad name>-ae/" next to the EDL):
 *   build_comp.jsx  After Effects: File > Scripts > Run Script File... - builds the project from the files below
 *   media/          library clips (as footage layers: trimmed, scaled, positioned like the render), one PNG sequence
 *                   (RGBA) per element of every animated scene - its base as an MP4 - voiceover, music, SFX
 *   README.txt
 *
 * In After Effects: a main comp at the ad's size/fps; every animated scene is a precomp ("S03 badges") holding
 * its elements bottom-to-top - base (background or footage), each visual (pour, chart, badges ...), text -
 * each a separate layer you can move, retime, mask or swap. Library clips sit in the main comp as footage layers
 * (with their own sound and J/L-cuts when the ad keeps the clips' audio). Captions are live text layers (brand font,
 * if installed). Voiceover, music (its ducking keyframed on Audio Levels) and SFX are audio layers. Markers name scenes.
 * The motion INSIDE an element layer is baked (Option A); the layers, their timing and placement are yours.
 *
 * Which segment is the motion-graphics render: a segment with "motion": "<path to the ad JSON>" ("remotion" is read
 * too), or --motion for the first file segment. Each element is rendered by hf_build.mjs --isolate in the brand's
 * HyperFrames project (the ad JSON lives in its ads/ folder). Renders are cached by content: edit the ad and only the
 * changed scenes render again.
 */
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildTimeline, stage} from './lib/timeline.mjs';
import {transitionFrames as tFrames} from './lib/transitions.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const edlFile = argv[0];
if (!edlFile || !fs.existsSync(edlFile)) { console.error('usage: node export_ae.mjs edl.json [--motion <project>/ads/<name>.json] [--out <folder>]'); process.exit(2); }
const T = await buildTimeline(edlFile);
const out = path.resolve(opt('--out', path.join(T.base, `${T.name}-ae`)));
const mediaDir = path.join(out, 'media');
fs.mkdirSync(mediaDir, {recursive: true});
const used = new Set();
const FPS = T.fps;
// The ad JSON's scene timing is always 30fps (the runtime's clock), whatever the EDL's fps.
const AFPS = 30, asec = (x) => Math.round(x * AFPS);
if (FPS !== AFPS) console.log(`  note   the edit is ${FPS}fps; animated scenes are rendered at 30fps and placed by time`);

// ---- which EDL segments are motion-graphics renders
const motionFlag = opt('--motion', opt('--remotion'));
T.clips.forEach((c) => {
  const seg = T.edl.segments[c.index], ref = seg.motion || seg.remotion;
  c.motion = ref ? path.resolve(T.base, ref) : null;
});
if (motionFlag && !T.clips.some((c) => c.motion)) {
  const c = T.clips.find((x) => !/^https?:/.test(T.edl.segments[x.index].url || '')) || T.clips[0];
  c.motion = path.resolve(motionFlag);
}

// ---- the parts of a scene, bottom to top - keep in step with SceneView's show() in the runtime's Ad.tsx
const defaultLayer = (k) => (['particles', 'rays'].includes(k) ? 'back' : ['scribble', 'sparkles'].includes(k) ? 'front' : 'main');
const partsOf = (s) => {
  if (s.type === 'custom' && s.html) return [{id: 'base', name: 'custom scene'}]; // a hand-written composition: one layer
  const vis = s.visuals || [], footage = s.type === 'footage', P = [{id: 'base', name: footage ? 'footage' : 'background'}];
  const v = (k) => ({id: `v${k}`, name: `${vis[k].kind}${vis.filter((x) => x.kind === vis[k].kind).length > 1 ? ` ${k + 1}` : ''}`});
  vis.forEach((x, k) => { if ((x.layer || defaultLayer(x.kind)) === 'back') P.push(v(k)); });
  if (s.type === 'custom') P.push({id: 'custom', name: s.component || 'custom'});
  if (s.type === 'endcard') P.push({id: 'endcard', name: 'end card'});
  vis.forEach((x, k) => { if ((x.layer || defaultLayer(x.kind)) === 'main') P.push(v(k)); });
  if (footage && s.cutout) P.push({id: 'cutout', name: 'subject cut-out'}); // graphics below sit BEHIND the subject
  const hasText = s.text || s.sub || ['stat', 'compare', 'product', 'title'].includes(s.type) || (s.type === 'list' && s.marker !== 'icon');
  if (s.type !== 'endcard' && s.type !== 'custom' && hasText) P.push({id: 'text', name: 'text'});
  if (s.type === 'list' && s.marker === 'icon') P.push({id: 'list', name: 'icon steps'});
  if (footage && s.lowerThird) P.push({id: 'lowerthird', name: 'lower third'});
  vis.forEach((x, k) => { if ((x.layer || defaultLayer(x.kind)) === 'front') P.push(v(k)); });
  if (s.ring) P.push({id: 'ring', name: 'highlight ring'});
  return P;
};
const transitionFrames = (t) => tFrames(t, AFPS); // as hf_build.mjs

// ---- render every part of every scene of every motion segment (hf_build.mjs --isolate), cached by content
const remScenes = [];
const runtime = path.join(HERE, '..', 'assets', 'hyperframes-runtime', 'dist', 'mv-runtime.js');
const runtimeStamp = fs.existsSync(runtime) ? String(fs.statSync(runtime).mtimeMs) : '';
for (const c of T.clips.filter((x) => x.motion)) {
  const propsFile = c.motion, project = path.resolve(path.dirname(propsFile), '..');
  const props = JSON.parse(fs.readFileSync(propsFile, 'utf8'));
  const themeText = fs.existsSync(path.join(project, 'theme.json')) ? fs.readFileSync(path.join(project, 'theme.json'), 'utf8') : '';
  const scenes = props.scenes || [];
  let start = 0;
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (i > 0) start = start + asec(scenes[i - 1].duration) - (s.transition ? transitionFrames(s.transition) : 0);
    const dur = asec(s.duration);
    const startOut = c.start + (start / AFPS - c.in);
    if (startOut + dur / AFPS <= c.start || startOut >= c.end) continue; // trimmed out of the edit
    const label = `S${String(i + 1).padStart(2, '0')} ${(s.visuals || []).find((v) => !['particles', 'sparkles', 'rays', 'scribble'].includes(v.kind))?.kind || s.type}`;
    // what this scene looks like: its JSON, its neighbours' transitions, the brand theme and the runtime build
    const hash = crypto.createHash('sha1').update(JSON.stringify([s, scenes[i + 1]?.transition || null, themeText, runtimeStamp])).digest('hex').slice(0, 8);
    const parts = [];
    for (const p of partsOf(s)) {
      const stem = `seg${c.index + 1}_${label.replace(/\s+/g, '_')}_${parts.length + 1}_${p.name.replace(/\s+/g, '-')}_${hash}`;
      process.stdout.write(`  render   ${label} / ${p.name} ...`);
      const base = p.id === 'base';
      const target = path.join(mediaDir, base ? `${stem}.mp4` : stem);
      if (!fs.existsSync(base ? target : path.join(target, '.done'))) {
        // render into a temporary name, then move into place: an interrupted export never leaves a short sequence behind
        const tmp = base ? target.slice(0, -'.mp4'.length) + '.tmp.mp4' : target + '__tmp';
        fs.rmSync(tmp, {recursive: true, force: true});
        const r = spawnSync(process.execPath, [path.join(HERE, 'hf_build.mjs'), propsFile, '--isolate', `${i}:${p.id}`, '--format', base ? 'mp4' : 'png-sequence', '--out', tmp],
          {encoding: 'utf8', stdio: 'pipe', maxBuffer: 1 << 26});
        if (r.status !== 0 || !fs.existsSync(tmp)) { console.error(`\n${(r.stdout || '') + (r.stderr || '')}\n  render failed for ${label} / ${p.name}`); process.exit(1); }
        fs.rmSync(target, {recursive: true, force: true});
        fs.renameSync(tmp, target);
        if (!base) fs.writeFileSync(path.join(target, '.done'), '');
      }
      if (base) parts.push({name: p.name, file: path.relative(out, target).split(path.sep).join('/')});
      else {
        const first = fs.readdirSync(target).filter((f) => f.endsWith('.png')).sort()[0];
        parts.push({name: p.name, file: path.relative(out, path.join(target, first)).split(path.sep).join('/'), seq: true});
      }
      process.stdout.write(' ok\n');
    }
    // the layer may only show inside this segment of the edit (a trim can cut a scene's head or tail)
    remScenes.push({clipIndex: c.index, scene: i, name: label, startOut, dur: dur / AFPS, clipStart: c.start, clipEnd: c.end,
      fadeIn: i === 0 || startOut <= c.start + 1e-3 ? c.trans.dur : 0, plan: s._plan || '', parts});
  }
}
// stale renders of earlier versions of this ad (other hashes) are left in media/ - delete the folder to clear them

// ---- footage clips, overlays, audio, captions -> data for the JSX
const rel = (p) => path.relative(out, p).split(path.sep).join('/');
const footage = T.clips.filter((c) => !c.motion).map((c) => {
  const f = stage(c.file, mediaDir, `${String(c.index + 1).padStart(2, '0')}_${c.symbol}${path.extname(c.file)}`, used);
  const inf = c.info || {width: T.W, height: T.H};
  const cover = Math.max(T.W / inf.width, T.H / inf.height), contain = Math.min(T.W / inf.width, T.H / inf.height);
  const s = (c.fit === 'contain' || c.fit === 'blurfill' ? contain : cover);
  return {name: `${c.index + 1} ${c.symbol}`, file: rel(f), start: c.start, end: c.end, in: c.in, scale: s * 100,
    x: T.W / 2 + (0.5 - c.anchorX) * (inf.width * s - T.W), y: T.H / 2 + (0.5 - c.anchorY) * (inf.height * s - T.H),
    move: c.move, moveAmount: c.moveAmount, fadeIn: c.trans.dur, transName: c.trans.name, beat: c.beat,
    // the clip's own sound (testimonials, mashups) and its split edit: audio led in before the cut, held after it
    audio: T.keepClipAudio && !!c.info?.hasAudio, lead: T.keepClipAudio ? c.audioLead || 0 : 0, tail: T.keepClipAudio ? c.audioTail || 0 : 0,
    fit: c.fit};
});
const reference = T.clips.filter((c) => c.motion).map((c) => ({file: rel(stage(c.file, mediaDir, `reference_render_${c.index + 1}${path.extname(c.file)}`, used)), start: c.start, end: c.end, in: c.in}));
const overlays = T.overlays.map((o, k) => ({name: `overlay ${k + 1}`, file: rel(stage(o.file, mediaDir, `overlay_${k + 1}${path.extname(o.file)}`, used)), at: o.at, dur: o.dur}));
const audio = [];
if (T.vo) audio.push({name: 'Voiceover', file: rel(stage(T.vo.file, mediaDir, `voiceover${path.extname(T.vo.file)}`, used)), at: T.vo.start, keys: [[0, T.vo.gainDb]]});
if (T.music) {
  const m = T.music, end = Math.min(T.total, m.info.duration), keys = [[0, m.gainDb]];
  if (m.duck) for (const [a, b] of m.speech) { if (a >= end) break; keys.push([Math.max(0, a - 0.1), m.gainDb], [a, m.gainDb + m.duckDb], [Math.min(end, b), m.gainDb + m.duckDb], [Math.min(end, b + 0.3), m.gainDb]); }
  keys.push([Math.max(0, end - m.fadeOut), keys[keys.length - 1][1]], [end, -48]);
  audio.push({name: 'Music', file: rel(stage(m.file, mediaDir, `music${path.extname(m.file)}`, used)), at: 0, end, keys: keys.filter((k, i, a) => i === 0 || k[0] > a[i - 1][0] + 1e-3)});
}
T.sfx.forEach((s, k) => audio.push({name: `SFX ${s.name}`, file: rel(stage(s.file, mediaDir, `sfx_${String(k + 1).padStart(2, '0')}_${path.basename(s.file)}`, used)), at: s.at, keys: [[0, s.gainDb]]}));
const style = T.edl.captionStyle || {};
const short = Math.min(T.W, T.H);
const bandY = {upper: 0.27, middle: 0.5, lower: 0.73}; // build_ad's CAPTION_BANDS
// build_ad sizes captions in libass units (the font's line height = short side * 0.068); After Effects sizes the em,
// which for Poppins is about 0.55 of that. libass centres the line on the band; AE places the baseline - drop it a little.
const assSize = style.fontSize || Math.round(short * 0.068), emSize = Math.round(assSize * 0.55);
const captions = T.captions.map((c) => ({text: c.text.replace(/\n/g, '\r'), start: c.start, end: c.end,
  y: (c.y != null ? Math.min(0.88, Math.max(0.08, c.y)) : bandY[c.band] ?? bandY.middle) * T.H + emSize * 0.36,
  pop: c.anim === 'pop' || c.anim === 'punch'}));

const DATA = {name: T.name, W: T.W, H: T.H, fps: FPS, dur: T.total, font: style.font ? String(style.font).replace(/\s+/g, '') + (style.bold === false ? '' : '-Bold') : 'Poppins-Bold',
  fontSize: emSize, fill: style.primary || '#FFFFFF', stroke: style.outline || '#111111', strokeWidth: style.outlineWidth ?? Math.max(4, Math.round(short * 0.0055)),
  reference, footage, scenes: remScenes, overlays, audio, captions};

const jsx = `// ${T.name} - built by make-video export_ae.mjs. After Effects: File > Scripts > Run Script File..., pick this file.
// Adds a folder "${T.name}" to the open project (a new one if none) with the main comp, one precomp per animated scene
// (every element its own layer), footage, captions, audio and markers. Media is read from ./media next to this script.
(function () {
var DATA = ${JSON.stringify(DATA).replace(/[\u007f-\uffff]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'))};
var root = File($.fileName).parent.fsName;
var proj = app.project || app.newProject();
app.beginUndoGroup('make-video: ' + DATA.name);
var top = proj.items.addFolder(DATA.name), mediaF = proj.items.addFolder('media'), scF = proj.items.addFolder('scenes');
mediaF.parentFolder = top; scF.parentFolder = top;
var cache = {};
function imp(rel, seq) {
  if (cache[rel]) return cache[rel];
  var f = new File(root + '/' + rel);
  if (!f.exists) { alert('make-video: missing ' + f.fsName); return null; }
  var io = new ImportOptions(f);
  if (seq) { io.sequence = true; }
  var it = proj.importFile(io); it.parentFolder = mediaF;
  if (seq) { it.mainSource.conformFrameRate = DATA.fps; it.name = f.parent.name; }
  cache[rel] = it; return it;
}
function hex(h) { h = h.replace('#', ''); return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255]; }
function set2(p, v) { try { p.setValue(v); } catch (e) { p.setValue([v[0], v[1], 100]); } }
function key2(p, t, v) { try { p.setValueAtTime(t, v); } catch (e) { p.setValueAtTime(t, [v[0], v[1], 100]); } }
function place(comp, item, start, inP, outP, name, label) {
  var L = comp.layers.add(item); L.startTime = start; L.inPoint = Math.max(0, inP); L.outPoint = Math.min(comp.duration, outP);
  if (name) L.name = name; if (label) L.label = label; return L;
}
var main = proj.items.addComp(DATA.name, DATA.W, DATA.H, 1, DATA.dur, DATA.fps); main.parentFolder = top;
var fades = [];
// bottom: the finished render, switched off - a guide to compare against
for (var r = 0; r < DATA.reference.length; r++) {
  var rr = DATA.reference[r], ri = imp(rr.file);
  if (ri) { var RL = place(main, ri, rr.start - rr['in'], rr.start, rr.end, 'reference render (off)', 0); RL.enabled = false; if (RL.hasAudio) RL.audioEnabled = false;
    var rs = DATA.W / ri.width * 100; set2(RL.property('ADBE Transform Group').property('ADBE Scale'), [rs, rs]); }
}
// library clips as footage layers
for (var i = 0; i < DATA.footage.length; i++) {
  var c = DATA.footage[i], it = imp(c.file); if (!it) continue;
  var L = place(main, it, c.start - c['in'], c.start, c.end, c.name, 9 + (i % 4));
  if (L.hasAudio) L.audioEnabled = false;
  if (c.audio && L.hasAudio) {
    if (c.lead > 0 || c.tail > 0) {
      // J/L-cut: the clip's sound on its own layer, starting before / ending after the picture
      var AU = place(main, it, c.start - c['in'], c.start - c.lead, c.end + c.tail, c.name + ' (audio' + (c.lead > 0 ? ', J-cut ' + c.lead + 's' : '') + (c.tail > 0 ? ', L-cut ' + c.tail + 's' : '') + ')', 14);
      AU.enabled = false; AU.audioEnabled = true;
    } else L.audioEnabled = true;
  }
  var sc = L.property('ADBE Transform Group').property('ADBE Scale'), po = L.property('ADBE Transform Group').property('ADBE Position');
  set2(po, [c.x, c.y]);
  if (c.move === 'pushin' || c.move === 'pullback') {
    var a0 = c.move === 'pushin' ? c.scale : c.scale * (1 + c.moveAmount), a1 = c.move === 'pushin' ? c.scale * (1 + c.moveAmount) : c.scale;
    key2(sc, c.start, [a0, a0]); key2(sc, c.end, [a1, a1]);
  } else set2(sc, [c.scale, c.scale]);
  if (c.move && c.move.indexOf('glide') === 0) {
    var d = c.moveAmount * DATA.W, dx = c.move === 'glideleft' ? -d : c.move === 'glideright' ? d : 0, dy = c.move === 'glideup' ? -d : c.move === 'glidedown' ? d : 0;
    set2(sc, [c.scale * (1 + c.moveAmount), c.scale * (1 + c.moveAmount)]);
    key2(po, c.start, [c.x - dx / 2, c.y - dy / 2]); key2(po, c.end, [c.x + dx / 2, c.y + dy / 2]);
  }
  if (c.fadeIn > 0) { var op = L.property('ADBE Transform Group').property('ADBE Opacity'); op.setValueAtTime(c.start, 0); op.setValueAtTime(c.start + c.fadeIn, 100); }
  L.property('Marker').setValueAtTime(c.start, new MarkerValue((c.beat ? c.beat + ' | ' : '') + (c.fadeIn > 0 ? 'enters with ' + c.transName + ' (here: fade)' : 'cut') + (c.move ? ' | ' + c.move : '') + (c.fit === 'blurfill' ? ' | blurfill: add a blurred copy behind' : '')));
  if (c.fadeIn > 0) fades.push(L);
}
// animated scenes: one precomp each, its elements bottom to top
for (var s = 0; s < DATA.scenes.length; s++) {
  var S = DATA.scenes[s];
  var pc = proj.items.addComp(S.name, DATA.W, DATA.H, 1, S.dur, DATA.fps); pc.parentFolder = scF;
  for (var p = 0; p < S.parts.length; p++) {
    var pi = imp(S.parts[p].file, S.parts[p].seq); if (!pi) continue;
    place(pc, pi, 0, 0, S.dur, S.parts[p].name, 1 + (p % 8));
  }
  // clamped to its segment of the edit; a transition into the segment becomes an opacity fade (marked)
  var PL = place(main, pc, S.startOut, Math.max(S.startOut, S.clipStart), Math.min(S.startOut + S.dur, S.clipEnd), S.name, 1 + (s % 8));
  if (S.fadeIn > 0) { var po2 = PL.property('ADBE Transform Group').property('ADBE Opacity'); po2.setValueAtTime(S.clipStart, 0); po2.setValueAtTime(S.clipStart + S.fadeIn, 100); }
  main.markerProperty.setValueAtTime(Math.max(0, S.startOut), new MarkerValue(S.name + (S.plan ? ' - ' + S.plan : '')));
}
// a clip that fades in over an animated scene must sit above it, or the scene hides the fade
for (var fz = 0; fz < fades.length; fz++) fades[fz].moveToBeginning();
// overlays
for (var o = 0; o < DATA.overlays.length; o++) { var ov = DATA.overlays[o], oi = imp(ov.file); if (oi) place(main, oi, ov.at, ov.at, ov.at + ov.dur, ov.name, 2); }
// captions as live text
for (var k = 0; k < DATA.captions.length; k++) {
  var cp = DATA.captions[k], T = main.layers.addText(cp.text), tp = T.property('ADBE Text Properties').property('ADBE Text Document'), td = tp.value;
  td.resetCharStyle(); td.fontSize = DATA.fontSize; try { td.font = DATA.font; } catch (e) {}
  td.fillColor = hex(DATA.fill); td.applyStroke = true; td.strokeColor = hex(DATA.stroke); td.strokeWidth = DATA.strokeWidth; td.strokeOverFill = false;
  td.justification = ParagraphJustification.CENTER_JUSTIFY; tp.setValue(td);
  T.name = 'caption ' + (k + 1); T.label = 5; T.startTime = 0; T.inPoint = cp.start; T.outPoint = cp.end;
  set2(T.property('ADBE Transform Group').property('ADBE Position'), [DATA.W / 2, cp.y]);
  var to = T.property('ADBE Transform Group').property('ADBE Opacity');
  to.setValueAtTime(cp.start, 0); to.setValueAtTime(cp.start + 0.15, 100); to.setValueAtTime(cp.end - 0.15, 100); to.setValueAtTime(cp.end, 0);
  if (cp.pop) { var ts = T.property('ADBE Transform Group').property('ADBE Scale'); key2(ts, cp.start, [60, 60]); key2(ts, cp.start + 0.2, [100, 100]); }
}
// audio
for (var a = 0; a < DATA.audio.length; a++) {
  var A = DATA.audio[a], ai = imp(A.file); if (!ai) continue;
  var AL = place(main, ai, A.at, A.at, A.end ? A.end : A.at + ai.duration, A.name, 14);
  var lv = AL.property('ADBE Audio Group').property('ADBE Audio Levels');
  if (A.keys.length === 1) lv.setValue([A.keys[0][1], A.keys[0][1]]);
  else for (var q = 0; q < A.keys.length; q++) lv.setValueAtTime(A.at + A.keys[q][0], [A.keys[q][1], A.keys[q][1]]);
}
main.openInViewer();
app.endUndoGroup();
// automation (tests): a wrapper script may set MAKE_VIDEO_AE_SAVE / MAKE_VIDEO_AE_QUIT before $.evalFile-ing this one
var SAVE = typeof MAKE_VIDEO_AE_SAVE !== 'undefined' ? MAKE_VIDEO_AE_SAVE : $.getenv('MAKE_VIDEO_AE_SAVE');
var QUIT = typeof MAKE_VIDEO_AE_QUIT !== 'undefined' ? MAKE_VIDEO_AE_QUIT : $.getenv('MAKE_VIDEO_AE_QUIT');
if (SAVE) { proj.save(new File(SAVE)); }
if (QUIT) { app.quit(); }
})();
`;
fs.writeFileSync(path.join(out, 'build_comp.jsx'), jsx);
const parts = remScenes.reduce((n, s) => n + s.parts.length, 0);
fs.writeFileSync(path.join(out, 'README.txt'), [
  `${T.name} - After Effects hand-off (layered, Option A)`, '',
  '1. After Effects: File > Scripts > Run Script File..., pick build_comp.jsx (keep it next to media/).',
  `   It adds a folder "${T.name}" with the main comp (opens it), a precomp per animated scene in "scenes", and the media.`,
  `2. Captions are live text in ${DATA.font} - install the font first or AE substitutes one.`,
  '3. Each scene precomp holds its elements as separate layers (background/footage, each graphic, text). The motion',
  '   inside an element is baked; move, retime, mask, re-colour or replace any layer. The bottom layer of the main comp is',
  '   the finished render, switched off - toggle it on to compare.', '',
  `Comp: ${T.W}x${T.H} @ ${FPS}fps, ${T.total.toFixed(2)}s - ${footage.length} footage layers, ${remScenes.length} scene precomps (${parts} element layers), ${captions.length} captions, ${audio.length} audio layers.`,
  T.music ? `Music at ${T.music.gainDb}dB${T.music.duck ? `, ducked ${T.music.duckDb}dB under the voice (Audio Levels keyframes)` : ''}.` : '',
  'The finished MP4 was loudness-normalised to -14 LUFS; this comp is not.',
].filter(Boolean).join('\n'));
console.log(`\n  After Effects hand-off -> ${out}`);
console.log(`  build_comp.jsx  ${T.W}x${T.H} @ ${FPS}fps, ${T.total.toFixed(2)}s - ${footage.length} footage layers, ${remScenes.length} scene precomps / ${parts} element layers, ${captions.length} captions, ${audio.length} audio layers`);
console.log('  After Effects: File > Scripts > Run Script File > build_comp.jsx. See README.txt.\n');

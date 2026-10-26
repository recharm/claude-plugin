// The EDL as a timeline: where every clip, sound and caption sits on the OUTPUT, the way build_ad.mjs
// renders it. Shared by export_premiere.mjs and export_ae.mjs so an editor's timeline matches the MP4.
import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchWithFallback, findLocal} from './net.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SFX_DIR = path.resolve(HERE, '..', '..', 'assets', 'sfx');
const XFADE_NAMES = new Set(['fade', 'dissolve', 'fadeblack', 'fadewhite', 'swipeleft', 'swiperight', 'swipeup', 'swipedown', 'smoothleft', 'smoothright',
  'smoothup', 'smoothdown', 'wipeleft', 'wiperight', 'wipeup', 'wipedown', 'revealleft', 'revealright', 'coverleft', 'coverright', 'coverup', 'coverdown',
  'circleopen', 'circleclose', 'radial', 'zoomin', 'squeezeh', 'squeezev', 'pixelize', 'hblur', 'slideleft', 'slideright', 'slideup', 'slidedown']);

export const probe = (file) => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,r_frame_rate,channels,sample_rate:stream_side_data=rotation:format=duration',
    '-of', 'json', file], {encoding: 'utf8'});
  if (r.status !== 0) return null;
  const j = JSON.parse(r.stdout);
  const v = (j.streams || []).find((s) => s.codec_type === 'video'), a = (j.streams || []).find((s) => s.codec_type === 'audio');
  // phone clips carry a rotation of 90, -90 or 270: any quarter turn swaps the displayed width and height
  const rot = ((Number(v?.side_data_list?.find((d) => d.rotation != null)?.rotation || 0) % 360) + 360) % 360;
  const turned = rot === 90 || rot === 270;
  const [n, d] = String(v?.r_frame_rate || '30/1').split('/').map(Number);
  return {duration: Number(j.format?.duration || 0), width: turned ? v?.height : v?.width, height: turned ? v?.width : v?.height,
    fps: d ? n / d : 30, hasVideo: !!v, hasAudio: !!a, channels: a?.channels || 2, sampleRate: Number(a?.sample_rate || 48000)};
};

export const measureLufs = (file) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], {encoding: 'utf8', maxBuffer: 1 << 24});
  const all = [...String(r.stderr || '').matchAll(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g)];
  const v = all.length ? Number(all[all.length - 1][1]) : NaN;
  return Number.isFinite(v) && v > -70 ? v : null;
};

/** Where the voice speaks (seconds, in the file) - for the music ducking keyframes. */
export const speechRegions = (file) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'silencedetect=noise=-35dB:d=0.3', '-f', 'null', '-'], {encoding: 'utf8', maxBuffer: 1 << 24});
  const txt = String(r.stderr || ''), dur = probe(file)?.duration || 0;
  const sil = [];
  let s = null;
  for (const line of txt.split('\n')) {
    const a = line.match(/silence_start: (-?[\d.]+)/), b = line.match(/silence_end: ([\d.]+)/);
    if (a) s = Math.max(0, Number(a[1]));
    if (b && s != null) { sil.push([s, Number(b[1])]); s = null; }
  }
  if (s != null) sil.push([s, dur]);
  const speech = [];
  let t = 0;
  for (const [a, b] of sil) { if (a > t + 0.05) speech.push([t, a]); t = b; }
  if (t < dur - 0.05) speech.push([t, dur]);
  return speech;
};

/** The local file for a segment source, the same way build_ad finds it: local path, clipsDir, cache, download. */
export const resolveMedia = async (src, {base, cacheDir, clipsDir, symbol}) => {
  if (!/^https?:\/\//i.test(src)) {
    const p = path.resolve(base, src);
    if (!fs.existsSync(p)) throw new Error(`file not found: ${p}`);
    return p;
  }
  const local = clipsDir ? findLocal(src, symbol, [clipsDir]) : null;
  if (local) return local;
  const key = crypto.createHash('sha1').update(src).digest('hex').slice(0, 16);
  const ext = (src.split('?')[0].match(/\.([a-z0-9]{2,4})$/i) || [, 'mp4'])[1].toLowerCase();
  const cached = path.join(cacheDir, `${key}.${ext}`);
  if (fs.existsSync(cached) && fs.statSync(cached).size > 0) return cached;
  fs.mkdirSync(cacheDir, {recursive: true});
  const r = await fetchWithFallback(src, cached);
  if (!r.ok) throw new Error(`could not get ${src}: ${r.reason} (run fetch_clips.mjs and set "clipsDir")`);
  return cached;
};

/** Build the output timeline from an EDL file. */
export const buildTimeline = async (edlFile) => {
  const edl = JSON.parse(fs.readFileSync(edlFile, 'utf8'));
  const base = path.dirname(path.resolve(edlFile));
  const aspect = edl.aspect ?? '9:16';
  const W = edl.width ?? (aspect === '16:9' ? 1920 : 1080), H = edl.height ?? (aspect === '16:9' ? 1080 : 1920);
  const fps = edl.fps ?? 30;
  const cacheDir = path.resolve(base, edl.cacheDir ?? '.adcache');
  const clipsDir = edl.clipsDir ? path.resolve(base, edl.clipsDir) : null;

  const segs = edl.segments || [];
  const durs = segs.map((s) => Math.max(0.04, (s.out ?? 0) - (s.in ?? 0)));
  const clips = [];
  let start = 0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    let trans = {name: 'cut', dur: 0};
    if (i > 0 && s.transition && s.transition !== 'cut') {
      const name = typeof s.transition === 'string' ? s.transition : s.transition.type;
      if (XFADE_NAMES.has(name)) {
        let dur = typeof s.transition === 'string' ? 0.4 : (s.transition.duration ?? 0.4);
        dur = Math.min(dur, Math.min(durs[i], durs[i - 1]) * 0.6);
        trans = {name, dur};
      }
    }
    if (i > 0) start = start + durs[i - 1] - trans.dur;
    const file = await resolveMedia(s.url || s.file, {base, cacheDir, clipsDir, symbol: s.clipSymbol});
    clips.push({index: i, symbol: s.clipSymbol || path.basename(file, path.extname(file)), beat: s._beat || '', file, info: probe(file),
      in: s.in ?? 0, out: s.out ?? (s.in ?? 0) + durs[i], dur: durs[i], start, end: start + durs[i], trans,
      fit: s.fit || edl.fit || 'cover', move: s.move && s.move !== 'none' ? s.move : null, moveAmount: s.moveAmount ?? 0.1,
      anchorX: s.anchorX ?? 0.5, anchorY: s.anchorY ?? 0.5, audioLead: s.audioLead || 0, audioTail: s.audioTail || 0});
  }
  const total = clips.length ? clips[clips.length - 1].end : 0;

  const audio = edl.audio || {};
  const voSpec = audio.voiceover?.file ? audio.voiceover : null;
  const vo = voSpec ? {file: path.resolve(base, voSpec.file), start: voSpec.delay ?? 0.2, gainDb: voSpec.gainDb ?? 0} : null;
  if (vo) vo.info = probe(vo.file);
  let music = null;
  if (audio.music?.file) {
    const m = audio.music, file = path.resolve(base, m.file);
    let gainDb = m.gainDb;
    if (gainDb == null) {
      const speech = vo ? measureLufs(vo.file) : null, bed = measureLufs(file);
      gainDb = speech != null && bed != null ? Math.max(-40, Math.min(10, +((speech + (vo?.gainDb || 0) + (m.offsetDb ?? -4)) - bed).toFixed(1))) : -20;
    }
    music = {file, info: probe(file), gainDb, duck: m.duck !== false && !!vo, duckDb: m.duckDb ?? -9, fadeOut: m.fadeOut ?? 1.0,
      speech: vo && m.duck !== false ? speechRegions(vo.file).map(([a, b]) => [a + vo.start, b + vo.start]) : []};
  }
  const sfx = (audio.sfx || []).map((fx) => {
    const file = fx.file ? path.resolve(base, fx.file) : path.join(SFX_DIR, `${String(fx.name).replace(/\.wav$/i, '')}.wav`);
    return {name: fx.name || path.basename(file), file, at: fx.at ?? 0, gainDb: Number.isFinite(fx.gainDb) ? fx.gainDb : -6, info: probe(file)};
  });
  const captions = (edl.captions || []).map((c) => ({start: c.start, end: c.end, text: c.text ?? (c.lines || []).join('\n'), band: c.band, y: c.y, anim: c.anim}));
  const overlays = (edl.overlays || []).map((o) => { const file = path.resolve(base, o.file); const info = probe(file); return {file, at: o.at ?? 0, info, dur: info?.duration || 0}; });

  return {edl, base, W, H, fps, total, clips, vo, music, sfx, captions, overlays, keepClipAudio: audio.keepClipAudio === true,
    name: path.basename(edl.output || edlFile, path.extname(edl.output || edlFile)).replace(/-draft$/, '')};
};

export const srt = (captions) => {
  const ts = (t) => { const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
  return captions.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n');
};

/** Copy a file into the package's media folder under a readable, unique name. */
export const stage = (file, dir, name, used = new Set()) => {
  fs.mkdirSync(dir, {recursive: true});
  let base = name.replace(/[^\w.-]+/g, '_'), out = base, k = 2;
  while (used.has(out.toLowerCase())) out = base.replace(/(\.\w+)$/, `_${k++}$1`);
  used.add(out.toLowerCase());
  const dest = path.join(dir, out);
  if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(file).size) fs.copyFileSync(file, dest);
  return dest;
};

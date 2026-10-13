#!/usr/bin/env node
/**
 * clip_tag.mjs - measure candidate clips so picks and in/out points rest on numbers, not guesses.
 *
 *   node clip_tag.mjs <clip.mp4|url> [...] [--out tags.json]
 *
 * Per clip (real duration and rotation-aware size, from the file):
 *   cuts       shot changes inside the clip - never set an in/out that straddles one
 *   frozen     stretches with no change (dead frames, a paused phone) - keep them out of the cut
 *   black      black frames (fade-ins, lens covered)
 *   brightness mean luma 0-255 (under ~50 reads dark on a phone)
 *   motion     mean frame-to-frame change: low (static, talking head) / medium / high (pours, action)
 *   audio      present? loudness; "speech-level" when it is loud enough to carry dialogue
 *   windows    the usable stretches (between cuts, minus frozen and black), longest first
 *   usability  1-5 from the above - a starting point for the sprite check, not a replacement for it
 *
 * Energy matches the beat: high-motion clips for hooks and problem beats, low/medium for the solution and
 * testimonial A-roll. See references/library.md -> Screening.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const oi = argv.indexOf('--out');
const out = oi === -1 ? 'tags.json' : argv.splice(oi, 2)[1];
const clips = argv.filter((a) => !a.startsWith('--'));
if (!clips.length) { console.error('usage: node clip_tag.mjs <clip.mp4|url> [...] [--out tags.json]'); process.exit(2); }

const run = (args) => spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024}).stderr || '';
const ranges = (txt, startRe, endRe) => {
  const s = [...txt.matchAll(startRe)].map((m) => +m[1]);
  const e = [...txt.matchAll(endRe)].map((m) => +m[1]);
  return s.map((a, i) => [+a.toFixed(2), +(e[i] ?? NaN).toFixed(2)]);
};

const results = {};
for (const c of clips) {
  const name = path.basename(c).replace(/\.[^.]+$/, '');
  const pr = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height:stream_side_data=rotation', '-of', 'json', c], {encoding: 'utf8'}).stdout || '{}');
  const v = (pr.streams || []).find((s) => s.codec_type === 'video');
  if (!v) { results[name] = {error: 'no video stream'}; continue; }
  const dur = Number(pr.format.duration);
  const rot = Math.abs(Number(v.side_data_list?.find((d) => d.rotation != null)?.rotation || 0));
  const [w, h] = rot === 90 || rot === 270 ? [v.height, v.width] : [v.width, v.height];
  const hasAudio = pr.streams.some((s) => s.codec_type === 'audio');

  // One video pass at low res: scene changes, freezes, blacks, luma, and frame difference.
  const vr = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', c, '-an', '-vf',
    "scale=320:-2,split=3[a][b][c];[a]select='gt(scene,0.35)',showinfo,nullsink;" +
    "[b]freezedetect=n=0.003:d=0.5,blackdetect=d=0.2:pic_th=0.95,signalstats,metadata=print:key=lavfi.signalstats.YAVG,nullsink;" +
    "[c]tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-", '-f', 'null', '-'],
    {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  const vt = vr.stderr || '';   // showinfo, freezedetect, blackdetect, brightness YAVG
  const vo = vr.stdout || '';   // frame-difference YAVG (file=-)
  if (vr.status !== 0) {
    results[name] = {error: vt.trim().split(/\r?\n/).pop() || 'ffmpeg failed'};
    console.log(`  ${name.padEnd(10)} ERROR ${results[name].error}`);
    continue;
  }
  // Only showinfo lines are scene changes; metadata=print also writes pts_time on every frame.
  const cuts = [...vt.matchAll(/Parsed_showinfo[^\r\n]*?pts_time:([\d.]+)/g)].map((m) => +(+m[1]).toFixed(2)).filter((t) => t > 0.1 && t < dur - 0.1);
  const frozen = ranges(vt, /freeze_start: ([\d.]+)/g, /freeze_end: ([\d.]+)/g).map(([a, b]) => [a, Number.isFinite(b) ? b : +dur.toFixed(2)]);
  const black = [...vt.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => [+(+m[1]).toFixed(2), +(+m[2]).toFixed(2)]);
  const grab = (txt) => [...txt.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((m) => +m[1]);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const brightness = +mean(grab(vt)).toFixed(0);
  const diff = mean(grab(vo));
  const motion = diff < 2.5 ? 'low' : diff < 7 ? 'medium' : 'high';

  let audio = {present: hasAudio};
  if (hasAudio) {
    const eb = run(['-i', c, '-vn', '-af', 'ebur128', '-f', 'null', '-']);
    const I = Number((eb.slice(eb.lastIndexOf('Summary:')).match(/I:\s+(-?[\d.]+)/) || [])[1]);
    audio = {present: true, lufs: Number.isFinite(I) ? I : null, speechLevel: Number.isFinite(I) && I > -32};
  }

  // Usable windows: between internal cuts, minus frozen and black stretches.
  const bad = [...frozen, ...black].sort((a, b) => a[0] - b[0]);
  const pieces = [];
  const edges = [0, ...cuts, dur];
  for (let i = 0; i < edges.length - 1; i++) {
    let segs = [[edges[i], edges[i + 1]]];
    for (const [a, b] of bad) {
      segs = segs.flatMap(([s, e]) => (b <= s || a >= e ? [[s, e]] : [[s, a], [b, e]].filter(([x, y]) => y - x > 0.05)));
    }
    pieces.push(...segs);
  }
  const windows = pieces.map(([s, e]) => ({in: +s.toFixed(2), out: +e.toFixed(2), dur: +(e - s).toFixed(2)})).filter((p) => p.dur >= 0.8).sort((a, b) => b.dur - a.dur);

  let score = 5;
  const why = [];
  const frozenTotal = frozen.reduce((a, [s, e]) => a + (e - s), 0);
  if (frozenTotal > dur * 0.3) { score -= 2; why.push('mostly frozen'); } else if (frozenTotal > 0.8) { score -= 1; why.push('frozen stretch'); }
  if (black.length) { score -= 1; why.push('black frames'); }
  if (brightness < 50) { score -= 1; why.push('dark'); }
  if (!windows.length || windows[0].dur < 1.5) { score -= 2; why.push('no usable stretch over 1.5s'); }
  if (cuts.length > 3) { score -= 1; why.push(`${cuts.length} internal cuts - an edited clip?`); }
  score = Math.max(1, score);

  results[name] = {src: c, duration: +dur.toFixed(2), width: w, height: h, orientation: h > w ? 'portrait' : w > h ? 'landscape' : 'square',
    cuts, frozen, black, brightness, motion, motionValue: +diff.toFixed(1), audio, windows: windows.slice(0, 4), usability: score, notes: why};
  const r = results[name];
  console.log(`  ${name.padEnd(10)} ${String(r.duration).padStart(5)}s ${r.orientation.padEnd(9)} motion ${motion.padEnd(6)} luma ${String(brightness).padStart(3)}  ` +
    `audio ${hasAudio ? (audio.speechLevel ? 'speech' : 'quiet') : 'none'}  usable ${score}/5  best ${windows[0] ? `${windows[0].in}-${windows[0].out}s` : '-'}` +
    `${cuts.length ? `  cuts@${cuts.slice(0, 6).join(',')}${cuts.length > 6 ? ',...' : ''}` : ''}${why.length ? `  (${why.join('; ')})` : ''}`);
}
fs.writeFileSync(out, JSON.stringify(results, null, 1));
console.log(`\n  wrote ${out}`);

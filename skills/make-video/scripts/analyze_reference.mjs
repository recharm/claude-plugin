#!/usr/bin/env node
/**
 * analyze_reference.mjs - measure a reference ad so the new ad can match its rhythm, not just its vibe.
 *
 *   node analyze_reference.mjs <video file or direct .mp4 URL> [--out ref/] [--threshold 0.3] [--transcribe]
 *
 * Writes <out>/reference.json and <out>/shots.jpg and prints a summary:
 *   - format: duration, size, aspect, fps
 *   - shots: every cut (ffmpeg scene detection), each shot's start/length; median and mean shot length,
 *     cuts per 10s, how fast the first cut lands (hook pace), whether pacing speeds up or slows down
 *   - shots.jpg: one frame from the middle of each shot, numbered with its length - read it for framing,
 *     on-screen text style and position, talking head vs b-roll vs graphics, and transition style
 *   - audio: integrated loudness, silent gaps, whether speech/music runs throughout
 *   - --transcribe: word-timed transcript (via transcribe.mjs / local Whisper): the hook line, words per second
 *
 * Read `references/reference-analysis.md` for how to turn the result into a plan. Scene detection misses soft
 * dissolves and counts flashes as cuts - check the sheet, and adjust --threshold (lower finds more cuts).
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); if (i === -1) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const outDir = path.resolve(opt('--out', 'ref'));
const threshold = Number(opt('--threshold', '0.3'));
const doTranscribe = argv.includes('--transcribe');
const src = argv.find((a) => !a.startsWith('--'));
if (!src) { console.error('usage: node analyze_reference.mjs <video|url> [--out ref/] [--threshold 0.3] [--transcribe]'); process.exit(2); }
fs.mkdirSync(outDir, {recursive: true});

const run = (cmd, args, o = {}) => spawnSync(cmd, args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...o});

// ---- get the file local
let file = src;
if (/^https?:/i.test(src)) {
  file = path.join(outDir, 'reference' + (path.extname(new URL(src).pathname) || '.mp4'));
  if (!fs.existsSync(file)) {
    const res = await fetch(src);
    if (!res.ok || !/video|octet/.test(res.headers.get('content-type') || '')) {
      console.error(`  could not download a video from ${src} (HTTP ${res.status}, ${res.headers.get('content-type')}).`);
      console.error('  Social links (TikTok/Instagram/YouTube pages) are not direct video files - ask the user to upload the file.');
      process.exit(1);
    }
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
}
if (!fs.existsSync(file)) { console.error(`  not found: ${file}`); process.exit(1); }

// ---- format
const pr = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate:stream_side_data=rotation', '-of', 'json', file]).stdout);
const vs = pr.streams.find((s) => s.codec_type === 'video');
const hasAudio = pr.streams.some((s) => s.codec_type === 'audio');
const dur = Number(pr.format.duration);
const rot = Math.abs(Number(vs?.side_data_list?.find((d) => d.rotation != null)?.rotation || 0));
let [w, h] = [vs.width, vs.height];
if (rot === 90 || rot === 270) [w, h] = [h, w];
const [fn, fd] = vs.r_frame_rate.split('/').map(Number);
const fps = fd ? fn / fd : fn;
const aspect = Math.abs(w / h - 9 / 16) < 0.05 ? '9:16' : Math.abs(w / h - 16 / 9) < 0.05 ? '16:9' : Math.abs(w / h - 1) < 0.05 ? '1:1' : Math.abs(w / h - 4 / 5) < 0.05 ? '4:5' : `${w}x${h}`;

// ---- shots
const sd = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-an', '-vf', `select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-']).stderr;
const cuts = [...sd.matchAll(/pts_time:([\d.]+)/g)].map((m) => +(+m[1]).toFixed(2)).filter((t, i, a) => t > 0.15 && (i === 0 || t - a[i - 1] > 0.15));
const bounds = [0, ...cuts, dur];
const shots = bounds.slice(0, -1).map((s, i) => ({i: i + 1, start: s, end: bounds[i + 1], dur: +(bounds[i + 1] - s).toFixed(2)}));
const lens = shots.map((s) => s.dur).sort((a, b) => a - b);
const median = lens[Math.floor(lens.length / 2)];
const mean = +(dur / shots.length).toFixed(2);
const half = dur / 2;
const firstHalf = shots.filter((s) => s.start < half).length, secondHalf = shots.length - firstHalf;
const pace = secondHalf > firstHalf * 1.3 ? 'speeds up' : firstHalf > secondHalf * 1.3 ? 'slows down' : 'steady';

// ---- one frame per shot, numbered, tiled
const thumbs = [];
const tw = aspect === '9:16' || h > w ? 180 : 320, th = Math.round(tw * h / w);
const fontArg = process.platform === 'win32' ? "fontfile='C\\:/Windows/Fonts/arial.ttf':" : '';
shots.slice(0, 48).forEach((s) => {
  const t = (s.start + s.end) / 2;
  const f = path.join(outDir, `shot_${String(s.i).padStart(2, '0')}.jpg`);
  run('ffmpeg', ['-v', 'error', '-y', '-ss', t.toFixed(2), '-i', file, '-frames:v', '1', '-vf',
    `scale=${tw}:${th},drawtext=${fontArg}text='${s.i}  ${s.dur}s':x=6:y=6:fontsize=${Math.round(tw / 9)}:fontcolor=white:box=1:boxcolor=black@0.6`, f]);
  if (fs.existsSync(f)) thumbs.push(f);
});
const cols = Math.min(8, thumbs.length) || 1;
if (thumbs.length) {
  const rows = Math.ceil(thumbs.length / cols);
  const pad = rows * cols - thumbs.length;
  const inputs = thumbs.flatMap((f) => ['-i', f]);
  const filter = `${thumbs.map((_, k) => `[${k}:v]`).join('')}${pad ? '' : ''}xstack=inputs=${thumbs.length}:layout=${thumbs.map((_, k) => `${(k % cols) * tw}_${Math.floor(k / cols) * th}`).join('|')}:fill=black`;
  if (thumbs.length === 1) fs.copyFileSync(thumbs[0], path.join(outDir, 'shots.jpg'));
  else run('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', filter, '-frames:v', '1', path.join(outDir, 'shots.jpg')]);
  thumbs.forEach((f) => fs.rmSync(f, {force: true}));
}

// ---- audio
let audio = {present: hasAudio};
if (hasAudio) {
  const eb = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-']).stderr;
  const I = Number((eb.slice(eb.lastIndexOf('Summary:')).match(/I:\s+(-?[\d.]+)/) || [])[1]);
  const si = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'silencedetect=noise=-40dB:d=0.4', '-f', 'null', '-']).stderr;
  const gaps = [...si.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_duration: ([\d.]+)/g)].map((m) => [+(+m[1]).toFixed(2), +(+m[2]).toFixed(2)]);
  audio = {present: true, lufs: I, silentGaps: gaps, soundThroughout: gaps.reduce((a, g) => a + g[1], 0) < dur * 0.1};
}

// ---- transcript
let transcript = null;
if (doTranscribe && hasAudio) {
  const tj = path.join(outDir, 'transcript.json');
  const r = run('node', [path.join(HERE, 'transcribe.mjs'), file, '--out', tj]);
  if (r.status === 0 && fs.existsSync(tj)) {
    const t = Object.values(JSON.parse(fs.readFileSync(tj, 'utf8')))[0] || [];
    const words = t.flatMap((s) => s.w || []);
    const spoken = words.length ? words[words.length - 1][1] - words[0][0] : 0;
    transcript = {text: t.map((s) => s.t).join(' '), hookLine: t[0]?.t || '', firstWordAt: words[0]?.[0] ?? null,
      words: words.length, wordsPerSecond: spoken > 0 ? +(words.length / spoken).toFixed(2) : null};
  } else {
    console.log('  note   transcription unavailable - run transcribe.mjs or ElevenLabs on the file');
  }
}

const result = {
  source: src, analyzedAt: new Date().toISOString().slice(0, 10),
  format: {duration: +dur.toFixed(2), width: w, height: h, aspect, fps: +fps.toFixed(2)},
  rhythm: {shots: shots.length, medianShot: median, meanShot: mean, cutsPer10s: +(cuts.length / dur * 10).toFixed(1),
    firstCutAt: cuts[0] ?? null, pace, threshold},
  shots, audio, transcript,
};
fs.writeFileSync(path.join(outDir, 'reference.json'), JSON.stringify(result, null, 1));

console.log(`\n  reference: ${path.basename(file)}  ${result.format.duration}s  ${aspect}  ${Math.round(fps)}fps`);
console.log(`  rhythm   ${shots.length} shots, median ${median}s, mean ${mean}s, ${result.rhythm.cutsPer10s} cuts/10s, first cut at ${cuts[0] ?? '-'}s, pacing ${pace}`);
console.log(`  shots    ${shots.map((s) => s.dur).join(' | ')}`);
if (hasAudio) console.log(`  audio    ${audio.lufs} LUFS, ${audio.silentGaps.length} silent gap(s)${audio.soundThroughout ? ', sound throughout' : ''}`);
if (transcript) console.log(`  speech   ${transcript.words} words, ${transcript.wordsPerSecond} w/s, first word at ${transcript.firstWordAt}s\n           hook: "${transcript.hookLine}"`);
console.log(`\n  wrote ${path.join(outDir, 'reference.json')} and shots.jpg - read the sheet for framing, text style and transitions\n`);

#!/usr/bin/env node
/**
 * contact_sheet.mjs - tile frames sampled across a video into one JPEG, or lay reference shots
 * beside the library clips matched to them.
 *
 *   node contact_sheet.mjs <input> [output.jpg] [tiles]
 *   node contact_sheet.mjs --match matches.json [output.jpg]
 *
 * Three uses:
 *
 *   1. Vetting a library clip before picking it. The Recharm poster shows one
 *      frame, which will not tell you whether a burned-in caption appears
 *      halfway through. This will.
 *
 *   2. QC on a finished render - check caption legibility, joins, and the
 *      closing frame in a single image instead of scrubbing.
 *
 *   3. --match: the shot-for-shot sheet for the Step 5 plan. matches.json is an array of
 *        {"shot": 3, "ref": "ref/search/shot_03.jpg", "clip": "<posterUrl | downloadUrl | local file | null>",
 *         "clipName": "AB12 - Product Demo", "similarity": 0.81}
 *      Each pair shows the reference frame (left) and the pick (right) with the shot number, the
 *      similarity and its band (same shot / strong / loose). "clip": null draws a GAP tile -
 *      a shot the library cannot cover, said out loud in the plan. Relative paths resolve against
 *      the current folder, then the folder matches.json is in.
 *
 * <input> may be a local path or an https URL (clip downloadUrl works directly).
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

function probeDuration(src) {
  const r = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', src]);
  if (r.status !== 0) return null;
  const d = parseFloat((r.stdout || '').trim());
  return Number.isFinite(d) ? d : null;
}

if (process.argv[2] === '--match') {
  matchSheet(process.argv[3], process.argv[4] || 'matches.jpg');
} else {
  sampleSheet(process.argv[2], process.argv[3] || 'contact_sheet.jpg', parseInt(process.argv[4] || '9', 10));
}

function sampleSheet(input, output, tiles) {
  if (!input) {
    console.error('usage: node contact_sheet.mjs <input> [output.jpg] [tiles]\n       node contact_sheet.mjs --match matches.json [output.jpg]');
    process.exit(1);
  }
  const cols = Math.ceil(Math.sqrt(tiles));
  const rows = Math.ceil(tiles / cols);
  const dur = probeDuration(input);
  if (dur == null) {
    console.error(`could not read duration of ${input} - is it a valid video?`);
    process.exit(1);
  }
  // Sample inside the clip rather than at the very edges: the true first and last
  // frames are often a fade or a black frame and waste two tiles.
  const start = dur * 0.02;
  const span = dur * 0.96;
  const step = span / tiles;
  const fps = 1 / step;
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  const r = run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-ss', start.toFixed(3),
    '-i', input,
    '-frames:v', '1',
    '-vf', `fps=${fps.toFixed(6)},scale=240:-1,tile=${cols}x${rows}:padding=6:margin=6:color=white`,
    '-q:v', '3',
    path.resolve(output),
  ]);
  if (r.status !== 0) {
    console.error((r.stderr || '').trim().split('\n').slice(-15).join('\n'));
    process.exit(1);
  }
  console.log(`${output}  -  ${tiles} frames across ${dur.toFixed(2)}s (${cols}x${rows}, one every ${step.toFixed(2)}s)`);
}

function matchSheet(file, output) {
  if (!file || !fs.existsSync(file)) {
    console.error('usage: node contact_sheet.mjs --match matches.json [output.jpg]');
    process.exit(1);
  }
  const items = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(items) || !items.length) { console.error('matches.json must be a non-empty array'); process.exit(1); }
  const baseDir = path.dirname(path.resolve(file));
  const resolve = (p) => (!p || /^https?:/i.test(p) || fs.existsSync(p)) ? p : path.join(baseDir, p);
  const W = 240, H = 300, LBL = 46;
  const fontArg = process.platform === 'win32' ? "fontfile='C\\:/Windows/Fonts/arial.ttf':" : '';
  const clean = (s) => String(s ?? '').replace(/[^\w .#+\-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
  const band = (s) => s == null ? 'gap' : s >= 0.85 ? 'same shot' : s >= 0.75 ? 'strong' : s >= 0.65 ? 'loose' : 'gap';
  const fit = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x222222,setsar=1`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'match-'));
  const pairs = [];

  items.forEach((m, k) => {
    const out = path.join(tmp, `pair_${String(k).padStart(2, '0')}.png`);
    const args = ['-v', 'error', '-y'];
    const ref = resolve(m.ref);
    if (ref) args.push('-i', ref); else args.push('-f', 'lavfi', '-i', `color=c=0x444444:s=${W}x${H}`);
    const clip = resolve(m.clip);
    if (clip) {
      const d = probeDuration(clip);
      if (d && d > 0.5) args.push('-ss', (d / 2).toFixed(2));
      args.push('-i', clip);
    } else {
      args.push('-f', 'lavfi', '-i', `color=c=0x444444:s=${W}x${H}`);
    }
    const sim = typeof m.similarity === 'number' ? m.similarity : null;
    const b = clip ? band(sim) : 'gap';
    const right1 = clip ? `${sim != null ? sim.toFixed(2) + '  ' : ''}${b}` : 'GAP';
    const right2 = clip ? clean(m.clipName).slice(0, 26) : 'nothing in the library';
    const colour = b === 'gap' ? '0xff6b6b' : b === 'loose' ? '0xffc145' : '0x7dff9a';
    const txt = (t, x, y, c) => `drawtext=${fontArg}text='${t || ' '}':x=${x}:y=${H + y}:fontsize=16:fontcolor=${c}`;
    const filter = `[0:v]${fit}[a];[1:v]${fit}[b];[a][b]hstack=inputs=2,pad=iw+8:ih+${LBL}:4:0:color=0x111111,` +
      `${txt(`Shot ${clean(m.shot ?? k + 1)}`, 10, 6, 'white')},${txt('reference', 10, 26, '0xaaaaaa')},` +
      `${txt(right1, W + 14, 6, colour)},${txt(right2, W + 14, 26, '0xdddddd')}[o]`;
    const r = run('ffmpeg', [...args, '-filter_complex', filter, '-map', '[o]', '-frames:v', '1', out]);
    if (r.status !== 0 || !fs.existsSync(out)) {
      console.error(`  pair ${k + 1} (shot ${m.shot ?? '?'}) failed: ${(r.stderr || '').trim().split(/\r?\n/).pop()}`);
      return;
    }
    pairs.push(out);
  });
  if (!pairs.length) { console.error('no pairs could be drawn'); process.exit(1); }

  const PW = 2 * W + 8, PH = H + LBL, cols = Math.min(3, pairs.length), G = 8;
  const layout = pairs.map((_, k) => `${(k % cols) * (PW + G)}_${Math.floor(k / cols) * (PH + G)}`).join('|');
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  const r = pairs.length === 1
    ? run('ffmpeg', ['-v', 'error', '-y', '-i', pairs[0], '-q:v', '3', path.resolve(output)])
    : run('ffmpeg', ['-v', 'error', '-y', ...pairs.flatMap((p) => ['-i', p]), '-filter_complex',
      `${pairs.map((_, k) => `[${k}:v]`).join('')}xstack=inputs=${pairs.length}:layout=${layout}:fill=white`, '-q:v', '3', path.resolve(output)]);
  fs.rmSync(tmp, { recursive: true, force: true });
  if (r.status !== 0) { console.error((r.stderr || '').trim().split('\n').slice(-10).join('\n')); process.exit(1); }
  const counts = items.reduce((a, m) => { const b = m.clip ? band(m.similarity) : 'gap'; a[b] = (a[b] || 0) + 1; return a; }, {});
  console.log(`${output}  -  ${pairs.length} reference/pick pair(s): ${Object.entries(counts).map(([b, n]) => `${n} ${b}`).join(', ')}`);
}

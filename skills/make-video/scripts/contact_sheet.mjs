#!/usr/bin/env node
/**
 * contact_sheet.mjs - tile frames sampled across a video into one JPEG.
 *
 *   node contact_sheet.mjs <input> [output.jpg] [tiles]
 *
 * Two uses:
 *
 *   1. Vetting a library clip before picking it. The Recharm poster shows one
 *      frame, which will not tell you whether a burned-in caption appears
 *      halfway through. This will.
 *
 *   2. QC on a finished render - check caption legibility, joins, and the
 *      closing frame in a single image instead of scrubbing.
 *
 * <input> may be a local path or an https URL (clip downloadUrl works directly).
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
const output = process.argv[3] || 'contact_sheet.jpg';
const tiles = parseInt(process.argv[4] || '9', 10);

if (!input) {
  console.error('usage: node contact_sheet.mjs <input> [output.jpg] [tiles]');
  process.exit(1);
}

const cols = Math.ceil(Math.sqrt(tiles));
const rows = Math.ceil(tiles / cols);

function probeDuration(src) {
  const r = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1',
    src,
  ], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const d = parseFloat((r.stdout || '').trim());
  return Number.isFinite(d) ? d : null;
}

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

const outDir = path.dirname(path.resolve(output));
fs.mkdirSync(outDir, { recursive: true });

const r = spawnSync('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-ss', start.toFixed(3),
  '-i', input,
  '-frames:v', '1',
  '-vf', `fps=${fps.toFixed(6)},scale=240:-1,tile=${cols}x${rows}:padding=6:margin=6:color=white`,
  '-q:v', '3',
  path.resolve(output),
], { encoding: 'utf8' });

if (r.status !== 0) {
  console.error((r.stderr || '').trim().split('\n').slice(-15).join('\n'));
  process.exit(1);
}

console.log(`${output}  -  ${tiles} frames across ${dur.toFixed(2)}s (${cols}x${rows}, one every ${step.toFixed(2)}s)`);

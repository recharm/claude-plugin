#!/usr/bin/env node
/**
 * image_query.mjs - prepare query images for Recharm's image search when the picture is NOT a reference ad
 * (for a reference ad, use `analyze_reference.mjs --search-frames`).
 *
 *   node image_query.mjs <image|video|url> [more ...] [--at <secs>] [--out q/] [--size 512] [--max-kb 40]
 *
 * Inputs: a product photo from the brand cache, a storyboard or mood image the user uploaded, a clip's
 * `posterUrl`, or a clip/video (`downloadUrl` or a local file) - for a video the frame is taken at --at seconds,
 * or the middle when --at is omitted. Each input becomes <out>/<name>.jpg (~512px, under --max-kb) and
 * <out>/<name>.b64 (raw base64 to pass as the tool's `image`). Prints one line per file and writes
 * <out>/queries.json.
 *
 * Typical uses (see references/library.md, "Searching by image"):
 *   - swap a rejected clip:      node image_query.mjs "<rejected clip downloadUrl>" --out q/swap
 *   - anchor the exact product:  node image_query.mjs brand/products/oat-milk.png --out q/product
 *   - storyboard / mood frames:  node image_query.mjs board/*.png --out q/board
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {searchFrame} from './lib/searchframe.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); if (i === -1) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const outDir = path.resolve(opt('--out', 'q'));
const atArg = opt('--at', null);
const size = Number(opt('--size', '512'));
const maxBytes = Number(opt('--max-kb', '40')) * 1024;
const inputs = argv.filter((a) => !a.startsWith('--'));
if (!inputs.length) { console.error('usage: node image_query.mjs <image|video|url> [...] [--at secs] [--out q/] [--size 512] [--max-kb 40]'); process.exit(2); }
fs.mkdirSync(outDir, {recursive: true});

const IMAGE_FORMATS = /image2|_pipe|png|jpeg|webp|bmp|gif|tiff/;
function probe(src) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=format_name,duration', '-of', 'json', src], {encoding: 'utf8'});
  if (r.status !== 0) return null;
  const f = JSON.parse(r.stdout || '{}').format || {};
  const d = Number(f.duration);
  const isImage = IMAGE_FORMATS.test(f.format_name || '') && !(d > 0.5);
  return {isImage, duration: Number.isFinite(d) ? d : null};
}

const used = new Set();
const results = [];
let failed = 0;
for (const src of inputs) {
  const p = probe(src);
  if (!p) { console.error(`  skip   ${src} - ffprobe cannot read it`); failed++; continue; }
  let name = path.basename(src.split('?')[0]).replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'query';
  while (used.has(name)) name += '_';
  used.add(name);
  const at = p.isImage ? undefined : atArg != null ? Number(atArg) : (p.duration || 0) / 2;
  try {
    const f = searchFrame(src, path.join(outDir, name), {at, size, maxBytes});
    results.push({source: src, at: at ?? null, jpg: f.jpg, b64: f.b64, bytes: f.bytes, width: f.width, height: f.height});
    console.log(`  ok     ${path.relative(process.cwd(), f.b64)}  ${f.width}x${f.height}  ${(f.bytes / 1024).toFixed(1)} KB${at != null ? `  (frame at ${at.toFixed(2)}s)` : ''}`);
  } catch (e) { console.error(`  fail   ${e.message}`); failed++; }
}
fs.writeFileSync(path.join(outDir, 'queries.json'), JSON.stringify(results, null, 1));
console.log(`\n  ${results.length} query image(s) -> ${path.join(outDir, 'queries.json')}`);
process.exit(failed && !results.length ? 1 : 0);

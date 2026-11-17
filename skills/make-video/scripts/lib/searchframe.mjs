/**
 * searchframe.mjs - turn a frame of a video (or any image) into the small JPEG that
 * Recharm's `search_video_library_by_image` / `search_image_library_by_image` expect.
 *
 * The tool wants ~512px on the longest side. Every byte goes into the tool call as base64 text, so the
 * frame is re-encoded at falling quality until it fits `maxBytes` - a smaller payload is a cheaper search.
 * Writes <out>.jpg and <out>.b64 (raw base64, no data: prefix) and returns {jpg, b64, bytes, width, height}.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';

const run = (cmd, args) => spawnSync(cmd, args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});

/**
 * @param {string} input   video or image path / https URL
 * @param {string} outBase output path without extension
 * @param {{at?: number, size?: number, maxBytes?: number}} [o] at = seconds into a video (omit for an image)
 */
export function searchFrame(input, outBase, {at, size = 512, maxBytes = 40000} = {}) {
  const jpg = `${outBase}.jpg`;
  const scale = `scale='if(gte(iw,ih),${size},-2)':'if(gte(iw,ih),-2,${size})'`;
  let bytes = 0;
  for (const q of [4, 6, 9, 13, 18]) {
    const args = ['-v', 'error', '-y'];
    if (at != null) args.push('-ss', Math.max(0, at).toFixed(3));
    args.push('-i', input, '-frames:v', '1', '-vf', scale, '-q:v', String(q), jpg);
    const r = run('ffmpeg', args);
    if (r.status !== 0 || !fs.existsSync(jpg)) throw new Error(`ffmpeg could not grab a frame from ${input}${at != null ? ` at ${at}s` : ''}: ${(r.stderr || '').trim().split(/\r?\n/).pop()}`);
    bytes = fs.statSync(jpg).size;
    if (bytes <= maxBytes) break;
  }
  const buf = fs.readFileSync(jpg);
  const b64 = `${outBase}.b64`;
  fs.writeFileSync(b64, buf.toString('base64'));
  const p = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'json', jpg]).stdout || '{}');
  const s = (p.streams || [])[0] || {};
  return {jpg, b64, bytes, width: s.width, height: s.height};
}

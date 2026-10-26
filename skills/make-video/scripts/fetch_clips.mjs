#!/usr/bin/env node
/**
 * fetch_clips.mjs - get the picked clips into the workspace, whatever the network allows.
 *
 *   node fetch_clips.mjs picks.json --out clips/ [--from <folder> ...]
 *
 * picks.json: [{"clipSymbol": "EGP", "clipName": "EGP - Pouring Product", "downloadUrl": "https://..."}, ...]
 * (the shortlist from the search subagents; extra fields are ignored).
 *
 * For each clip, in order:
 *   1. already in --out or any --from folder (matched by the URL's file name - what a browser saves - or the
 *      clip symbol) -> copied in, no download
 *   2. downloaded from the Recharm URL, falling back to the standard S3 host if the accelerated one is blocked
 *   3. still missing -> listed in <out>/DOWNLOAD-THESE.md and .html: a link per clip and the file name to keep
 *
 * Writes <out>/<SYMBOL>.mp4 for every clip it got, and <out>/clips.json mapping symbol -> local file (build_ad
 * reads it when the EDL sets "clipsDir"). Exit 0 when all arrived, 3 when some must be fetched by the user.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fetchWithFallback, findLocal, urlBasename} from './lib/net.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const froms = argv.flatMap((a, i) => (a === '--from' ? [argv[i + 1]] : []));
const file = argv[0];
const out = path.resolve(opt('--out', 'clips'));
if (!file || !fs.existsSync(file)) { console.error('usage: node fetch_clips.mjs picks.json --out clips/ [--from <folder> ...]'); process.exit(2); }
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const picks = (Array.isArray(raw) ? raw : raw.picks || raw.clips || []).filter((p) => p.downloadUrl || p.url);
fs.mkdirSync(out, {recursive: true});

const readable = (f) => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], {encoding: 'utf8'});
  return r.status === 0 && Number(r.stdout.trim()) > 0;
};

const map = {}, missing = [];
console.log(`\n  fetch_clips: ${picks.length} clips -> ${out}\n`);
for (const p of picks) {
  const url = p.downloadUrl || p.url, sym = p.clipSymbol || urlBasename(url).replace(/\.\w+$/, '');
  const dest = path.join(out, `${sym}.mp4`);
  if (fs.existsSync(dest) && readable(dest)) { map[sym] = dest; console.log(`  have     ${sym}`); continue; }
  const local = findLocal(url, sym, [...froms, out]);
  if (local && readable(local)) {
    if (path.resolve(local) !== dest) fs.copyFileSync(local, dest);
    map[sym] = dest; console.log(`  found    ${sym}  (${path.basename(local)})`); continue;
  }
  const r = await fetchWithFallback(url, dest);
  if (r.ok && readable(dest)) {
    map[sym] = dest;
    console.log(`  download ${sym}${r.url !== url ? '  (via the standard S3 host)' : ''}`);
  } else {
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    missing.push({...p, sym, url, reason: r.reason});
    console.log(`  MISSING  ${sym}  - ${r.reason}`);
  }
}
fs.writeFileSync(path.join(out, 'clips.json'), JSON.stringify(map, null, 2));

if (missing.length) {
  const md = [`# Download these ${missing.length} clips`, '',
    'This workspace can\'t reach the clip storage. Open each link, save the file (keep the name the browser gives it),',
    `then put them all in one folder and share that folder, or upload them to the chat. They are matched by file name.`, '',
    '| Clip | Save as (browser default) | Link |', '|---|---|---|',
    ...missing.map((m) => `| ${m.clipName || m.sym} | ${urlBasename(m.url)} | ${m.url} |`), ''].join('\n');
  fs.writeFileSync(path.join(out, 'DOWNLOAD-THESE.md'), md);
  const html = `<!doctype html><meta charset="utf-8"><title>Clips to download</title><body style="font-family:system-ui;max-width:760px;margin:40px auto;padding:0 16px">
<h1>Download these ${missing.length} clips</h1><p>Click each link (it saves under the right name), put the files in one folder, then share the folder or upload them to the chat.</p>
<ol>${missing.map((m) => `<li><a href="${m.url}" download>${m.clipName || m.sym}</a> <small>(${urlBasename(m.url)})</small></li>`).join('')}</ol></body>`;
  fs.writeFileSync(path.join(out, 'DOWNLOAD-THESE.html'), html);
  console.log(`\n  ${picks.length - missing.length}/${picks.length} clips here. The rest are listed in ${path.join(out, 'DOWNLOAD-THESE.md')} (and .html) -`);
  console.log('  send that list to the user, then re-run with --from <their folder or the upload folder>.\n');
  process.exit(3);
}
console.log(`\n  all ${picks.length} clips here.\n`);

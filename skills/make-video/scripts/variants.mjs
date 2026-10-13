#!/usr/bin/env node
/**
 * variants.mjs - A/B hook variants: swap only the opening, reuse the rest of the ad.
 *
 *   node variants.mjs --edl edl.json --variants variants.json [--draft] [--gate --brand <slug>]
 *
 * variants.json:
 *   { "replaces": 1,                       // how many opening segments the hook replaces (default 1)
 *     "variants": [
 *       { "id": "question", "mechanism": "question",
 *         "segments": [ { "clipSymbol": "...", "url": "...", "in": 0, "out": 2.4 } ],
 *         "captions": [ { "start": 0, "end": 1.2, "text": "...", "anim": "fade" } ] }   // hook captions only
 *     ] }
 *
 * For each variant it writes edl-<id>.json - the hook segments and captions in, every later caption, sound effect
 * and overlay shifted by the change in hook length - and renders it. The body's normalised clips come from the
 * segment cache, so each extra variant costs about one hook's encode. The base ad is variant "base".
 * Pattern from iart-ai/ad-video-skills (one template, a table of variants, MIT); "swap the hook, reuse the body"
 * idea from hypit (idea only).
 *
 * Vary the hook's MECHANISM (question / result / problem shown / bold claim / reaction), one variable per variant,
 * so a winner tells you something. It warns when two variants open on the same clip or the same first words.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const edlPath = opt('--edl'), varPath = opt('--variants'), brand = opt('--brand');
const draft = argv.includes('--draft'), gate = argv.includes('--gate');
if (!edlPath || !varPath) { console.error('usage: node variants.mjs --edl edl.json --variants variants.json [--draft] [--gate --brand <slug>]'); process.exit(2); }

const base = JSON.parse(fs.readFileSync(edlPath, 'utf8'));
const spec = JSON.parse(fs.readFileSync(varPath, 'utf8'));
const K = spec.replaces ?? 1;
const dir = path.dirname(path.resolve(edlPath));
const tDur = (s) => (s && s.transition && typeof s.transition === 'object' ? Number(s.transition.duration ?? 0.4) : 0);
// Output time at which segment index `k` starts, for a segment list.
const startOf = (segs, k) => { let t = 0; for (let i = 0; i < k; i++) t += segs[i].out - segs[i].in - (i + 1 < segs.length ? tDur(segs[i + 1]) : 0); return t; };

const oldHookEnd = startOf(base.segments, K);
const outBase = (base.output || 'out/ad.mp4').replace(/\.mp4$/i, '');
const rows = [];
const all = [{id: 'base', mechanism: spec.baseMechanism || 'original', segments: base.segments.slice(0, K), captions: (base.captions || []).filter((c) => c.start < oldHookEnd)}, ...spec.variants];

// Variety check across variants.
const firstWords = (v) => ((v.captions || [])[0]?.text || '').toLowerCase().split(/\s+/).slice(0, 2).join(' ');
for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
  const a = all[i], b = all[j];
  if (a.segments[0]?.clipSymbol && a.segments[0].clipSymbol === b.segments[0]?.clipSymbol && a.segments[0].in === b.segments[0].in)
    console.log(`  warn   "${a.id}" and "${b.id}" open on the same clip and moment - change the picture, not just the words`);
  if (firstWords(a) && firstWords(a) === firstWords(b)) console.log(`  warn   "${a.id}" and "${b.id}" start with the same words ("${firstWords(a)}")`);
  if (a.mechanism && a.mechanism === b.mechanism) console.log(`  warn   "${a.id}" and "${b.id}" use the same hook mechanism (${a.mechanism})`);
}

for (const v of all) {
  const edl = JSON.parse(JSON.stringify(base));
  if (v.id !== 'base') {
    // keep the first body segment's transition relative to the new hook
    edl.segments = [...v.segments, ...base.segments.slice(K)];
    const newHookEnd = startOf(edl.segments, v.segments.length);
    const delta = newHookEnd - oldHookEnd;
    const shift = (x) => +(x + delta).toFixed(3);
    edl.captions = [...(v.captions || []), ...(base.captions || []).filter((c) => c.start >= oldHookEnd - 0.01).map((c) => ({...c, start: shift(c.start), end: shift(c.end)}))];
    if (edl.audio?.sfx) edl.audio.sfx = edl.audio.sfx.filter((s) => s.at >= oldHookEnd - 0.01).map((s) => ({...s, at: shift(s.at)})).concat(v.sfx || []);
    if (edl.overlays) edl.overlays = edl.overlays.filter((o) => o.at >= oldHookEnd - 0.01).map((o) => ({...o, at: shift(o.at)}));
    if (edl.targetDuration && Math.abs(delta) > 0.5) console.log(`  note   "${v.id}" changes the length by ${delta > 0 ? '+' : ''}${delta.toFixed(2)}s`);
  }
  edl.output = `${outBase}-${v.id}.mp4`;
  const vp = path.join(dir, `edl-${v.id}.json`);
  fs.writeFileSync(vp, JSON.stringify(edl, null, 2));
  const t0 = Date.now();
  const r = spawnSync('node', [path.join(HERE, 'build_ad.mjs'), vp, ...(draft ? ['--draft'] : [])], {encoding: 'utf8', cwd: dir});
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const reused = (r.stdout.match(/(\d+)\/(\d+) segments reused/) || [])[0] || '0 reused';
  const done = (r.stdout.match(/done\s+(.+)/) || [])[1];
  let verdict = '';
  if (gate && done && !draft) {
    const g = spawnSync('node', [path.join(HERE, 'gate.mjs'), done.trim(), '--edl', vp, ...(brand ? ['--brand', brand] : [])], {encoding: 'utf8'});
    verdict = g.status === 0 ? 'PASS' : 'BLOCKED';
  }
  rows.push({id: v.id, mechanism: v.mechanism || '', hook: (v.captions || [])[0]?.text || '', secs, reused, file: done?.trim() || `FAILED: ${(r.stderr || '').trim().split(/\r?\n/).pop()}`, verdict});
}

console.log('\n  | variant | mechanism | opening line | render | cache | gate | file |\n  |---|---|---|---|---|---|---|');
for (const r of rows) console.log(`  | ${r.id} | ${r.mechanism} | ${r.hook} | ${r.secs}s | ${r.reused} | ${r.verdict || '-'} | ${path.basename(r.file)} |`);
console.log('');

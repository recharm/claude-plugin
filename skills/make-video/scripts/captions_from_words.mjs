#!/usr/bin/env node
/**
 * captions_from_words.mjs - turn word timings into caption bursts on the OUTPUT timeline.
 *
 *   node captions_from_words.mjs --edl edl.json --words transcripts.json [--write]
 *        [--max-words 4] [--band middle | --y 0.42] [--punch "higher in protein"]
 *        [--fix "martial moments=marshmallows"] [--fix ...]
 *        [--style auto|pop|karaoke|pill|highlight|slam|gradient|neon|boxed --brand <slug> --project <hyperframes project>]
 *
 * Word timings come from transcribe.mjs (local Whisper) or ElevenLabs transcription, keyed by clip
 * symbol, in SOURCE seconds: { "<clipSymbol>": [ { w: [[start, end, word], ...] } ] }.
 *
 * For each EDL segment it keeps the words inside [in, out], shifts them onto the output timeline
 * (sum of earlier segments minus transition overlaps - the same maths the builder prints), and groups
 * them into bursts: at most --max-words words, split at sentence punctuation and at pauses over 0.35s.
 * A caption starts on its first word (never early) and holds until the next caption or 0.25s after its
 * last word. Bursts shorter than 0.8s merge into the next when the result stays within 5 words.
 *
 * Animation follows captions-and-timing.md: the first caption snaps in with `fade` (the hook), the rest
 * `fadeup`, `punch` on the one burst containing --punch, and `exit: "cut"` when the next caption follows
 * immediately. Without --write it prints the captions for review; with --write it replaces edl.captions.
 * Always read the result: Whisper mishears brand words - fix them with --fix "heard=correct".
 *
 * --style sets edl.captionStyle.animated: word-by-word captions rendered by HyperFrames in the brand's colours
 * (build_ad.mjs). "auto" picks one that suits the brand's style (motifs.json) and differs from its last ad's.
 * Each caption keeps its word timings ("words") for that.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const argv = process.argv.slice(2);
const fixes = [];
const opts = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--write') opts.write = true;
  else if (a === '--fix') fixes.push(argv[++i]);
  else if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
}
if (!opts.edl || !opts.words) {
  console.error('usage: node captions_from_words.mjs --edl edl.json --words transcripts.json [--write] [--max-words 4] [--band middle | --y 0.42] [--punch "phrase"] [--fix "heard=correct"]');
  process.exit(2);
}
const edl = JSON.parse(fs.readFileSync(opts.edl, 'utf8'));
const words = JSON.parse(fs.readFileSync(opts.words, 'utf8'));
const MAXW = Number(opts['max-words'] ?? 5);
const PAUSE = 0.35, MINDUR = 0.8, HOLD = 0.25, MAXDUR = 2.4;

const tDur = (seg) => (seg.transition && typeof seg.transition === 'object' ? Number(seg.transition.duration ?? 0.4) : 0);

// Output timeline, as build_ad.mjs computes it: each segment starts early by its own transition.
let t = 0;
const timeline = edl.segments.map((seg, i) => {
  const dur = Number(seg.out) - Number(seg.in ?? 0);
  const start = i === 0 ? 0 : t - tDur(seg);
  t = start + dur;
  return { seg, start, end: t };
});
const total = t;

// Collect words on the output timeline.
const ow = [];
for (const [si, { seg, start }] of timeline.entries()) {
  const key = seg.clipSymbol;
  const segs = words[key];
  if (!segs) continue;
  const tin = Number(seg.in ?? 0), tout = Number(seg.out);
  for (const s of segs) for (const [ws, we, w] of s.w || []) {
    if (ws < tin - 0.02 || we > tout + 0.05) continue;
    ow.push({ s: +(ws - tin + start).toFixed(2), e: +(Math.min(we, tout) - tin + start).toFixed(2), w, si });
  }
}
if (!ow.length) { console.error('no words fall inside the EDL segments - check clipSymbol keys and in/out points'); process.exit(1); }

// Group into phrases: never across a cut (segment change), a sentence end, a pause over 0.35s,
// or a comma once the phrase has 2+ words. Long phrases are split into EVEN groups of <= MAXW
// ("this has definitely become a / pantry staple around here."), not 4 + an orphan.
const phrases = [];
let cur = [];
const flush = () => { if (cur.length) phrases.push(cur); cur = []; };
ow.forEach((w, k) => {
  const prev = ow[k - 1];
  if (cur.length && (prev.si !== w.si || w.s - prev.e > PAUSE)) flush();
  cur.push(w);
  if (/[.!?]$/.test(w.w) || (/[,;:]$/.test(w.w) && cur.length >= 2)) flush();
});
flush();

const bursts = [];
for (const p of phrases) {
  const k = Math.ceil(p.length / MAXW);
  const size = Math.ceil(p.length / k);
  for (let i = 0; i < p.length; i += size) bursts.push(p.slice(i, i + size));
}

// Merge a burst that would flash by into the next one - same cut, no sentence end, still <= MAXW.
for (let k = 0; k < bursts.length - 1; k++) {
  const b = bursts[k], n = bursts[k + 1];
  const last = b[b.length - 1];
  if (last.e - b[0].s < MINDUR && last.si === n[0].si && !/[.!?]$/.test(last.w) && b.length + n.length <= MAXW) {
    bursts.splice(k, 2, [...b, ...n]);
    k--;
  }
}

const applyFixes = (text) => fixes.reduce((acc, f) => {
  const [from, to] = f.split('=');
  return acc.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), to);
}, text);

const place = opts.y != null ? { y: Number(opts.y) } : { band: opts.band || 'middle' };
const punchNeedle = opts.punch ? opts.punch.toLowerCase() : null;
let punched = false;

const captions = bursts.map((b, k) => {
  const start = b[0].s;
  const next = bursts[k + 1]?.[0].s;
  const end = Math.min(next ?? total, b[b.length - 1].e + HOLD, total);
  let text = applyFixes(b.map((w) => w.w).join(' ')).replace(/\s+([,.!?])/g, '$1').replace(/\s+-(?=\w)/g, '-');
  // Capitalise a caption that starts a sentence or a new cut.
  const prevW = k > 0 ? bursts[k - 1][bursts[k - 1].length - 1] : null;
  if (!prevW || /[.!?]$/.test(prevW.w) || prevW.si !== b[0].si) text = text.charAt(0).toUpperCase() + text.slice(1);
  let anim = k === 0 ? 'fade' : 'fadeup';
  if (punchNeedle && !punched && text.toLowerCase().includes(punchNeedle)) { anim = 'punch'; punched = true; }
  const c = { start: +start.toFixed(2), end: +Math.max(end, start + 0.3).toFixed(2), text, ...place, anim };
  // word timings on the output timeline - animated caption styles (captionStyle.animated) light each word as it is said
  c.words = b.map((w) => [+w.s.toFixed(2), +w.e.toFixed(2), w.w]);
  if (next != null && next - end < 0.15) c.exit = 'cut';
  return c;
});

if (punchNeedle && !punched) console.error(`  warn   --punch "${opts.punch}" not found in any caption`);

for (const c of captions) console.log(`  ${c.start.toFixed(2).padStart(6)}-${c.end.toFixed(2).padEnd(6)} ${c.anim.padEnd(7)} ${c.text}`);
console.log(`\n  ${captions.length} captions over ${total.toFixed(2)}s (timeline from in/out and transitions)`);
// ---- the animated caption style
if (opts.style) {
  const STYLES = ['pop', 'karaoke', 'pill', 'highlight', 'slam', 'gradient', 'neon', 'boxed'];
  let st = opts.style;
  const root = process.env.MAKE_VIDEO_ROOT || path.join(os.homedir(), '.claude', 'make-video');
  const B = opts.brand ? path.join(root, 'brands', opts.brand) : null;
  const read = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
  if (st === 'auto') {
    const brandStyle = (B && read(path.join(B, 'motifs.json'))?.style) || 'bold';
    const pool = {playful: ['pop', 'karaoke', 'slam', 'highlight', 'gradient'], premium: ['pill', 'boxed', 'gradient', 'pop'],
      clinical: ['boxed', 'pill', 'highlight', 'pop']}[brandStyle] || ['slam', 'highlight', 'karaoke', 'neon', 'pop'];
    const hist = (B && read(path.join(B, 'motion-history.json'))?.ads) || [];
    const recent = hist.slice(-2).map((a) => a.captionStyle).filter(Boolean);
    const fresh = pool.filter((x) => !recent.includes(x));
    const from = fresh.length ? fresh : pool;
    st = from[Math.floor(Math.random() * from.length)];
    console.error(`  caption style: ${st} (brand style ${brandStyle}${recent.length ? `, recent ads used ${recent.join('/')}` : ''})`);
  }
  if (!STYLES.includes(st)) { console.error(`  --style "${st}" - use auto or one of ${STYLES.join(', ')}`); process.exit(2); }
  edl.captionStyle = {...(edl.captionStyle || {}), animated: st, ...(opts.project ? {project: opts.project} : {})};
  if (opts.write && B) {
    // remember it, so the brand's next ad captions differently
    const hf = path.join(B, 'motion-history.json'), h = read(hf) || {ads: []};
    const nm = path.basename(edl.output || 'ad', '.mp4').replace(/-draft$/, '');
    const e = (h.ads || []).find((a) => a.name === nm);
    if (e) e.captionStyle = st; else (h.ads = h.ads || []).push({name: nm, date: new Date().toISOString().slice(0, 10), stage: 'captions', captionStyle: st});
    try { fs.writeFileSync(hf, JSON.stringify(h, null, 2)); } catch { /* read-only cache */ }
  }
}

if (opts.write) {
  const keep = (edl.captions || []).filter((c) => c.keep === true);
  edl.captions = [...captions, ...keep];
  fs.writeFileSync(opts.edl, JSON.stringify(edl, null, 2));
  console.log(`  written to ${opts.edl}${keep.length ? ` (kept ${keep.length} caption(s) marked "keep": true)` : ''}`);
} else {
  console.log('  (dry run - add --write to put them in the EDL)');
}

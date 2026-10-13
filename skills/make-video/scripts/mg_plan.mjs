#!/usr/bin/env node
/**
 * mg_plan.mjs - choose a DIFFERENT, fitting animation for every beat, automatically.
 *
 *   node mg_plan.mjs beats.json --brand <slug> --out <project>/ads/<name>.json [--seed 1] [--lead 0.2]
 *
 * You give it the beats (the script's lines with their role and VO timing, and any footage you picked for a
 * beat). It reads the brand's motifs.json and this brand's motion history, scores every animation that could
 * carry each beat, and picks greedily with penalties for repetition - so an ad uses many kinds of motion
 * graphics without anyone listing them, and the next ad for the same brand leads with different ones.
 *
 * beats.json:
 * {"beats": [
 *   {"role": "hook", "line": "Your healthy cereal is wrecking your morning.", "start": 0, "end": 3.4,
 *    "text": "Your \"healthy\" cereal?", "sourceLabel": "\"HEALTHY\" CEREAL"},
 *   {"role": "problem", "line": "Sugar spike at nine. Crash by ten.", "start": 4.1, "end": 8.5,
 *    "labels": ["8AM", "9AM", "10AM", "11AM"], "callouts": [{"i": 1, "text": "SUGAR SPIKE"}, {"i": 2, "text": "CRASH", "tone": "bad", "big": true}]},
 *   {"role": "pivot", "line": "Meet Magic Spoon.", "start": 10.4, "end": 11.4, "footage": {"src": "clips/ELP.mp4", "trimBefore": 2.0, "action": "Pouring Product"}},
 *   {"role": "claim", "line": "Zero grams of sugar.", "start": 11.8, "end": 13.0},
 *   {"role": "benefit", "line": "Keto-friendly. Gluten-free. Grain-free.", "start": 19.5, "end": 22.1},
 *   {"role": "taste", "line": "Tastes just like you remember.", "start": 22.4, "end": 25.2, "footage": {"src": "clips/AVH.mp4", "trimBefore": 14}},
 *   {"role": "cta", "line": "Grab yours at magicspoon.com", "start": 25.6, "end": 27.9}
 * ]}
 * roles: hook, problem, agitate, pivot, claim, benefit, how, taste, social, offer, cta.
 * Optional per beat: text (on-screen heading), claim (the website claim it states), items (list), labels /
 * callouts / points (chart), footage {src, trimBefore, action}, prefer: "<kind>" (a nudge, not a lock), avoid: [kinds].
 *
 * Output: the ad JSON (every scene with visuals, transitions, backgrounds, timings pinned to the VO + lead),
 * each scene with a "_plan" note saying what was picked and why. Then: mg_check.mjs, preview, edit freely.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const file = argv[0];
const brand = opt('--brand');
const out = opt('--out');
if (!file || !brand || !out) { console.error('usage: node mg_plan.mjs beats.json --brand <slug> --out <project>/ads/<name>.json [--seed 1] [--lead 0.2]'); process.exit(2); }
const seed = Number(opt('--seed', 1)), LEAD = Number(opt('--lead', 0.2));
const ROOT = process.env.MAKE_VIDEO_ROOT || path.join(os.homedir(), '.claude', 'make-video');
const B = path.join(ROOT, 'brands', brand);
const readJ = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const spec = readJ(file);
if (!spec?.beats?.length) { console.error(`no beats in ${file}`); process.exit(2); }
const motifs = readJ(path.join(B, 'motifs.json'), null);
if (!motifs) { console.error(`no motifs.json for ${brand} - run brand_motifs.mjs --brand ${brand} --write first`); process.exit(1); }
const history = readJ(path.join(B, 'motion-history.json'), {ads: []});
const style = motifs.style || 'bold';
const bj = readJ(path.join(B, 'brand.json'), {});
let siteUrl = '';
try { siteUrl = new URL(bj.website).hostname.replace(/^www\./, ''); } catch { siteUrl = bj.website || ''; }

// ------------------------------------------------------------------ helpers
let rs = seed * 9301 + 49297;
const rnd = () => ((rs = (rs * 9301 + 49297) % 233280) / 233280);
const low = (s) => String(s || '').toLowerCase();
const r2 = (x) => Math.round(x * 100) / 100;
const cutout = (motifs.cutouts || [])[0] || (motifs.packshots || [])[0];
const container = {beverage: 'cup', supplement: 'jar', skincare: 'jar', cereal: 'bowl', snack: 'bowl', food: 'bowl', pet: 'bowl'}[motifs.category] || 'none';
const iconMap = motifs.icons || {};
const attrsIn = (t) => {
  // "Grain-free" and "grain free" are the same attribute: compare with hyphens as spaces.
  const n = (x) => low(x).replace(/-/g, ' ');
  const s = n(t), hits = [];
  for (const k of Object.keys(iconMap).sort((a, b) => b.length - a.length)) {
    if (s.includes(n(k)) && !hits.some((h) => n(h).includes(n(k)) || n(k).includes(n(h)))) hits.push(k);
  }
  return hits.sort((a, z) => s.indexOf(n(a)) - s.indexOf(n(z))); // in the order the line says them
};
// The attribute as the line says it ("Keto-friendly", not the icon key "keto").
let currentLine = '';
const title = (k) => {
  const m = currentLine.match(new RegExp(`[\\w-]*${k.replace(/[-\s]/g, '[-\\s]')}[\\w-]*`, 'i'));
  return (m ? m[0] : k).toUpperCase();
};
const STOP = new Set(['of', 'the', 'a', 'an', 'in', 'every', 'per', 'just', 'only', 'and', 'with', 'your', 'grams', 'gram']);
// The words right after the number in the line: "0g of sugar" -> SUGAR, "12-14g of complete protein in every bowl" -> COMPLETE PROTEIN.
const nounAfter = (text, val) => {
  const t = digitise(text), i = val ? t.indexOf(low(val)) : -1;
  if (i < 0) return '';
  const words = t.slice(i + val.length).split(/[.,;!?]/)[0].split(/\s+/).filter(Boolean);
  const out = [];
  for (const w of words) { if (STOP.has(w)) { if (out.length) break; continue; } out.push(w); if (out.length === 2) break; }
  return out.join(' ').toUpperCase();
};
const numIn = (t) => (String(t).match(/\$?\d[\d,.]*(?:\s?-\s?\d[\d,.]*)?\s?(?:%|g\b|mg\b|\+)?/gi) || []).map((n) => n.replace(/\s/g, ''));
const WORDNUM = {zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', twenty: '20'};
const digitise = (t) => low(t).replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty)\b/g, (w) => WORDNUM[w])
  .replace(/(\d+)\s+to\s+(\d+)/g, '$1-$2').replace(/(\d)\s+grams?\b/g, '$1g').replace(/(\d)\s+percent\b/g, '$1%');
// The website claim this beat states: by its number, else by its words.
const claimFor = (b) => {
  const t = digitise(`${b.claim || ''} ${b.line || ''}`), ns = numIn(t).map(low);
  const cv = motifs.claimVisuals || [];
  return cv.find((c) => c.value && ns.includes(low(c.value)) && t.includes(low((c.fragment || c.claim).replace(/[\d.\-%g\s]+/i, '').trim().split(' ')[0] || '')))
    || cv.find((c) => c.value && ns.includes(low(c.value)))
    || cv.find((c) => c.fragment && t.includes(low(c.fragment)));
};
const labelOf = (c) => (c?.fragment || c?.claim || '').replace(c?.value || '', '').replace(/[-–:,.]/g, ' ').replace(/\s+/g, ' ').trim();
// Card rows from the site's own numeric claims - one row per thing (sugar, protein, carbs), no duplicates.
const cardRows = (hi) => {
  const seenWords = new Set(), rows = [];
  const stem = (w) => w.replace(/s$/, '');
  for (const c of motifs.claimVisuals || []) {
    if (!c.value || !/^\d/.test(c.value)) continue;
    const lab = (nounAfter(c.fragment || c.claim, c.value) || labelOf(c)).toLowerCase().replace(/\b(cereal|total)\b/g, '').trim();
    if (!lab || lab.length > 18) continue;
    const ws = lab.split(/\s+/).map(stem);
    if (ws.some((w) => seenWords.has(w))) continue;
    ws.forEach((w) => seenWords.add(w));
    rows.push({label: lab.replace(/\b\w/g, (m) => m.toUpperCase()), value: c.value, highlight: !!hi && low(c.value) === low(hi)});
    if (rows.length === 3) break;
  }
  if (hi && !rows.some((r) => r.highlight) && rows.length) rows[rows.length - 1].highlight = true;
  return rows;
};

// ------------------------------------------------------------------ candidates per beat
// Each candidate: device (what variety is counted on), score, why, and a builder for the scene.
const candidatesFor = (b, dur) => {
  currentLine = b.line || '';
  const role = b.role, text = `${b.line || ''} ${b.claim || ''}`, attrs = attrsIn(text), claim = claimFor(b);
  const val = claim?.value || numIn(digitise(text))[0];
  const zero = claim?.visual === 'shatter+counter' || /\b(zero|no|0g|0%)\b/i.test(digitise(text));
  const pct = (numIn(digitise(text)).find((n) => n.endsWith('%')) || '').replace('%', '');
  const C = [];
  const add = (device, score, why, visuals, extra = {}) => C.push({device, score, why, visuals, extra});
  const problemSide = ['hook', 'problem', 'agitate'].includes(role);

  // problem devices
  if (problemSide) {
    add('pour', role === 'hook' ? 8 : 7, 'the problem object piling up', [{kind: 'pour', problem: true, source: 'box', sourceLabel: b.sourceLabel || '', container}]);
    add('chart', role === 'hook' ? 6 : 9, 'a line crashing - the cost of the problem over time',
      [{kind: 'chart', points: b.points || [0.45, 0.95, 0.12, 0.05], labels: b.labels || [], meter: style !== 'premium', title: b.chartTitle || '',
        times: (b.points || [0, 0, 0, 0]).map((_, k, a) => r2(0.1 + k * Math.max(0.4, dur - 0.7) / (a.length - 1))), callouts: b.callouts || []}]);
    add('split', 6, 'the old way next to the brand', [{kind: 'split', a: {icon: (motifs.problemObjects?.[0]?.shape === 'cube' ? 'cube' : 'cross'), label: b.splitLabels?.[0] || 'The usual', tone: 'bad'},
      b: cutout ? {image: cutout, label: b.splitLabels?.[1] || motifs.brand.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()), tone: 'good'} : {icon: 'check', tone: 'good'}}]);
    add('icon', 4, 'one loud problem icon', [{kind: 'icon', icon: iconMap[attrs[0]]?.icon || 'cross', slash: false}]);
    add('rain', 5, 'the problem object raining down', [{kind: 'particles', mode: 'fall', shape: motifs.problemObjects?.[0]?.shape || 'cube', count: 26}]);
  }
  // claims and benefits
  if (['claim', 'benefit', 'social', 'offer', 'how'].includes(role) || claim) {
    if (claim?.visual === 'gauge' || (val && /\d+-\d+|\d+g|\d+%/.test(val) && !zero)) add('gauge', claim?.visual === 'gauge' ? 10 : 6, `ring filling to ${val}`, [{kind: 'gauge', value: val, label: nounAfter(text, val) || (labelOf(claim) || '').toUpperCase(), at: 0.15}]);
    if (zero && val) add('shatter', claim?.visual === 'shatter+counter' ? 10 : 7, `the problem object shattering to ${val}`, [{kind: 'shatter'}, {kind: 'counter', value: val, label: (nounAfter(text, val) || (labelOf(claim) || '').toUpperCase()).slice(0, 16), at: 0.3}]);
    if (val && cardRows(val).length >= 2) add('card', 7, 'a 3D label with this row highlighted', [{kind: 'card', title: b.cardTitle || 'Nutrition Facts', sub: 'per serving', rows: cardRows(val)}]);
    if (pct) add('grid', 8, `${pct}% as a unit chart`, [{kind: 'grid', total: 10, highlight: Math.round(Number(pct) / 10), label: b.text || `${pct}%`}]);
    if (attrs.length >= 2 || b.items?.length >= 2) {
      const items = (b.items || attrs.map(title)).slice(0, 4).map((t) => ({text: t}));
      add('badges', claim?.visual === 'badges' || role === 'benefit' ? 9 : 7, 'stamped badges, one per attribute', [{kind: 'badges', items, at: 0.25, stagger: r2(Math.max(0.5, (dur - 0.6) / items.length))}]);
      if (cutout) add('callouts', 8, 'the product with leader lines to each attribute', [{kind: 'callouts', items: items.slice(0, 4)}]);
      add('orbit', 6, 'attribute icons orbiting the product', [{kind: 'orbit', icons: attrs.slice(0, 5).map((a) => iconMap[a].icon)}, {kind: 'particles', mode: 'drift'}]);
    }
    if (attrs.length === 1) add('icon', 6, `the ${attrs[0]} icon, drawn big`, [{kind: 'icon', icon: iconMap[attrs[0]].icon, slash: iconMap[attrs[0]].slash, label: b.text ? undefined : (val ? `${val} ${title(attrs[0])}` : title(attrs[0]))}]);
    if (role === 'how' || b.items?.length >= 2) add('steps', role === 'how' ? 10 : 5, 'icon steps along a path', [{kind: 'steps', items: (b.items || attrs.map(title)).slice(0, 4).map((t) => ({text: t})), at: 0.25}]);
    if (role === 'social') add('stars', 7, 'review count rolling with stars bursting', [{kind: 'particles', mode: 'burst', shape: 'star', count: 24, at: 0.2}, {kind: 'counter', value: val || '5', label: 'REVIEWS', at: 0.2}]);
    if (role === 'offer') add('icon', 7, 'the offer as a gift / tag icon', [{kind: 'icon', icon: /off|%|save/i.test(text) ? 'percent' : 'gift', label: undefined}]);
  }
  // product beats
  // A beat that states a number keeps the number on screen - no bare packshot for it.
  if (['pivot', 'taste', 'claim', 'benefit', 'offer'].includes(role) && cutout && !(role === 'claim' && val)) {
    add('packshot', role === 'pivot' ? 8 : role === 'taste' ? 7 : 3, 'the packshot swinging in with rays', [{kind: 'packshot', rays: true, at: 0.1}, {kind: 'sparkles', at: 0.5}]);
    add('pourBrand', role === 'pivot' ? 7 : 4, "the product pouring the brand's own object", [{kind: 'pour', source: cutout, container}]);
  }
  if (role === 'taste') add('burst', 5, "the brand's object bursting", [{kind: 'particles', mode: 'burst', count: 30, at: 0.2}, {kind: 'packshot', at: 0.1, swing: 'none'}]);
  if (role === 'cta') add('endcard', 20, 'logo, URL and CTA', [{kind: 'particles', mode: ['fall', 'rise', 'drift'][Math.floor(rnd() * 3)]}], {type: 'endcard'});

  // footage beats: the clip carries the scene, one overlay-friendly visual sits on it
  if (b.footage) {
    const overlay = C.filter((c) => ['gauge', 'card', 'badges', 'icon', 'shatter', 'grid'].includes(c.device));
    const base = overlay.length ? overlay : [{device: 'burst', score: 6, why: "the brand's object bursting over the shot", visuals: [{kind: 'particles', mode: 'burst', count: 24, at: 0.3}]}];
    const portrait = (spec.aspect || '9:16') === '9:16';
    for (const c of base) {
      const vis = c.visuals.map((v) => (v.kind === 'gauge' ? {...v, box: portrait ? {x: 0.05, y: 0.64, w: 0.9, h: 0.2} : {x: 0.52, y: 0.62, w: 0.44, h: 0.3}} : v));
      C.push({device: c.device, score: c.score + 3, why: `${b.footage.action || 'library footage'} + ${c.why}`, visuals: vis, extra: {type: 'footage', src: b.footage.src, trimBefore: b.footage.trimBefore || 0}});
    }
    if (role === 'pivot' || role === 'taste') C.push({device: 'footage', score: 11, why: `${b.footage.action || 'library footage'} - real product at the turn`, visuals: [{kind: 'particles', mode: 'burst', count: 20, at: 0.4}],
      extra: {type: 'footage', src: b.footage.src, trimBefore: b.footage.trimBefore || 0}});
  }
  if (!C.length) add('packshot', 3, 'fallback: the product', [{kind: 'packshot', at: 0.1}]);
  // Each animation needs time to play out; a beat shorter than that gets a quicker device instead.
  const MIN = {pour: 2.4, pourBrand: 2.4, chart: 2.5, split: 1.8, card: 2.2, callouts: 2.2, steps: 2.0, orbit: 2.0, badges: 0.7 * (b.items?.length || attrs.length || 2) + 0.6, shatter: 1.3, gauge: 1.6, grid: 1.8, rain: 1.0, icon: 1.0, packshot: 1.0, burst: 0.8, stars: 1.2, footage: 0.8, endcard: 1.5};
  C.forEach((c) => { if (dur < (MIN[c.device] ?? 1)) c.score -= 20; });
  if (b.prefer) C.forEach((c) => { if (c.device === b.prefer) c.score += 6; });
  return C.filter((c) => !(b.avoid || []).includes(c.device));
};

// ------------------------------------------------------------------ pick with variety
const recent = history.ads.slice(-3).flatMap((a) => a.devices || []);
const recentLead = history.ads.slice(-3).map((a) => (a.devices || [])[0]).filter(Boolean);
const used = {};
// Count variety the way mg_check does: rain/burst/stars are particles, a brand pour is still a pour.
const canon = (d) => ({rain: 'particles', burst: 'particles', stars: 'particles', pourBrand: 'pour'}[d] || d);
const beats = spec.beats;
const cuts = beats.map((b, i) => (i === 0 ? 0 : r2(b.start + LEAD)));
const end = r2(beats[beats.length - 1].end + LEAD + 0.6);
const picks = [];
beats.forEach((b, i) => {
  const dur = (i + 1 < beats.length ? cuts[i + 1] : end) - cuts[i];
  const cands = candidatesFor(b, dur).map((c) => {
    let s = c.score + rnd() * 1.5;
    s -= 7 * (used[canon(c.device)] || 0);
    if (picks[i - 1] && canon(picks[i - 1].device) === canon(c.device) && c.device !== 'footage') s -= 14;
    s -= 1.5 * recent.filter((d) => d === canon(c.device)).length;
    // the same animation in the same slot as a recent ad for this brand reads as a re-run (newest weighs most)
    let slot = 0;
    history.ads.slice(-3).forEach((ad, k, arr) => { if ((ad.devices || [])[i] === canon(c.device) && !['footage', 'endcard'].includes(c.device)) slot += 3 + 2 * (k === arr.length - 1 ? 1 : 0); });
    s -= Math.min(5, slot); // capped: memory nudges toward a fresh choice, fit still wins
    if (i === 0 && recentLead.includes(canon(c.device))) s -= 4; // don't open the way the last ads opened
    if (c.device === 'footage' || c.device === 'endcard') s += 0; // never penalised into oblivion by repetition rules above
    return {...c, final: s};
  }).sort((a, z) => z.final - a.final);
  const pick = cands[0];
  used[canon(pick.device)] = (used[canon(pick.device)] || 0) + 1;
  picks.push({...pick, dur, alternatives: cands.slice(1, 3).map((c) => c.device)});
});

// ------------------------------------------------------------------ transitions and backgrounds
const TRANS = {
  whip: (d) => ({type: 'whip', direction: d, seconds: 0.27}), wipe: (d) => ({type: 'wipe', direction: d, seconds: 0.3}),
  slide: (d) => ({type: 'slide', direction: d, seconds: 0.4, timing: 'spring'}), zoom: () => ({type: 'zoom', seconds: 0.4}),
  iris: () => ({type: 'iris', seconds: 0.45}), fade: () => ({type: 'fade', seconds: 0.35}),
};
const dirs = ['from-right', 'from-bottom', 'from-left', 'from-top'];
const lastT = [];
const pickTrans = (b, i) => {
  if (i === 0) return null;
  const prevRole = beats[i - 1].role;
  if (b.role === 'pivot' && (b.footage || picks[i].device === 'footage')) return null; // the match cut lands on the action - a hard cut
  const problem = ['hook', 'problem', 'agitate'].includes(b.role);
  let pool = problem ? ['whip', 'wipe', 'cut'] : ['slide', 'zoom', 'iris', 'fade', 'whip', 'wipe'];
  if (style === 'premium') pool = pool.filter((t) => !['whip', 'wipe'].includes(t)).concat(['fade']);
  if (style === 'clinical') pool = pool.filter((t) => t !== 'whip');
  if (b.role === 'cta') pool = ['iris', 'slide', 'fade', 'zoom'];
  if (prevRole === 'agitate' || (problem && b.role === 'agitate')) pool = ['cut', ...pool];
  const scored = pool.map((t) => ({t, s: rnd() - (lastT.filter((x) => x === t).length * 1.2) - (lastT[lastT.length - 1] === t ? 5 : 0)})).sort((a, z) => z.s - a.s);
  const t = scored[0].t;
  lastT.push(t);
  return t === 'cut' ? null : TRANS[t](dirs[Math.floor(rnd() * dirs.length)]);
};
const bgFor = (b, i) => (['hook', 'problem', 'agitate'].includes(b.role) ? 'dark' : b.role === 'cta' ? 'secondary' : i % 2 ? 'primary' : 'secondary');

// ------------------------------------------------------------------ write
const transitions = beats.map(pickTrans);
const scenes = beats.map((b, i) => {
  const p = picks[i], next = transitions[i + 1];
  const duration = r2(p.dur + (next ? next.seconds : 0));
  const s = {type: p.extra.type || 'scene', duration, bg: bgFor(b, i)};
  if (p.extra.src) { s.src = p.extra.src; s.trimBefore = p.extra.trimBefore; }
  if (b.text) s.text = b.text;
  if (i === 0 && b.text) s.preset = 'fade';
  if (transitions[i]) s.transition = transitions[i];
  if (s.type === 'endcard') { s.url = b.url || siteUrl; s.cta = b.cta || 'Shop now'; }
  s.visuals = p.visuals.map((v) => JSON.parse(JSON.stringify(v, (k, val) => (val === undefined || val === '' ? undefined : val))));
  s._plan = `${b.role}: ${p.device} - ${p.why} (also fits: ${p.alternatives.join(', ') || '-'})`;
  return s;
});
const adOut = {_about: `Planned by mg_plan.mjs (seed ${seed}) from ${path.basename(file)} for ${brand}. Edit freely; run mg_check.mjs before rendering.`, scenes};
if (spec.approvedClaims) adOut.approvedClaims = spec.approvedClaims;
fs.mkdirSync(path.dirname(path.resolve(out)), {recursive: true});
fs.writeFileSync(out, JSON.stringify(adOut, null, 2));

console.log(`\n  mg_plan: ${beats.length} beats -> ${path.resolve(out)}  (seed ${seed}, style ${style}${history.ads.length ? `, ${history.ads.length} earlier ads remembered` : ''})\n`);
scenes.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. ${beats[i].role.padEnd(8)} ${picks[i].device.padEnd(10)} ${(s.transition?.type || (i ? 'cut' : '')).padEnd(6)} ${s.duration.toFixed(2)}s  ${picks[i].why}`));
const devices = picks.map((p) => p.device);
console.log(`\n  ${new Set(devices).size} different animations across ${devices.length} scenes; runtime ~${end.toFixed(1)}s`);
console.log('  next: mg_check.mjs the file, render a half-scale preview, adjust anything that reads wrong. A different --seed gives another valid mix.\n');

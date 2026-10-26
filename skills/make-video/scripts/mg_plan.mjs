#!/usr/bin/env node
/**
 * mg_plan.mjs - choose a DIFFERENT, fitting animation for every beat, automatically.
 *
 *   node mg_plan.mjs beats.json --brand <slug> --out <project>/ads/<name>.json [--seed N] [--best] [--lead 0.2]
 *        [--recent "pour,chart,gauge|split,icon,card"] [--avoid pour,chart] [--name <ad>] [--dry]
 *
 *   --seed    fixes the random choices (default: a fresh seed every run, printed and stored in the plan)
 *   --best    always take the top-scoring animation (no exploration)
 *   --recent  animations the brand's recent ads used, one ad per |, in scene order - when this workspace has no
 *             memory of them (a new claude.ai chat); also accepted as "recent": [[...], ...] in beats.json
 *   --avoid   animations not to use in this ad (also "avoid": [...] in beats.json)
 *   --dry     don't write this plan into the brand's memory
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
 * callouts / points (chart), footage {src, trimBefore, action, cutout?: "cutouts/<name>" from separate.mjs},
 * milestones [{label, text}] (timeline), before / after {image | footage, trimBefore} (slider), countdown "HH:MM:SS"
 * (only a deadline the user confirmed), price (phone cart), them (checklist's other column), rating + count (stars),
 * segments [{label, value}] (donut), race [{label, value, highlight}] + unit (race), strike (the heading strikes this out first), prefer: "<kind>" (a nudge, not a lock), avoid: [kinds].
 *
 * Output: the ad JSON (every scene with visuals, transitions, backgrounds, timings pinned to the VO + lead),
 * each scene with a "_plan" note saying what was picked and why. Then: mg_check.mjs, preview, edit freely.
 */
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PLUS_SECONDS} from './lib/transitions.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const file = argv[0];
const brand = opt('--brand');
const out = opt('--out');
if (!file || !brand || !out) { console.error('usage: node mg_plan.mjs beats.json --brand <slug> --out <project>/ads/<name>.json [--seed N] [--best] [--recent a,b|c,d] [--avoid a,b] [--dry]'); process.exit(2); }
// A fresh seed every run: the same script must not come out as the same ad twice. --seed reproduces a plan.
const seed = argv.includes('--seed') ? Number(opt('--seed')) : crypto.randomInt(1, 1000000), LEAD = Number(opt('--lead', 0.2));
const BEST = argv.includes('--best'), DRY = argv.includes('--dry');
const NAME = opt('--name', path.basename(out, '.json'));
const ROOT = process.env.MAKE_VIDEO_ROOT || path.join(os.homedir(), '.claude', 'make-video');
const B = path.join(ROOT, 'brands', brand);
const readJ = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const spec = readJ(file);
if (!spec?.beats?.length) { console.error(`no beats in ${file}`); process.exit(2); }
const motifs = readJ(path.join(B, 'motifs.json'), null);
if (!motifs) { console.error(`no motifs.json for ${brand} - run brand_motifs.mjs --brand ${brand} --write first`); process.exit(1); }
const historyFile = path.join(B, 'motion-history.json');
const historyAll = readJ(historyFile, {ads: []});
// What the brand's recent ads used: this workspace's memory (minus an earlier plan of this same ad), plus anything
// the user or a brief told us (--recent / beats.json "recent") - a fresh claude.ai chat has no memory of its own.
const told = [...(opt('--recent') ? opt('--recent').split('|').map((x) => x.split(',').map((d) => d.trim()).filter(Boolean)) : []), ...(spec.recent || [])]
  .map((devices, k) => ({name: `(told ${k + 1})`, devices}));
const history = {ads: [...(historyAll.ads || []).filter((a) => a.name !== NAME), ...told]};
const AVOID = new Set([...(opt('--avoid') ? opt('--avoid').split(',').map((x) => x.trim()) : []), ...(spec.avoid || [])]);
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
const STOP = new Set(['of', 'the', 'a', 'an', 'in', 'every', 'per', 'just', 'only', 'and', 'with', 'your', 'their', 'its', 'our', 'grams', 'gram', 'is', 'are', 'has', 'have', 'that', 'which', 'for', 'to']);
// The words right after the number in the line: "0g of sugar" -> SUGAR, "12-14g of complete protein in every bowl" -> COMPLETE PROTEIN.
const nounAfter = (text, val) => {
  const t = digitise(text), i = val ? t.indexOf(low(val)) : -1;
  if (i < 0) return '';
  const words = t.slice(i + val.length).split(/[.,;!?]/)[0].split(/\s+/).filter(Boolean);
  const out = [];
  for (const w of words) { if (STOP.has(w)) { if (out.length >= 2) break; continue; } out.push(w); if (out.length === 3) break; }
  return out.join(' ').toUpperCase();
};
const numIn = (t) => (String(t).match(/\$?\d[\d,.]*(?:\s?-\s?\d[\d,.]*)?\s?(?:%|kg\b|g\b|mg\b|x\b|\+)?/gi) || []).map((n) => n.replace(/\s/g, '').replace(/[.,]$/, ''));
const WORDNUM = {zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', twenty: '20'};
const digitise = (t) => low(t).replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty)\b/g, (w) => WORDNUM[w])
  .replace(/(\d+)\s+to\s+(\d+)/g, '$1-$2').replace(/(\d)\s+grams?\b/g, '$1g').replace(/(\d)\s+percent\b/g, '$1%');
// An icon for a number claim, from the attribute the line names, else from the noun after the number.
const NOUN_ICON = [[/protein/, 'dumbbell'], [/carb/, 'grain'], [/sugar/, 'cube'], [/fib/, 'wheat'], [/calor/, 'flame'], [/vitamin|mineral/, 'pill'],
  [/hour|minute|day/, 'clock'], [/review|star|rating/, 'star'], [/water|hydrat/, 'drop'], [/energy|caffeine/, 'bolt'], [/fat/, 'drop']];
const iconForClaim = (text, noun) => {
  const a = attrsIn(`${text} ${digitise(text)}`)[0];
  if (a) return iconMap[a];
  const hit = NOUN_ICON.find(([re]) => re.test(low(noun)));
  return {icon: hit ? hit[1] : 'star'};
};
const problemIcon = () => ({cube: 'cube', dot: 'cross', square: 'box', drop: 'drop', ring: 'cross'}[motifs.problemObjects?.[0]?.shape] || 'cross');
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
const FOODISH = ['cereal', 'snack', 'food', 'beverage'];
const cardTitle = () => (FOODISH.includes(motifs.category) ? ['Nutrition Facts', 'per serving'] : motifs.category === 'supplement' ? ['Supplement Facts', 'per serving']
  : [(bj.prettyName || motifs.brand || '').replace(/_/g, ' '), 'by the numbers']);
const cardRows = (hi, hiLabel) => {
  const seenWords = new Set(), rows = [];
  // the beat's own number goes first, so it is always on the card
  const order = [...(motifs.claimVisuals || [])].sort((a, z) => (low(z.value) === low(hi)) - (low(a.value) === low(hi)));
  const stem = (w) => w.replace(/s$/, '');
  for (const c of order) {
    if (!c.value || !/^\d/.test(c.value) || c.visual === 'counter') continue; // a review count isn't a spec row
    const lab = (nounAfter(c.fragment || c.claim, c.value) || labelOf(c)).toLowerCase().replace(/\b(cereal|total)\b/g, '').trim();
    if (!lab || lab.length > 18) continue;
    const ws = lab.split(/\s+/).map(stem);
    if (ws.some((w) => seenWords.has(w))) continue;
    ws.forEach((w) => seenWords.add(w));
    const isHi = !!hi && low(c.value) === low(hi);
    rows.push({label: (isHi && hiLabel ? hiLabel.toLowerCase() : lab).replace(/\b\w/g, (m) => m.toUpperCase()), value: c.value, highlight: isHi});
    if (rows.length === 3) break;
  }
  return rows.some((r) => r.highlight) ? rows : []; // no row for this beat's number -> no card
};

// Count variety the way mg_check does: rain/burst/stars are particles, a brand pour is still a pour.
const short = (t, n = 18) => { if (t.length <= n) return t; const w = t.split(' '); let o = ''; for (const x of w) { if ((o + ' ' + x).trim().length > n) break; o = (o + ' ' + x).trim(); } return o || t.slice(0, n); };
// What the good side of a split is called: the script's own product name, else the brand's display name - never the slug.
const productName = spec.productName || spec.beats.find((x) => x.splitLabels?.[1])?.splitLabels[1]
  || (bj.prettyName && !/_/.test(bj.prettyName) ? bj.prettyName : (motifs.brand || '').replace(/^audit_/, '').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()));
const canon = (d) => ({rain: 'particles', burst: 'particles', stars: 'particles', statburst: 'particles', pourBrand: 'pour'}[d] || d);

// ------------------------------------------------------------------ candidates per beat
// Each candidate: device (what variety is counted on), score, why, and a builder for the scene.
const candidatesFor = (b, dur) => {
  currentLine = b.line || '';
  const role = b.role, text = `${b.line || ''} ${b.claim || ''}`, attrs = attrsIn(text), claim = claimFor(b);
  let val = claim?.value || numIn(digitise(text))[0];
  const big = val && text.match(new RegExp(`${val.replace(/[.+]/g, (m) => '\\' + m)}\\s*(billion|million|thousand)\\b`, 'i'));
  if (big) val = `${val} ${big[1][0].toUpperCase()}${big[1].slice(1).toLowerCase()}`;
  const lab = (b.label || (val ? nounAfter(text, val) : '') || '').toUpperCase(); // what the number measures
  const zero = claim?.visual === 'shatter+counter' || /\b(zero|no|0g|0%)\b/i.test(digitise(text));
  const pct = (numIn(digitise(text)).find((n) => n.endsWith('%')) || '').replace('%', '');
  const C = [];
  const add = (device, score, why, visuals, extra = {}) => C.push({device, score, why, visuals, extra});
  const problemSide = ['hook', 'problem', 'agitate'].includes(role);

  // problem devices
  if (problemSide) {
    add('pour', role === 'hook' ? 8 : 7, 'the problem object piling up', [{kind: 'pour', problem: true, source: 'box', sourceLabel: b.sourceLabel || '', container}]);
    if (b.points || b.callouts?.length || b.labels?.length) add('chart', role === 'hook' ? 7 : 8, 'a line crashing - the cost of the problem over time',
      [{kind: 'chart', points: b.points || [0.45, 0.95, 0.12, 0.05], labels: b.labels || [], meter: style !== 'premium', title: b.chartTitle || '',
        times: (b.points || [0, 0, 0, 0]).map((_, k, a) => r2(0.1 + k * Math.max(0.4, dur - 0.7) / (a.length - 1))), callouts: b.callouts || []}]);
    add('split', 7, 'the old way next to the brand', [{kind: 'split', a: {icon: (motifs.problemObjects?.[0]?.shape === 'cube' ? 'cube' : 'cross'), label: b.splitLabels?.[0] || 'The usual', tone: 'bad'},
      b: cutout ? {image: cutout, label: b.splitLabels?.[1] || productName, tone: 'good'} : {icon: 'check', tone: 'good'}}]);
    add('icon', 5, 'one loud problem icon', [{kind: 'icon', icon: iconMap[attrs[0]]?.icon || problemIcon(), slash: false}]);
    add('rain', 6, 'the problem object raining down', [{kind: 'particles', mode: 'fall', shape: motifs.problemObjects?.[0]?.shape || 'cube', count: 26}]);
  }
  // claims and benefits
  if (['claim', 'benefit', 'social', 'offer', 'how'].includes(role) || claim) {
    if (claim?.visual === 'gauge' || (val && /\d+-\d+|\d+g|\d+%/.test(val) && !zero)) add('gauge', claim?.visual === 'gauge' ? 9 : 7, `ring filling to ${val}`, [{kind: 'gauge', value: val, label: lab || (labelOf(claim) || '').toUpperCase(), at: 0.15}]);
    if (zero && val) add('shatter', claim?.visual === 'shatter+counter' ? 9 : 7, `the problem object shattering to ${val}`, [{kind: 'shatter'}, {kind: 'counter', value: val, label: short(lab || (labelOf(claim) || '').toUpperCase()), at: 0.3}]);
    if (val && cardRows(val).length >= 2) add('card', 8, 'a 3D card with this row highlighted', [{kind: 'card', title: b.cardTitle || cardTitle()[0], sub: cardTitle()[1], rows: cardRows(val, lab)}]);
    // the number as one big drawn icon - for an amount, the thing it measures; for a zero, the problem object, slashed
    if (val && !attrs.length) {
      const ic = zero ? {icon: problemIcon(), slash: true} : iconForClaim(text, lab);
      add('icon', 8, zero ? `the problem icon slashed, ${val}` : `the ${lab.toLowerCase() || 'claim'} icon with ${val}`,
        [{kind: 'icon', icon: ic.icon, slash: !!ic.slash, label: b.text ? undefined : `${val} ${lab}`.trim()}]);
    }
    // fallbacks for any other number, so a beat never has one forced option
    if (val && !zero && !C.some((c) => c.device === 'gauge')) add('gauge', 6, `ring filling to ${val}`, [{kind: 'gauge', value: val, label: lab, fill: 0.9, at: 0.15}]);
    if (val && cutout) add('callouts', 6, `the product with ${val} called out`, [{kind: 'callouts', items: [{text: `${val} ${lab}`.trim()}, ...attrs.slice(0, 2).map((a) => ({text: title(a)}))]}]);
    if (val && !zero) add('statburst', 6, `${val} rolling up as the brand's objects burst`, [{kind: 'particles', mode: 'burst', count: 28, at: 0.25}, {kind: 'counter', value: val, label: short(lab), at: 0.2}]);
    // a zero claim as the old way vs the brand
    if (zero && val && cutout) add('split', 7, `the usual vs ${val}`, [{kind: 'split', a: {icon: problemIcon(), label: b.splitLabels?.[0] || 'The usual', tone: 'bad'},
      b: {image: cutout, label: `${val} ${lab}`.trim(), tone: 'good'}}]);
    if (pct) add('grid', 8, `${pct}% as a unit chart`, [{kind: 'grid', total: 10, highlight: Math.round(Number(pct) / 10), label: b.text || `${pct}% ${lab}`.trim()}]);
    if (attrs.length >= 2 || b.items?.length >= 2) {
      const items = (b.items || attrs.map(title)).slice(0, 4).map((t) => ({text: t}));
      add('badges', claim?.visual === 'badges' || role === 'benefit' ? 8 : 7, 'stamped badges, one per attribute', [{kind: 'badges', items, at: 0.25, stagger: r2(Math.max(0.5, (dur - 0.6) / items.length))}]);
      if (cutout) add('callouts', 8, 'the product with leader lines to each attribute', [{kind: 'callouts', items: items.slice(0, 4)}]);
      const orbitIcons = [...new Set([...attrs.map((a) => iconMap[a].icon), ...(b.items || []).map((t) => iconMap[attrsIn(t)[0]]?.icon).filter(Boolean)])].slice(0, 5);
      if (orbitIcons.length >= 3) add('orbit', 7, 'attribute icons orbiting the product', [{kind: 'orbit', icons: orbitIcons}, {kind: 'particles', mode: 'drift'}]);
    }
    if (attrs.length === 1) add('icon', 6, `the ${attrs[0]} icon, drawn big`, [{kind: 'icon', icon: iconMap[attrs[0]].icon, slash: iconMap[attrs[0]].slash, label: b.text ? undefined : (val ? `${val} ${lab || title(attrs[0])}`.trim() : title(attrs[0]))}]);
    if (role === 'how' || b.items?.length >= 2) add('steps', role === 'how' ? 10 : 6, 'icon steps along a path', [{kind: 'steps', items: (b.items || attrs.map(title)).slice(0, 4).map((t) => ({text: t})), at: 0.25}]);
    // a rating the site states ("4.8 stars", beats.json "rating"): stars filling to it, with the review count
    const rating = b.rating ?? Number((text.match(/(\d(?:\.\d)?)\s*(?:\/\s*5|out of 5|stars?|-star)/i) || [])[1]);
    if (rating > 0 && rating <= 5) add('rating', role === 'social' ? 10 : 7, `stars filling to ${rating}`, [{kind: 'stars', rating, count: b.count || (val && /\+|,/.test(val) ? val : undefined), label: b.ratingLabel || 'REVIEWS', at: 0.15}]);
    if (b.segments?.length >= 2) add('donut', 9, 'a donut of what is inside', [{kind: 'donut', segments: b.segments, center: b.center, at: 0.15}]);
    if (b.race?.length >= 2) add('race', 9, 'bars racing to the real figures', [{kind: 'race', items: b.race, unit: b.unit || '', at: 0.1}]);
    if (role === 'social') add('stars', 7, 'review count rolling with stars bursting', [{kind: 'particles', mode: 'burst', shape: 'star', count: 24, at: 0.2}, {kind: 'counter', value: val || '5', label: 'REVIEWS', at: 0.2}]);
    if (role === 'offer') add('icon', 7, 'the offer as a gift / tag icon', [{kind: 'icon', icon: /off|%|save/i.test(text) ? 'percent' : 'gift', label: undefined}]);
    // a 3+ item list, or anything "vs the others": ticks in the brand's column, crosses in theirs
    const listed = (b.items || attrs.map(title)).slice(0, 5);
    const versus = /\b(vs\.?|versus|unlike|other brands?|others|than (most|regular|the rest))\b/i.test(text);
    if (listed.length >= 3 || (versus && listed.length >= 2))
      add('checklist', versus ? 9 : 7, versus ? 'the brand ticking every row the others cross out' : 'the list ticking itself off',
        [{kind: 'checklist', rows: listed, us: productName || undefined, them: versus ? (b.them || 'Others') : undefined, at: 0.15, stagger: r2(Math.max(0.3, (dur - 0.8) / listed.length))}]);
    // a deadline the user confirmed: the clock (never invent one - beats.json "countdown": "HH:MM:SS")
    if (b.countdown) add('countdown', 10, 'the offer clock flipping down', [{kind: 'countdown', from: b.countdown, label: b.text ? undefined : 'ENDS IN', at: 0.1}]);
    // ordering, tapping, shipping, messaging: the phone doing it
    if (/\b(order|tap|checkout|add to cart|app|deliver|ship|arriv|text|dm|message)/i.test(text)) {
      const ship = /\b(deliver|ship|arriv|doorstep)/i.test(text);
      add('phone', 8, ship ? 'a phone with the order notifications dropping in' : 'a phone: add to cart, tapped',
        [ship ? {kind: 'phone', screen: 'notify', app: productName || '', items: (b.items || ['Order confirmed', 'Out for delivery']).slice(0, 3).map((t) => ({text: t}))}
          : {kind: 'phone', screen: 'cart', image: cutout, title: productName || '', price: b.price, app: productName || ''}]);
    }
    // hydration, energy that lasts, servings, percentages: something filling up
    if (/\b(hydrat|water|energy|fuel|charge|all[- ]day|lasts?|servings?|full)\b/i.test(text) || pct) {
      const vessel = /\b(energy|fuel|charge|all[- ]day|lasts?)\b/i.test(text) ? 'battery' : motifs.category === 'beverage' ? 'bottle' : /\bwater|hydrat/i.test(text) ? 'glass' : 'jar';
      add('fill', pct ? 8 : 7, `a ${vessel} filling${pct ? ` to ${pct}%` : ''}`, [{kind: 'fill', vessel, level: pct ? Math.min(1, Number(pct) / 100) : 0.85, value: pct ? `${pct}%` : undefined, label: lab || (b.text || !attrs[0] ? undefined : short(title(attrs[0])))}]);
    }
  }
  // results over time: milestones the script states (beats.json "milestones": [{label: "DAY 1", text}, ...])
  if (b.milestones?.length >= 2) add('timeline', 10, 'the results track, milestone by milestone', [{kind: 'timeline', items: b.milestones.slice(0, 4), at: 0.1, stagger: r2(Math.max(0.4, (dur - 0.8) / Math.min(4, b.milestones.length)))}]);
  // before / after the user picked (beats.json "before" / "after": {image | footage, trimBefore})
  if (b.before && b.after) add('slider', 10, 'before / after with a handle dragged across', [{kind: 'slider', a: {label: 'BEFORE', tone: 'bad', ...b.before}, b: {label: 'AFTER', ...b.after}}]);
  // the usual vs the brand weighed: the problem object piled on one pan
  if ((problemSide && role !== 'hook') || (zero && val) || /\b(outweigh|heav|lighter|weigh)/i.test(text))
    add('scale', zero && val ? 8 : 6, 'the usual vs the brand on a balance', [{kind: 'scale', a: {label: b.splitLabels?.[0] || 'The usual'}, b: {label: b.splitLabels?.[1] || productName || '', ...(zero ? {} : {image: cutout, count: 1})}, heavier: zero || problemSide ? 'a' : 'b'}]);
  // product beats
  // A beat that states a number keeps the number on screen - no bare packshot for it.
  if (['pivot', 'taste', 'claim', 'benefit', 'offer'].includes(role) && cutout && !(role === 'claim' && val)) {
    add('packshot', role === 'pivot' ? 8 : role === 'taste' ? 7 : 3, 'the packshot swinging in with rays', [{kind: 'packshot', rays: true, at: 0.1}, {kind: 'sparkles', at: 0.5}]);
    add('pourBrand', role === 'pivot' ? 8 : role === 'taste' ? 6 : 4, "the product pouring the brand's own object", [{kind: 'pour', source: cutout, container}]);
    if (role === 'pivot') add('draw', 7, 'the product drawn on in one line, then filled for real', [{kind: 'draw', image: cutout, label: b.text ? undefined : productName || undefined}]);
    // the brand's own object as a Lottie animation (motifs.json "lottie": ["lottie/<file>.json"])
    if ((motifs.lottie || []).length) add('lottie', 7, "the brand's object, animated", [{kind: 'lottie', src: motifs.lottie[Math.floor(rnd() * motifs.lottie.length)], at: 0.1}, {kind: 'particles', mode: 'drift'}]);
  }
  // the brand's benefits circling the product - a product beat that isn't a packshot again
  const brandIcons = [...new Set(Object.values(iconMap).filter((x) => !x.slash).map((x) => x.icon))].slice(0, 5);
  if (['pivot', 'taste'].includes(role) && cutout && brandIcons.length >= 3) add('orbit', 6, "the brand's benefit icons orbiting the product", [{kind: 'orbit', icons: brandIcons}, {kind: 'particles', mode: 'drift'}]);
  if (role === 'taste') add('burst', 6, "the brand's object bursting", [{kind: 'particles', mode: 'burst', count: 30, at: 0.2}, {kind: 'packshot', at: 0.1, swing: 'none'}]);
  if (role === 'cta') add('endcard', 20, 'logo, URL and CTA', [{kind: 'particles', mode: ['fall', 'rise', 'drift'][Math.floor(rnd() * 3)]}], {type: 'endcard'});

  // footage beats: the clip carries the scene, one overlay-friendly visual sits on it
  if (b.footage) {
    // a separated subject (separate.mjs) lets the graphics sit BEHIND the person / product - the strongest shot in the ad
    const cutBonus = b.footage.cutout ? 6 : 0;
    const overlay = C.filter((c) => ['gauge', 'card', 'badges', 'icon', 'shatter', 'grid'].includes(c.device));
    const base = overlay.length ? overlay : [{device: 'burst', score: 6, why: "the brand's object bursting over the shot", visuals: [{kind: 'particles', mode: 'burst', count: 24, at: 0.3}]}];
    const portrait = (spec.aspect || '9:16') === '9:16';
    for (const c of base) {
      const vis = c.visuals.map((v) => (v.kind === 'gauge' ? {...v, box: portrait ? {x: 0.05, y: 0.64, w: 0.9, h: 0.2} : {x: 0.52, y: 0.62, w: 0.44, h: 0.3}} : v));
      C.push({device: c.device, score: c.score + 3 + cutBonus, why: `${b.footage.action || 'library footage'} + ${c.why}${cutBonus ? ' - behind the subject' : ''}`, visuals: vis, extra: {type: 'footage', src: b.footage.src, trimBefore: b.footage.trimBefore || 0, cutout: b.footage.cutout}});
    }
    if (role === 'pivot' || role === 'taste') C.push({device: 'footage', score: 11 + cutBonus, why: `${b.footage.action || 'library footage'} - real product at the turn`, visuals: [{kind: 'particles', mode: 'burst', count: 20, at: 0.4}],
      extra: {type: 'footage', src: b.footage.src, trimBefore: b.footage.trimBefore || 0, cutout: b.footage.cutout}});
  }
  if (!C.length) add('packshot', 3, 'fallback: the product', [{kind: 'packshot', at: 0.1}]);
  // Each animation needs time to play out; a beat shorter than that gets a quicker device instead.
  const MIN = {statburst: 1.2, pour: 2.4, pourBrand: 2.4, chart: 2.5, split: 1.8, card: 2.2, callouts: 2.2, steps: 2.0, orbit: 2.0, badges: 0.7 * (b.items?.length || attrs.length || 2) + 0.6, shatter: 1.3, gauge: 1.6, grid: 1.8, rain: 1.0, icon: 1.0, packshot: 1.0, burst: 0.8, stars: 1.2, footage: 0.8, endcard: 1.5};
  C.forEach((c) => { if (dur < (MIN[c.device] ?? 1)) c.score -= 20; });
  if (b.prefer) C.forEach((c) => { if (c.device === b.prefer) c.score += 6; });
  const keep = C.filter((c) => !(b.avoid || []).includes(c.device) && !AVOID.has(canon(c.device)) && !AVOID.has(c.device));
  return keep.length ? keep : C; // an avoid list never leaves a beat with nothing
};

// ------------------------------------------------------------------ pick with variety
const recent = history.ads.slice(-3).flatMap((a) => a.devices || []);
const recentLead = history.ads.slice(-3).map((a) => (a.devices || [])[0]).filter(Boolean);
const used = {};
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
  }).sort((a, z) => z.final - a.final)
    .filter((c, k, all) => !(picks[i - 1] && canon(picks[i - 1].device) === canon(c.device) && !['footage', 'endcard'].includes(c.device)
      && all.some((o) => canon(o.device) !== canon(picks[i - 1].device))));
  // Exploration: anything within 2.5 points of the best fits about as well - choose among those at random,
  // weighted toward the better ones. --best turns it off. (Footage and the end card always win when they top.)
  let pick = cands[0];
  const close = cands.filter((c) => c.final >= cands[0].final - 2.5);
  if (!BEST && close.length > 1 && !['footage', 'endcard'].includes(cands[0].device)) {
    const w = close.map((c) => Math.exp((c.final - cands[0].final) / 1.2)), tot = w.reduce((x, y) => x + y, 0);
    let r = rnd() * tot;
    pick = close.find((c, k) => (r -= w[k]) <= 0) || close[0];
  }
  used[canon(pick.device)] = (used[canon(pick.device)] || 0) + 1;
  picks.push({...pick, dur, alternatives: cands.filter((c) => c !== pick).slice(0, 2).map((c) => c.device)});
});

// ------------------------------------------------------------------ transitions and backgrounds
const TRANS = {
  whip: (d) => ({type: 'whip', direction: d, seconds: 0.27}), wipe: (d) => ({type: 'wipe', direction: d, seconds: 0.3}),
  slide: (d) => ({type: 'slide', direction: d, seconds: 0.4, timing: 'spring'}), zoom: () => ({type: 'zoom', seconds: 0.4}),
  iris: () => ({type: 'iris', seconds: 0.45}), fade: () => ({type: 'fade', seconds: 0.35}),
  // a shape carries the eye into the next scene (brand colour; "object" flies the brand's own prop at the camera)
  carry: () => ({type: 'carry', variant: carryVariant(), seconds: 0.6, color: 'accent'}),
  // the registry-style transitions (transitions-plus.tsx): each at its default length
  ...Object.fromEntries(Object.keys(PLUS_SECONDS).map((k) => [k, () => ({type: k, seconds: PLUS_SECONDS[k]})])),
};
const usedCarry = [];
const carryVariant = () => {
  const pool = style === 'premium' || style === 'clinical' ? ['dot', 'ring'] : ['dot', 'ring', 'flood', 'bar', 'object', 'object'];
  const fresh = pool.filter((x) => !usedCarry.includes(x)), from = fresh.length ? fresh : pool;
  const v = from[Math.floor(rnd() * from.length)];
  usedCarry.push(v);
  return v;
};
const dirs = ['from-right', 'from-bottom', 'from-left', 'from-top'];
const lastT = [];
const recentT = history.ads.slice(-3).flatMap((a) => a.transitions || []);
const pickTrans = (b, i) => {
  if (i === 0) return null;
  const prevRole = beats[i - 1].role;
  if (b.role === 'pivot' && (b.footage || picks[i].device === 'footage')) return null; // the match cut lands on the action - a hard cut
  const problem = ['hook', 'problem', 'agitate'].includes(b.role);
  // hard and rough in the problem half, smooth and bright in the solution half
  let pool = problem ? ['whip', 'wipe', 'cut', 'glitch', 'burn', 'torn', 'flash']
    : ['slide', 'zoom', 'iris', 'fade', 'whip', 'wipe', 'carry', 'carry', 'lightleak', 'ink', 'halftone', 'collage', 'vortex', 'warp', 'chromatic', 'pixel', 'ripple'];
  // premium glides (no rough or busy joins); clinical stays crisp (grids and dots, nothing torn or burnt)
  if (style === 'premium') pool = pool.filter((t) => !['whip', 'wipe', 'glitch', 'collage', 'pixel', 'chromatic', 'torn', 'burn', 'halftone'].includes(t)).concat(['fade', 'lightleak', 'ink', 'warp']);
  if (style === 'clinical') pool = pool.filter((t) => !['whip', 'glitch', 'collage', 'torn', 'burn', 'ink', 'vortex'].includes(t));
  if (b.role === 'cta') pool = style === 'premium' ? ['carry', 'iris', 'fade', 'lightleak', 'ink'] : ['carry', 'iris', 'slide', 'fade', 'zoom', 'lightleak', 'ink', 'collage', 'flash'];
  if (prevRole === 'agitate' || (problem && b.role === 'agitate')) pool = ['cut', ...pool];
  const scored = pool.map((t) => ({t, s: rnd() - (lastT.filter((x) => x === t).length * (t === 'carry' ? 0.8 : 1.2)) - (lastT[lastT.length - 1] === t ? 5 : 0)
    - recentT.filter((x) => x === t).length * 0.5})).sort((a, z) => z.s - a.s); // and not the joins the brand's last ads used
  const t = scored[0].t;
  lastT.push(t);
  return t === 'cut' ? null : TRANS[t](dirs[Math.floor(rnd() * dirs.length)]);
};
// The end card shows the logo exactly as published - so its background must suit the logo: a dark logo (most are) on
// the light ground, a light / white logo on the brand's dark colour. Same logo pick as hf_init.mjs.
const logoTone = (() => {
  const dir = path.join(B, 'catalog', 'images', 'website');
  const logos = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^logo/i.test(f)) : [];
  const hexOf = (k) => { const v = bj.palette?.[k]; return typeof v === 'string' ? v : v?.hex; };
  const lum = (h) => (/^#[0-9a-f]{6}$/i.test(h || '') ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).reduce((a, c, k) => a + c * [0.2126, 0.7152, 0.0722][k], 0) : 0.5);
  const pick = logos.find((f) => /white/i.test(f) && lum(hexOf('primary')) < 0.6) || logos[0];
  if (!pick) return 'none';
  const file = path.join(dir, pick);
  if (/\.svg$/i.test(pick)) {
    const svg = fs.readFileSync(file, 'utf8');
    const fill = (svg.match(/fill\s*[:=]\s*["']?(#[0-9a-f]{3,6}|white|black)/i) || [])[1] || bj.logo?.cssFill || '#000';
    const hex = fill.toLowerCase() === 'white' ? '#ffffff' : fill.toLowerCase() === 'black' ? '#000000' : fill.length === 4 ? '#' + [...fill.slice(1)].map((c) => c + c).join('') : fill;
    return lum(hex) > 0.6 ? 'light' : 'dark';
  }
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'scale=32:32,format=rgba', '-f', 'rawvideo', '-'], {maxBuffer: 1 << 20});
  if (r.status !== 0) return 'dark';
  let sum = 0, n = 0;
  for (let i = 0; i < r.stdout.length; i += 4) if (r.stdout[i + 3] > 128) { sum += (0.2126 * r.stdout[i] + 0.7152 * r.stdout[i + 1] + 0.0722 * r.stdout[i + 2]) / 255; n++; }
  return n && sum / n > 0.6 ? 'light' : 'dark';
})();
// Backgrounds by real brightness, not by name - one brand's "secondary" is a deep green, another's is cream.
// The graphics draw white on their background, so content scenes alternate between the brand's DARK colours only.
const toneLum = (() => {
  const hexOf = (k) => { const v = bj.palette?.[k]; return typeof v === 'string' ? v : v?.hex; };
  const lum = (h) => (/^#[0-9a-f]{6}$/i.test(h || '') ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).reduce((a, c, k) => a + c * [0.2126, 0.7152, 0.0722][k], 0) : null);
  return {primary: lum(hexOf('primary')), secondary: lum(hexOf('secondary')), ground: lum(hexOf('ground')) ?? 1, dark: lum(hexOf('footer')) ?? 0.05};
})();
const darkBgs = ['primary', 'secondary'].filter((k) => toneLum[k] != null && toneLum[k] < 0.45);
if (!darkBgs.length) darkBgs.push('dark');
const lightBg = ['ground', 'secondary'].find((k) => toneLum[k] != null && toneLum[k] > 0.6) || 'ground';
// the end card shows the logo as published: a dark logo on the light ground, a light logo on a dark brand colour
const ctaBg = logoTone === 'dark' ? lightBg : darkBgs[0];
const bgFor = (b, i) => (['hook', 'problem', 'agitate'].includes(b.role) ? 'dark' : b.role === 'cta' ? ctaBg : darkBgs[i % darkBgs.length]);

// ------------------------------------------------------------------ background styles and light grounds
// Every scene used to sit on the same backdrop (one flat colour + glows), so ads read as one template. Each scene now
// gets a background STYLE that differs from its neighbours and from the brand's last ads, chosen from a pool that
// suits the brand's style; a third of the solution half lands on the brand's LIGHT colour (graphics switch to dark ink).
// CSS styles plus WebGL shader backgrounds (mesh, aurora, marble, liquid, godrays, blobs, voronoi, smoke)
const BG_POOL = {
  premium: ['glow', 'gradient', 'spotlight', 'paper', 'split', 'mesh', 'marble', 'smoke', 'godrays'],
  clinical: ['grid', 'gradient', 'glow', 'split', 'spotlight', 'mesh', 'voronoi'],
  playful: ['glow', 'gradient', 'pattern', 'split', 'grid', 'spotlight', 'paper', 'blobs', 'liquid', 'voronoi', 'mesh'],
}[style] || ['glow', 'gradient', 'pattern', 'split', 'grid', 'spotlight', 'paper', 'aurora', 'godrays', 'liquid', 'mesh'];
const recentBg = history.ads.slice(-3).flatMap((a) => a.bgStyles || []);
const footageBeats = beats.map((b, i) => (b.footage?.src ? i : -1)).filter((i) => i >= 0);
// devices that read on a light ground (problem visuals - pours, rain, shatter - stay on dark: they are white objects)
const LIGHT_OK = new Set(['card', 'badges', 'gauge', 'grid', 'checklist', 'timeline', 'steps', 'callouts', 'packshot', 'orbit', 'fill', 'scale', 'icon', 'phone', 'statburst', 'stars', 'draw', 'chart']);
const lightAvailable = toneLum[lightBg] != null && toneLum[lightBg] > 0.6;
const bgUsed = [];
const pickBg = (i) => {
  const near = footageBeats.find((k) => Math.abs(k - i) === 1);
  const pool = [...BG_POOL, ...(near !== undefined ? ['blur-footage', 'blur-footage'] : [])];
  const scored = pool.map((t) => ({t, s: rnd() - bgUsed.filter((x) => x === t).length * 1.2 - (bgUsed[bgUsed.length - 1] === t ? 6 : 0)
    - recentBg.filter((x) => x === t).length * 0.4})).sort((a, z) => z.s - a.s);
  const t = scored[0].t;
  bgUsed.push(t);
  return t === 'blur-footage' ? {bgStyle: t, bgClip: {src: beats[near].footage.src, trimBefore: beats[near].footage.trimBefore || 0}} : {bgStyle: t};
};
let lightRun = 0, lightCount = 0;
const solutionScenes = beats.filter((b) => !['hook', 'problem', 'agitate', 'cta'].includes(b.role)).length;
const wantLight = (b, i, p) => {
  if (!lightAvailable || ['hook', 'problem', 'agitate', 'cta'].includes(b.role) || p.extra.type === 'footage' || !LIGHT_OK.has(p.device)) return false;
  if (lightRun || lightCount >= Math.max(1, Math.round(solutionScenes / 3))) return false;
  if (i === beats.length - 2 && ctaBg === lightBg) return false; // not light straight into a light end card
  return rnd() < 0.55;
};

// ------------------------------------------------------------------ text presets and camera moves
// Headings animate by what they do: the hook snaps (fade, slam, scramble, typewriter), a claim lands (marker, mask,
// perWord, tracking), the problem stings (slam, strike when the beat gives "strike"), the CTA settles. Never the same
// preset twice in a row. Footage scenes get a camera move that suits the beat.
const usedPresets = [];
const pickPreset = (b, i) => {
  if (b.strike) return 'strike';
  const role = b.role;
  let pool = i === 0 ? ['fade', 'slam', 'scramble', 'typewriter']
    : ['problem', 'agitate'].includes(role) ? ['slam', 'perChar', 'blurIn', 'fadeRise']
      : ['claim', 'benefit', 'social'].includes(role) ? ['marker', 'mask', 'perWord', 'tracking', 'fadeRise']
        : role === 'cta' ? ['perWord', 'mask', 'fadeRise'] : ['mask', 'perWord', 'blurIn', 'fadeRise', 'tracking'];
  if (style === 'premium') pool = pool.filter((p) => !['slam', 'scramble', 'perChar'].includes(p)).concat(['blurIn', 'tracking']);
  if (style === 'clinical') pool = pool.filter((p) => !['slam', 'perChar'].includes(p)).concat(['typewriter']);
  const fresh = pool.filter((p) => p !== usedPresets[usedPresets.length - 1]);
  const pick = fresh[Math.floor(rnd() * fresh.length)] || pool[0];
  usedPresets.push(pick);
  return pick;
};
const pickCamera = (b) => {
  const pool = ['pivot', 'taste'].includes(b.role) ? ['punch', 'pushin', 'rack'] : ['problem', 'agitate', 'hook'].includes(b.role) ? ['handheld', 'pushin', 'drift'] : ['pushin', 'drift', 'pullback', 'rack'];
  return style === 'premium' ? (rnd() < 0.5 ? 'drift' : 'pushin') : pool[Math.floor(rnd() * pool.length)];
};

// ------------------------------------------------------------------ write
const transitions = beats.map(pickTrans);
const scenes = beats.map((b, i) => {
  const p = picks[i], next = transitions[i + 1];
  const duration = r2(p.dur + (next ? next.seconds : 0));
  const s = {type: p.extra.type || 'scene', duration, bg: bgFor(b, i)};
  if (p.extra.src) { s.src = p.extra.src; s.trimBefore = p.extra.trimBefore; }
  if (p.extra.cutout) s.cutout = p.extra.cutout; // the subject in front: the scene's graphics sit behind them
  if (b.text) s.text = b.text;
  if (b.text) s.preset = pickPreset(b, i);
  if (b.strike && b.text) s.strike = b.strike; // struck out, then replaced by the heading
  if (s.type === 'footage') s.camera = pickCamera(b);
  if (transitions[i]) s.transition = transitions[i];
  if (s.type === 'endcard') { s.url = b.url || siteUrl; s.cta = b.cta || 'Shop now'; }
  if (s.type !== 'footage') {
    if (s.type !== 'endcard' && wantLight(b, i, p)) { s.bg = lightBg; lightCount++; lightRun = 1; } else lightRun = 0;
    Object.assign(s, pickBg(i));
    if (s.bgStyle === 'blur-footage' && toneLum[s.bg] > 0.6) s.bgStyle = 'gradient', delete s.bgClip; // a blurred clip wants a dark tone
  } else lightRun = 0;
  s.visuals = p.visuals.map((v) => JSON.parse(JSON.stringify(v, (k, val) => (val === undefined || val === '' ? undefined : val))));
  s._plan = `${b.role}: ${p.device} - ${p.why} (also fits: ${p.alternatives.join(', ') || '-'})`;
  return s;
});
const adOut = {_about: `Planned by mg_plan.mjs (seed ${seed}) from ${path.basename(file)} for ${brand}. Edit freely; run mg_check.mjs before rendering.`,
  _animations: picks.map((p) => canon(p.device)).join(', '), scenes};
if (spec.approvedClaims) adOut.approvedClaims = spec.approvedClaims;
fs.mkdirSync(path.dirname(path.resolve(out)), {recursive: true});
fs.writeFileSync(out, JSON.stringify(adOut, null, 2));
// Remember this ad at planning time - recording only after the final render was too easy to skip. A re-plan of the
// same ad (same --name) replaces its entry rather than steering away from itself.
if (!DRY) {
  const entry = {name: NAME, date: new Date().toISOString().slice(0, 10), stage: 'planned', seed, devices: picks.map((p) => canon(p.device)), bgStyles: scenes.map((x) => x.bgStyle || (x.type === 'footage' ? 'footage' : 'glow')),
    transitions: scenes.slice(1).map((x) => x.transition?.type || 'cut')};
  const ads = [...(historyAll.ads || []).filter((a) => a.name !== NAME), entry].slice(-10);
  try { fs.writeFileSync(historyFile, JSON.stringify({ads}, null, 2)); } catch { /* read-only cache: the plan still stands */ }
}

console.log(`\n  mg_plan: ${beats.length} beats -> ${path.resolve(out)}  (seed ${seed}${BEST ? ', --best' : ''}, style ${style}${history.ads.length ? `, ${history.ads.length} earlier ads remembered` : ', no memory of earlier ads - pass --recent if the brand has some'}${AVOID.size ? `, avoiding ${[...AVOID].join('/')}` : ''})\n`);
scenes.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. ${beats[i].role.padEnd(8)} ${picks[i].device.padEnd(10)} ${(s.transition?.type || (i ? 'cut' : '')).padEnd(6)} ${(s.type === 'footage' ? 'footage' : `${s.bgStyle || 'glow'}/${s.bg}`).padEnd(22)} ${s.duration.toFixed(2)}s  ${picks[i].why}`));
const devices = picks.map((p) => p.device);
console.log(`\n  ${new Set(devices).size} different animations across ${devices.length} scenes; runtime ~${end.toFixed(1)}s`);
console.log(`  animations: ${picks.map((p) => canon(p.device)).join(', ')}  (put this line in the save_brief prompt)`);
console.log(`  next: mg_check.mjs the file, render a half-scale preview, adjust anything that reads wrong. Re-run for another mix; --seed ${seed} reproduces this one.\n`);

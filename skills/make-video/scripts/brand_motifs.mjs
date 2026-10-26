#!/usr/bin/env node
/**
 * brand_motifs.mjs - work out what this brand's animations should be MADE OF, from its website and library.
 *
 *   node brand_motifs.mjs --brand <slug> [--write] [--reset]
 *
 * Reads the brand cache (brand.json, catalog/website-brand.json, site-products.json, site-harvest.json,
 * labels.json, scene-types.json, images/products/) and writes <cache>/brands/<slug>/motifs.json:
 *
 *   category       what the brand sells (cereal, beverage, supplement, skincare, pet ...), from its own words
 *   style          playful | premium | clinical | bold - sets springs, bounce and particle density
 *   props          the brand's own object for particles, pours and orbits (cereal loops, droplets, capsules ...)
 *   problemObjects the thing the brand is the answer to (sugar cubes, blemishes ...) - for the problem half
 *   productColors  colours sampled from the transparent packshots - particles come in the products' colours
 *   packshots      transparent cut-outs first (they can fly, orbit, swing in 3D)
 *   icons          the brand's own claim words -> stroke icons ("gluten free" -> wheat + slash)
 *   claimVisuals   every website claim -> the visual that should carry it (gauge, counter, badges, split ...)
 *   actions        live library Scene Types -> the animation that matches into that footage (pour -> pour)
 *
 * The guesses are a draft: look at two packshots and the sprites you already pulled, fix props and
 * problemObjects, and set "confirmed": true. A confirmed file keeps your edits on re-runs (unless --reset).
 */
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const brand = opt('--brand');
if (!brand) { console.error('usage: node brand_motifs.mjs --brand <slug> [--write] [--reset]'); process.exit(2); }
const ROOT = process.env.MAKE_VIDEO_ROOT || path.join(os.homedir(), '.claude', 'make-video');
const B = path.join(ROOT, 'brands', brand);
const read = (p, d = null) => { try { return JSON.parse(fs.readFileSync(path.join(B, p), 'utf8')); } catch { return d; } };
const bj = read('brand.json');
if (!bj) { console.error(`no brand cache for "${brand}" - build it first (catalog_tool.mjs init)`); process.exit(1); }
const wb = read('catalog/website-brand.json', {});
const spRaw = read('catalog/site-products.json', []);
const sp = Array.isArray(spRaw) ? spRaw : spRaw.products || [];
const harvest = read('catalog/site-harvest.json', {});
const labels = read('catalog/labels.json', {});
const sceneTypes = read('catalog/scene-types.json', {});

// ------------------------------------------------------------------ category
const CATS = {
  cereal: {kw: ['cereal', 'granola', 'oat', 'muesli', 'breakfast'], props: [{shape: 'ring', why: 'cereal loops'}, {shape: 'dot', why: 'cereal pieces'}], problem: [{shape: 'cube', why: 'sugar cubes'}]},
  snack: {kw: ['snack', 'chip', 'crisps', 'bar', 'cookie', 'treat', 'candy', 'chocolate', 'gummy', 'pastr', 'jerky'], props: [{shape: 'square', why: 'bites / pieces'}, {shape: 'star', why: 'fun accents'}], problem: [{shape: 'cube', why: 'sugar cubes'}]},
  beverage: {kw: ['drink', 'beverage', 'soda', 'coffee', 'tea', 'juice', 'sparkling', 'latte', 'energy drink', 'water', 'can'], props: [{shape: 'bubble', why: 'fizz / bubbles'}, {shape: 'drop', why: 'liquid'}], problem: [{shape: 'cube', why: 'sugar cubes'}]},
  supplement: {kw: ['supplement', 'vitamin', 'capsule', 'powder', 'greens', 'collagen', 'probiotic', 'creatine', 'electrolyte', 'magnesium', 'gummies'], props: [{shape: 'pill', why: 'capsules'}, {shape: 'sparkle', why: 'vitality'}], problem: [{shape: 'dot', why: 'tiredness / deficiency marks'}]},
  skincare: {kw: ['skin', 'serum', 'moistur', 'cleanser', 'spf', 'sunscreen', 'acne', 'cream', 'lotion', 'beauty', 'makeup', 'hair', 'shampoo'], props: [{shape: 'drop', why: 'serum drops'}, {shape: 'bubble', why: 'foam / hydration'}, {shape: 'sparkle', why: 'glow'}], problem: [{shape: 'dot', why: 'blemishes'}]},
  pet: {kw: ['dog', 'cat', 'pet', 'litter', 'kibble', 'puppy', 'kitten', 'treats for'], props: [{shape: 'heart', why: 'love for the pet'}, {shape: 'dot', why: 'kibble'}], problem: [{shape: 'dot', why: 'mess / odour'}]},
  apparel: {kw: ['shirt', 'apparel', 'clothing', 'shoe', 'sneaker', 'legging', 'bra', 'underwear', 'sock', 'hoodie', 'jacket', 'dress', 'wear'], props: [{shape: 'confetti', why: 'energy'}, {shape: 'sparkle', why: 'newness'}], problem: [{shape: 'square', why: 'old / worn'}]},
  home: {kw: ['clean', 'detergent', 'candle', 'bedding', 'mattress', 'pillow', 'towel', 'laundry', 'cookware', 'home'], props: [{shape: 'bubble', why: 'clean'}, {shape: 'sparkle', why: 'fresh'}], problem: [{shape: 'dot', why: 'dirt'}]},
  fitness: {kw: ['fitness', 'workout', 'gym', 'training', 'yoga', 'pilates', 'athlete'], props: [{shape: 'dot', why: 'energy'}, {shape: 'star', why: 'wins'}], problem: [{shape: 'dot', why: 'fatigue'}]},
  tech: {kw: ['app', 'software', 'device', 'charger', 'headphone', 'gadget', 'smart', 'platform'], props: [{shape: 'square', why: 'pixels / tiles'}, {shape: 'dot', why: 'signal'}], problem: [{shape: 'square', why: 'clutter'}]},
  food: {kw: ['food', 'meal', 'sauce', 'pasta', 'bread', 'frozen', 'recipe', 'kitchen', 'protein'], props: [{shape: 'dot', why: 'ingredients'}, {shape: 'leaf', why: 'fresh'}], problem: [{shape: 'cube', why: 'sugar / additives'}]},
};
const lower = (s) => String(s || '').toLowerCase();
const corpus = [
  [lower(bj.vertical), 6], [lower(bj.description), 3], [lower(harvest.title), 3], [lower(harvest.description), 3],
  [lower(sp.map((p) => `${p.type} ${p.title}`).join(' ')), 1],
  [lower((labels.labelCategories || []).flatMap((c) => c.labels || []).join(' ')), 1],
];
const scores = Object.entries(CATS).map(([k, v]) => {
  let s = 0;
  for (const [text, w] of corpus) for (const kw of v.kw) s += (text.split(kw).length - 1) * w;
  return [k, s];
}).sort((a, b) => b[1] - a[1]);
const category = scores[0][1] > 0 ? scores[0][0] : 'general';

// ------------------------------------------------------------------ style
const desc = lower(`${bj.description} ${harvest.description} ${bj.vertical}`);
const hits = (ws) => ws.reduce((n, w) => n + (desc.includes(w) ? 1 : 0), 0);
const hexOf = (k) => { const v = bj.palette?.[k]; return typeof v === 'string' ? v : v?.hex; };
const sat = (h) => {
  if (!/^#[0-9a-f]{6}$/i.test(h || '')) return 0;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
};
const styleScores = {
  playful: hits(['fun', 'playful', 'vibrant', 'cartoon', 'colorful', 'colourful', 'nostalg', 'whimsical', 'kids', 'bold flavor', 'childhood']) + (sat(hexOf('primary')) > 0.7 ? 1 : 0),
  premium: hits(['luxury', 'premium', 'elegant', 'minimal', 'refined', 'artisan', 'crafted', 'timeless']) + (sat(hexOf('primary')) < 0.25 ? 1 : 0),
  clinical: hits(['clinical', 'science', 'dermatolog', 'doctor', 'research', 'lab', 'formulated', 'pharmac']),
};
const bestStyle = Object.entries(styleScores).sort((a, b) => b[1] - a[1])[0];
const style = bestStyle[1] > 0 ? bestStyle[0] : 'bold';

// ------------------------------------------------------------------ icons from the brand's own words
const ICON_KW = [
  ['gluten free', 'wheat', true], ['gluten-free', 'wheat', true], ['grain free', 'grain', true], ['grain-free', 'grain', true],
  ['dairy free', 'drop', true], ['dairy-free', 'drop', true], ['sugar free', 'cube', true], ['0g sugar', 'cube', true], ['0g total sugars', 'cube', true],
  ['zero sugar', 'cube', true], ['no sugar', 'cube', true], ['no added sugar', 'cube', true], ['no cane sugar', 'cube', true], ['low sugar', 'cube', false],
  ['keto', 'flame', false], ['protein', 'dumbbell', false], ['vegan', 'leaf', false], ['plant-based', 'seedling', false], ['plant based', 'seedling', false],
  ['organic', 'leaf', false], ['natural', 'leaf', false], ['non-gmo', 'seedling', false], ['soy free', 'grain', true], ['nut free', 'grain', true],
  ['caffeine', 'bolt', false], ['energy', 'bolt', false], ['sleep', 'moon', false], ['focus', 'brain', false], ['gut', 'heart', false],
  ['hydrat', 'drop', false], ['electrolyte', 'drop', false], ['vitamin', 'pill', false], ['clinically', 'flask', false], ['dermatolog', 'shield', false],
  ['cruelty', 'heart', false], ['fragrance free', 'sparkle', true], ['spf', 'sun', false], ['free shipping', 'truck', false], ['shipping', 'truck', false],
  ['guarantee', 'shield', false], ['money-back', 'shield', false], ['subscri', 'calendar', false], ['review', 'star', false], ['5-star', 'star', false],
  ['rated', 'star', false], ['recycl', 'recycle', false], ['sustainab', 'globe', false], ['compostable', 'recycle', false], ['plastic-free', 'recycle', false],
  ['net carbs', 'grain', false], ['carbs', 'grain', false], ['calorie', 'flame', false], ['fiber', 'wheat', false], ['collagen', 'sparkle', false],
  ['glow', 'sparkle', false], ['odor', 'waves', false], ['odour', 'waves', false], ['clump', 'cube', false], ['tastes', 'heart', false], ['delicious', 'heart', false],
  ['dust-free', 'waves', true], ['dust free', 'waves', true], ['non-toxic', 'shield', false], ['non toxic', 'shield', false],
  ['ph level', 'flask', false], ['health', 'heart', false], ['kidney', 'drop', false], ['urinary', 'drop', false], ['vet', 'shield', false],
  ['sugar alcohol', 'cube', true], ['corn syrup', 'drop', true], ['made in', 'globe', false], ['kids', 'smile', false], ['family', 'users', false],
  ['customers', 'users', false], ['fast', 'bolt', false], ['minutes', 'clock', false], ['daily', 'calendar', false], ['save', 'percent', false],
];
const claims = (wb.claims || []).map((c) => (typeof c === 'string' ? {text: c} : c));
const brandWords = lower([...claims.map((c) => c.text), harvest.description, harvest.title, bj.description, ...sp.flatMap((p) => p.tags || [])].join(' | '));
const icons = {};
for (const [kw, icon, slash] of ICON_KW) if (brandWords.includes(kw)) icons[kw] = slash ? {icon, slash: true} : {icon};

// ------------------------------------------------------------------ claims -> visuals
const claimVisuals = [];
for (const c of claims) {
  // split on list commas, not the thousands comma in "18,000+"
  const frags = c.text.split(/,(?!\d{3})|\band\b|\||;/i).map((s) => s.trim()).filter(Boolean);
  const listy = /^no\s|free\b/i.test(c.text) && frags.length >= 2;
  if (listy) { claimVisuals.push({claim: c.text, visual: 'badges', why: 'a "free from" list - badges with slashed icons', url: c.url}); continue; }
  for (const fr of frags) {
    const t = lower(fr);
    let v = null, value = null, why = '';
    const range = fr.match(/(\d+(?:\.\d+)?)\s?g?\s?-\s?(\d+(?:\.\d+)?)\s?(g|mg|%)/i);
    // "0g", "zero", "no ..." - and a LOW range of something the brand removes (0-2g sugar) - is a disappearing act, not a fill.
    const minimise = /sugar|carb|calori|fat|sodium|chemical|additive|preservative|plastic/i.test(fr);
    const zero = fr.match(/\b0\s?(g|mg|%)\b/i) || /zero|no\s/i.test(fr) || (minimise && range && Number(range[1]) === 0);
    const pct = fr.match(/(\d+(?:\.\d+)?)\s?%/);
    // "18,000+ five-star reviews": up to two words may sit between the number and the noun
    const count = fr.match(/(\d[\d,]*\+?)\s*(?:[\w-]+\s+){0,2}(reviews|customers|sold|ratings|bowls|people|users|cats|parents)/i);
    const times = fr.match(/(\d+(?:\.\d+)?)\s?x\b/i); // "7.5x less time", "4x better"
    const amount = fr.match(/(\d+(?:\.\d+)?)\s?(g|kg|mg|mcg|ml|l|iu|cal|kcal|hours|hrs|minutes|min|days|weeks|months?)\b/i);
    if (count) { v = 'counter'; value = count[1]; why = 'social proof rolls up, with star particles'; }
    else if (times) { v = 'chart'; value = times[0].replace(/\s/g, ''); why = 'a multiplier - the old way vs the brand as a line or bars'; }
    else if (zero && /\d|zero/.test(fr)) { v = 'shatter+counter'; value = range ? range[0].replace(/\s/g, '') : (fr.match(/\b0\s?(g|mg|%)/i) || ['0'])[0].replace(/\s/g, ''); why = 'the problem object shatters, the counter rolls to zero'; }
    else if (range) { v = 'gauge'; value = range[0].replace(/\s/g, ''); why = 'a ring fills to the range'; }
    else if (pct) { v = 'gauge'; value = pct[0].replace(/\s/g, ''); why = 'a ring fills to the percentage'; }
    else if (amount) { v = /hour|min|day/.test(amount[2]) ? 'chart' : 'gauge'; value = amount[0].replace(/\s/g, ''); why = v === 'chart' ? 'a line rising over time' : 'a ring fills to the amount'; }
    else if (/free\b|keto|vegan|organic|non-gmo|plant/i.test(t)) { v = 'badges'; why = 'a stamped badge with its icon'; }
    else if (/vs\.?|than|compared|instead of/i.test(t)) { v = 'split'; why = 'old way vs the brand (never name a competitor)'; }
    else if (/tast|delicious|flavou?r|feel|love/i.test(t)) { v = 'packshot'; why = 'subjective - show the product (packshot, orbit) or footage, not a number'; }
    if (v) claimVisuals.push({claim: c.text, fragment: fr, value, visual: v, why, url: c.url});
  }
}

// ------------------------------------------------------------------ packshots + product colours
const prodDir = path.join(B, 'catalog', 'images', 'products');
const prodFiles = fs.existsSync(prodDir) ? fs.readdirSync(prodDir).filter((f) => /\.(png|webp|jpe?g)$/i.test(f)) : [];
const sample = (file) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'scale=16:16:flags=area,format=rgba', '-f', 'rawvideo', '-'], {maxBuffer: 1 << 20});
  return r.status === 0 ? r.stdout : null;
};
const packs = [];
const swatches = [];
for (const f of prodFiles) {
  const buf = sample(path.join(prodDir, f));
  if (!buf) continue;
  let transparent = 0;
  for (let i = 0; i < buf.length; i += 4) {
    const [r, g, b, a] = [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
    if (a < 40) { transparent++; continue; }
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx < 40 || mn > 225 || (mx - mn) / mx < 0.35) continue; // skip black, white, greys
    swatches.push([r, g, b]);
  }
  packs.push({file: `products/${f}`, cutout: transparent / (buf.length / 4) > 0.08});
}
packs.sort((a, b) => Number(b.cutout) - Number(a.cutout));
// Bucket the swatches (4 levels per channel), keep the most common distinct hues.
const buckets = new Map();
for (const [r, g, b] of swatches) {
  const k = `${r >> 6}${g >> 6}${b >> 6}`;
  const e = buckets.get(k) || {n: 0, r: 0, g: 0, b: 0};
  e.n++; e.r += r; e.g += g; e.b += b; buckets.set(k, e);
}
const toHex = (e) => '#' + [e.r, e.g, e.b].map((v) => Math.round(v / e.n).toString(16).padStart(2, '0')).join('').toUpperCase();
const productColors = [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, 6).map(toHex);

// ------------------------------------------------------------------ library actions -> matching animations
const dead = new Set([...(labels.deadValues?.['Scene Type'] || []), ...(labels.bannedValues?.['Scene Type'] || [])].map(lower));
const sceneLabels = ((labels.labelCategories || []).find((c) => c.category === 'Scene Type')?.labels || [])
  .filter((l) => !/do not use/i.test(l) && !dead.has(lower(l)));
const liveOf = Object.fromEntries((sceneTypes.entries || []).map((e) => [e.label, e.liveInSearch]));
const ACTIONS = [
  [/pour/i, 'pour', 'animate a pour of the brand prop, then match-cut into this footage on the falling motion'],
  [/unbox/i, 'packshot', 'packshot swing-in (or orbit) cutting into the unboxing'],
  [/spoon|bite|eat|tast|chew|drink|sip|serving/i, 'particles', 'a burst of the brand prop on the bite / sip, over the footage'],
  [/box shot|product shot|holding|bowl shot|product intro|packshot/i, 'packshot', 'packshot or orbit with the benefit icons'],
  [/apply|routine|how to|tutorial/i, 'steps', 'icon steps for the routine'],
  [/before|after/i, 'split', 'before / after split with the wipe divider'],
  [/compar/i, 'split', 'the old way vs the brand - never name a competitor'],
  [/problem|pain|struggle|hook/i, 'pour', 'the problem object pouring / piling up, or a chart crashing'],
  [/workout|gym|run|sport|pre workout/i, 'chart', 'an energy line rising, or a gauge filling'],
  [/factory|made|recipe|cook|kitchen/i, 'steps', 'how-it-is-made steps'],
  [/screen recording|app/i, 'icon', 'a phone icon burst into the screen recording'],
  [/lifestyle|outdoor|b roll|dancing|subway/i, 'particles', 'ambient brand-prop particles over the lifestyle shot'],
  [/testimonial|review|rating/i, 'badges', 'star badges or a review counter as an overlay'],
  [/benefit|description/i, 'badges', 'claim badges with icons'],
  [/cta/i, 'packshot', 'packshot with rays into the end card'],
];
const actions = [];
for (const l of sceneLabels) {
  const a = ACTIONS.find(([re]) => re.test(l));
  if (a) actions.push({label: l, animation: a[1], note: a[2], live: liveOf[l] ?? null});
}

// ------------------------------------------------------------------ write
const cat = CATS[category] || {props: [{shape: 'dot', why: 'neutral'}], problem: [{shape: 'dot', why: 'neutral'}]};
const outFile = path.join(B, 'motifs.json');
const prev = (() => { try { return JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch { return null; } })();
const keep = prev?.confirmed && !argv.includes('--reset');
const motifs = {
  _about: `Written by brand_motifs.mjs on ${new Date().toISOString().slice(0, 10)} from the website and the Recharm library. ` +
    'props / problemObjects / style are guesses until "confirmed": true - check them against two packshots and the sprites you pulled.',
  brand,
  category,
  categoryScores: Object.fromEntries(scores.slice(0, 4)),
  style: keep ? prev.style : style,
  confirmed: keep ? true : false,
  props: keep ? prev.props : cat.props,
  problemObjects: keep ? prev.problemObjects : cat.problem,
  productColors,
  packshots: packs.map((p) => p.file),
  cutouts: packs.filter((p) => p.cutout).map((p) => p.file),
  icons: {...icons, ...(keep ? prev.iconsOverride || {} : {})},
  claimVisuals,
  actions,
  agentTodo: keep ? [] : [
    'Open two packshots (catalog/images/products) and one library sprite of the product in use: is props[0] what the product looks like out of the pack? (cereal loops, gummies, capsules, droplets...). Set "image" to a cut-out PNG in public/products/ if the product itself should be the particle.',
    'problemObjects: the thing this brand removes or fixes, in the brand\'s own words (sugar -> cube, blemish -> dot, odour -> waves...).',
    'style: playful / premium / clinical / bold - does the website feel like that?',
    'Then set "confirmed": true.',
  ],
};
if (argv.includes('--write')) fs.writeFileSync(outFile, JSON.stringify(motifs, null, 2));

console.log(`\n  ${bj.prettyName || brand} motifs${argv.includes('--write') ? ` -> ${outFile}` : ' (dry run - add --write)'}${keep ? '  (confirmed - your props/style kept)' : ''}`);
console.log(`  category   ${category}   (${scores.slice(0, 3).map(([k, s]) => `${k} ${s}`).join(', ')})`);
console.log(`  style      ${motifs.style}`);
console.log(`  props      ${motifs.props.map((p) => `${p.shape}${p.image ? `(${p.image})` : ''} - ${p.why || ''}`).join('; ')}`);
console.log(`  problem    ${motifs.problemObjects.map((p) => `${p.shape} - ${p.why || ''}`).join('; ')}`);
console.log(`  colours    ${productColors.join(' ') || 'none (no packshots)'}`);
console.log(`  packshots  ${packs.length} (${motifs.cutouts.length} transparent cut-outs)`);
console.log(`  icons      ${Object.entries(icons).map(([k, v]) => `${k}->${v.icon}${v.slash ? '/' : ''}`).join(', ') || 'none found'}`);
console.log(`  claims     ${claimVisuals.length} mapped: ${claimVisuals.slice(0, 6).map((c) => `${c.value || c.fragment || c.claim.slice(0, 18)}->${c.visual}`).join(', ')}${claimVisuals.length > 6 ? ' ...' : ''}`);
console.log(`  actions    ${actions.map((a) => `${a.label}->${a.animation}`).join(', ') || 'no Scene Type labels'}`);
if (!motifs.confirmed) console.log('\n  todo: confirm props / problemObjects / style against two packshots and a sprite, then set "confirmed": true');

#!/usr/bin/env node
/**
 * mg_check.mjs - check a motion-graphics ad (or overlay) JSON BEFORE rendering it.
 *
 *   node mg_check.mjs <project>/ads/<name>.json [--brand <slug>] [--project <dir>] [--record]
 *   --record (after the FINAL render): remember the animations used, so the next ad for this brand varies
 *
 * Blocks (exit 1):
 *   - any scene or overlay item whose only animation is text (the same rule the renderer enforces):
 *     it needs footage, a product/packshot, an end card, bars, icon steps, or a visual from the library
 *     (pour, shatter, chart, gauge, card, badges, icon, steps, orbit, packshot, split, particles).
 *     A counter, scribble, sparkles or rays alone is still text / decoration.
 *   - unknown visual kinds, shapes or icons; missing image / footage files; broken chart data
 *   - a number on screen that isn't in the website claims or the ad's "approvedClaims"
 * Warns:
 *   - motifs.json not confirmed, or scenes that ignore the brand's motifs (off-brand shapes, no brand objects)
 *   - (blocks) the same animation leading two scenes in a row, or more than two scenes in one ad
 *   - few different animations, the same opening or slot-by-slot sequence as the brand's last ad, repeated transitions
 *   - timings past the end of their scene
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {BG_STYLES, CAMERAS, LOOKS, PRESETS, TRANSITION_TYPES} from './lib/vocab.mjs';
import {fileURLToPath} from 'node:url';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const file = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1]?.startsWith('--') !== true);
if (!file || !fs.existsSync(file)) { console.error('usage: node mg_check.mjs <ads/name.json> [--brand <slug>] [--project <dir>]'); process.exit(2); }
const ad = JSON.parse(fs.readFileSync(file, 'utf8'));
const project = path.resolve(opt('--project', path.join(path.dirname(path.resolve(file)), '..')));
const readJ = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const motifs = readJ(path.join(project, 'motifs.json')) || {};
const brand = opt('--brand', motifs.brand || '');
const ROOT = process.env.MAKE_VIDEO_ROOT || path.join(os.homedir(), '.claude', 'make-video');

const blocks = [], warns = [], oks = [];

// ---- vocabulary from the template itself, so this never drifts from the code
// The animation library is the skill's runtime source (assets/hyperframes-runtime/src): the kinds, shapes and icons.
const RUNTIME_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'hyperframes-runtime', 'src');
const src = (p) => { try { return fs.readFileSync(path.join(RUNTIME_SRC, p), 'utf8'); } catch { return ''; } };
const iconsTs = src('lib/icons.ts');
const ICONS = new Set([...iconsTs.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]));
const visTs = src('visuals.tsx');
const SHAPES = new Set((visTs.match(/SHAPES: Shape\[\] = \[([^\]]+)\]/)?.[1] || '').match(/'(\w+)'/g)?.map((s) => s.slice(1, -1)) || []);
const KINDS = ['particles', 'pour', 'shatter', 'chart', 'gauge', 'counter', 'card', 'badges', 'icon', 'steps', 'orbit', 'packshot', 'split', 'callouts', 'grid',
  'countdown', 'phone', 'slider', 'fill', 'timeline', 'scale', 'checklist', 'draw', 'stars', 'donut', 'race', 'lottie', 'scribble', 'sparkles', 'rays'];
const NOT_ENOUGH = ['scribble', 'sparkles', 'rays', 'counter'];
const customReg = src('custom/index.ts');
if (!iconsTs || !visTs) blocks.push(`no animation library in ${RUNTIME_SRC} - the skill install is incomplete`);

const exists = (p) => /^https?:/.test(p) || fs.existsSync(path.join(project, 'assets', p));
const brandShapes = new Set([...(motifs.props || []), ...(motifs.problemObjects || [])].map((p) => p.shape));
const iconOk = (n, where) => { if (n && ICONS.size && !ICONS.has(n)) blocks.push(`${where}: unknown icon "${n}" (see src/lib/icons.ts)`); };

const checkVisual = (v, where, dur) => {
  if (!KINDS.includes(v.kind)) { blocks.push(`${where}: unknown visual kind "${v.kind}"`); return; }
  if (v.shape && SHAPES.size && !SHAPES.has(v.shape)) blocks.push(`${where}: unknown shape "${v.shape}"`);
  if (v.shape && !['image', 'star'].includes(v.shape) && brandShapes.size && !brandShapes.has(v.shape)) warns.push(`${where}: shape "${v.shape}" isn't one of the brand's motifs (${[...brandShapes].join(', ')}) - leave it out to use the brand's own object`);
  for (const k of ['image', 'src', 'center']) if (typeof v[k] === 'string' && !exists(v[k])) blocks.push(`${where}: ${k} "${v[k]}" not found in assets/`);
  if (v.kind === 'pour' && v.source && !['box', 'none'].includes(v.source) && !exists(v.source)) blocks.push(`${where}: pour source "${v.source}" not found in assets/`);
  if (v.kind === 'split') for (const side of ['a', 'b']) {
    const p = v[side] || {};
    if (!p.image && !p.footage && !p.icon) blocks.push(`${where}: split panel ${side} is empty - give it an image, footage or icon`);
    for (const k of ['image', 'footage']) if (p[k] && !exists(p[k])) blocks.push(`${where}: split ${side}.${k} "${p[k]}" not found`);
    iconOk(p.icon, `${where} split ${side}`);
  }
  if (v.kind === 'chart') {
    if (!Array.isArray(v.points) || v.points.length < 2) blocks.push(`${where}: chart needs points: [y0, y1, ...] (0..1)`);
    else {
      if (v.times && v.times.length !== v.points.length) blocks.push(`${where}: chart times (${v.times.length}) must match points (${v.points.length})`);
      for (const c of v.callouts || []) if (c.i < 0 || c.i >= v.points.length) blocks.push(`${where}: callout i=${c.i} is outside the points`);
      if (dur && v.times && Math.max(...v.times) > dur) warns.push(`${where}: the chart is still drawing at ${Math.max(...v.times)}s, after the scene ends (${dur}s)`);
    }
  }
  if (v.kind === 'badges') for (const it of v.items || []) iconOk(it.icon, where);
  if (v.kind === 'steps') for (const it of v.items || []) iconOk(it.icon, where);
  if (v.kind === 'orbit') for (const ic of v.icons || []) iconOk(ic, where);
  if (v.kind === 'icon') iconOk(v.icon, where);
  if (v.kind === 'countdown') {
    if (v.from && !/^\d+(:\d{1,2}){1,3}$/.test(v.from)) blocks.push(`${where}: countdown from "${v.from}" - use "MM:SS", "HH:MM:SS" or "D:HH:MM:SS"`);
    warns.push(`${where}: a countdown promises a real deadline - make sure the offer really ends (the user confirmed it), or drop the clock`);
  }
  if (v.kind === 'phone') {
    if (v.screen && !['notify', 'chat', 'cart', 'scroll'].includes(v.screen)) blocks.push(`${where}: phone screen "${v.screen}" - use notify, chat, cart or scroll`);
    if (['notify', 'chat', undefined].includes(v.screen) && !(v.items || []).length) blocks.push(`${where}: a ${v.screen || 'notify'} phone needs items: [{title?, text}]`);
    for (const it of v.items || []) iconOk(it.icon, where);
  }
  if (v.kind === 'slider') for (const side of ['a', 'b']) {
    const p = v[side] || {};
    if (!p.image && !p.footage) blocks.push(`${where}: slider ${side} needs an image or footage (before / after)`);
    for (const k of ['image', 'footage']) if (p[k] && !exists(p[k])) blocks.push(`${where}: slider ${side}.${k} "${p[k]}" not found`);
  }
  if (v.kind === 'fill') {
    if (v.vessel && !['glass', 'bottle', 'jar', 'battery'].includes(v.vessel)) blocks.push(`${where}: fill vessel "${v.vessel}" - use glass, bottle, jar or battery`);
    if (v.level !== undefined && !(v.level > 0 && v.level <= 1)) blocks.push(`${where}: fill level is 0..1`);
  }
  if (v.kind === 'timeline') {
    if (!(v.items || []).length || v.items.length < 2) blocks.push(`${where}: timeline needs 2+ items: [{label: "DAY 1", text?}]`);
    else if (v.items.length > 5) warns.push(`${where}: ${v.items.length} milestones crowd the track - 3-4 read best`);
    for (const it of v.items || []) { if (!it.label) blocks.push(`${where}: every timeline item needs a label`); iconOk(it.icon, where); }
  }
  if (v.kind === 'scale') for (const side of ['a', 'b']) {
    const p = v[side] || {};
    if (p.image && !exists(p.image)) blocks.push(`${where}: scale ${side}.image "${p.image}" not found`);
    iconOk(p.icon, `${where} scale ${side}`);
  }
  if (v.kind === 'checklist') {
    if (!(v.rows || []).length || v.rows.length < 2) blocks.push(`${where}: checklist needs 2+ rows`);
    else if (v.rows.length > 6) warns.push(`${where}: ${v.rows.length} rows - keep it to 3-5 so each tick lands`);
  }
  if (v.kind === 'stars' && !(Number(v.rating) > 0 && Number(v.rating) <= (v.outOf || 5))) blocks.push(`${where}: stars needs the rating the site shows (0-${v.outOf || 5})`);
  if (v.kind === 'donut' && !((v.segments || []).length >= 2)) blocks.push(`${where}: donut needs 2+ segments [{label, value}]`);
  if (v.kind === 'race' && !((v.items || []).length >= 2)) blocks.push(`${where}: race needs 2+ items [{label, value}]`);
  if (v.kind === 'race' && (v.items || []).some((it) => !it.highlight) && !(v.items || []).some((it) => it.highlight)) warns.push(`${where}: race - highlight the brand's bar`);
  if (v.kind === 'lottie' && (!v.src || !exists(v.src))) blocks.push(`${where}: lottie src "${v.src}" not found in assets/`);
  if (v.kind === 'draw') { iconOk(v.icon, where); if (!v.icon && !v.path && !v.image && !(motifs.cutouts || motifs.packshots || []).length) blocks.push(`${where}: draw needs an image, icon or path (no cut-out in motifs.json)`); }
  if (dur && typeof v.at === 'number' && v.at >= dur) warns.push(`${where}: starts at ${v.at}s but the scene is ${dur}s`);
};

const texts = [];
const pushText = (...xs) => xs.flat().forEach((x) => typeof x === 'string' && texts.push(x));
const collectVisualText = (v) => {
  pushText(v.value, v.label, v.sub, v.title, v.sourceLabel);
  (v.items || []).forEach((i) => pushText(i.text));
  (v.rows || []).forEach((r) => (typeof r === 'string' ? pushText(r) : pushText(r.label, r.value, r.text)));
  if (v.kind === 'stars') pushText(String(v.rating), v.count);
  (v.segments || []).forEach((sg) => pushText(sg.label));
  if (v.kind === 'race') (v.items || []).forEach((it) => pushText(`${it.value}${v.unit || ''}`));
  pushText(v.center);
  (v.items || []).forEach((i) => pushText(i.label, i.title));
  pushText(v.price, v.us, v.them);
  (v.callouts || []).forEach((c) => pushText(c.text));
  pushText(v.labels || []);
  for (const side of ['a', 'b']) pushText(v[side]?.label);
};

// ---- scenes
// The "device" a scene leads with - what variety is counted on. Particles only count when nothing else animates.
const deviceOf = (s, vis) => {
  if (s.type === 'endcard') return 'endcard';
  const real = vis.find((v) => !NOT_ENOUGH.includes(v.kind) && v.kind !== 'particles');
  if (s.type === 'footage') return real ? real.kind : 'footage'; // particles over a clip: the clip is the device
  const main = real || vis.find((v) => v.kind === 'particles');
  if (main) return main.kind;
  return s.type === 'footage' ? 'footage' : s.type;
};
const historyFile = brand ? path.join(ROOT, 'brands', brand, 'motion-history.json') : '';
const motionHistory = (historyFile && readJ(historyFile)) || {ads: []};
let brandUse = 0;
if (ad.look && !LOOKS.includes(ad.look)) blocks.push(`look "${ad.look}" - use ${LOOKS.join(', ')}`);
if (Array.isArray(ad.scenes)) {
  const kindsInOrder = [];
  ad.scenes.forEach((s, i) => {
    const where = `scene ${i + 1} (${s.type}${s.text ? `: "${s.text.slice(0, 28)}"` : ''})`;
    const vis = s.visuals || [];
    vis.forEach((v, j) => checkVisual(v, `${where} visual ${j + 1}`, s.duration));
    vis.forEach(collectVisualText);
    pushText(s.text, s.sub, s.value, s.label, s.items || [], s.cta, (s.bars || []).map((b) => b.label), s.note, s.lowerThird?.title, s.lowerThird?.sub);
    const real = vis.find((v) => !NOT_ENOUGH.includes(v.kind));
    const reason = s.type === 'footage' ? 'footage' : ['product', 'endcard'].includes(s.type) ? s.type : s.type === 'compare' ? 'bars'
      : s.type === 'custom' ? (s.draws ? 'custom' : null) : s.type === 'list' && s.marker === 'icon' ? 'icon steps' : real ? real.kind : null;
    if (!reason) {
      const only = vis.map((v) => v.kind).join(', ');
      blocks.push(`${where} only animates text${only ? ` (${only} alone is not enough)` : ''} - add a visual that explains the beat (motifs.json claimVisuals / actions suggest one)`);
    }
    if (s.type === 'custom') {
      if (!s.draws) blocks.push(`${where}: a custom scene must say what it draws besides text in "draws"`);
      const customFile = s.html ? path.join(project, 'assets', 'custom', s.html.replace(/^custom[/]/, '')) : '';
      if (s.html) { if (!fs.existsSync(customFile)) blocks.push(`${where}: custom scene ${customFile} not found`); }
      else if (!s.component) blocks.push(`${where}: a custom scene needs "html" (a HyperFrames composition in assets/custom/) or "component"`);
      else if (!customReg.includes(s.component)) blocks.push(`${where}: component "${s.component}" is not registered in the runtime (assets/hyperframes-runtime/src/custom/index.ts, then rebuild)`);
    }
    if ((s.type === 'footage' || s.type === 'product') && s.src && !exists(s.src)) blocks.push(`${where}: src "${s.src}" not found`);
    if (s.cutout) {
      const cj = path.join(project, 'assets', s.cutout, 'cutout.json');
      if (s.type !== 'footage') warns.push(`${where}: "cutout" only works on a footage scene - ignored`);
      else if (!fs.existsSync(cj)) blocks.push(`${where}: cutout "${s.cutout}" has no cutout.json - run scripts/separate.mjs on ${s.src} first`);
      else {
        const c = JSON.parse(fs.readFileSync(cj, 'utf8')), t0 = s.trimBefore || 0, t1 = t0 + s.duration;
        if (t0 < c.start - 0.05 || t1 > c.start + c.frames / c.fps + 0.05)
          warns.push(`${where}: the cut-out covers ${c.start}-${(c.start + c.frames / c.fps).toFixed(2)}s of the clip but the scene uses ${t0}-${t1.toFixed(2)}s - the subject drops back behind the graphics outside it`);
      }
    }
    if (s.bgStyle && !BG_STYLES.includes(s.bgStyle)) blocks.push(`${where}: bgStyle "${s.bgStyle}" - use ${BG_STYLES.join(', ')}`);
    if (s.preset && !PRESETS.includes(s.preset)) blocks.push(`${where}: text preset "${s.preset}" - use ${PRESETS.join(', ')}`);
    if (s.preset === 'strike' && !s.strike) blocks.push(`${where}: the strike preset needs "strike" (the words struck out before the heading)`);
    if (s.camera && !CAMERAS.includes(s.camera)) blocks.push(`${where}: camera "${s.camera}" - use ${CAMERAS.join(', ')}`);
    if (s.camera && s.type !== 'footage') warns.push(`${where}: "camera" only moves footage scenes - ignored`);
    if (s.bgStyle === 'blur-footage' && (!s.bgClip?.src || !exists(s.bgClip.src))) blocks.push(`${where}: a blur-footage background needs bgClip: {src, trimBefore} with a clip in assets/`);
    if (s.transition && !TRANSITION_TYPES.includes(s.transition.type)) blocks.push(`${where}: transition "${s.transition.type}" - use ${TRANSITION_TYPES.join(', ')}`);
    if (s.transition?.type === 'carry' && !['dot', 'ring', 'flood', 'bar', 'object', undefined].includes(s.transition.variant))
      blocks.push(`${where}: carry variant "${s.transition.variant}" - use dot, ring, flood, bar or object`);
    // brand-informed: footage from the library, packshots, or the motifs' own objects (default shapes)
    const usesBrand = s.type === 'footage' || s.type === 'product' || s.type === 'endcard'
      || vis.some((v) => ['pour', 'shatter', 'particles', 'orbit', 'packshot'].includes(v.kind) && (!v.shape || brandShapes.has(v.shape) || v.shape === 'image'))
      || vis.some((v) => v.kind === 'badges' && (v.items || []).some((it) => !it.icon))
      || vis.some((v) => v.kind === 'split' && (v.a?.footage || v.b?.footage || v.a?.image || v.b?.image))
      || vis.some((v) => ['scale', 'draw'].includes(v.kind) || (v.kind === 'phone' && ['cart', 'scroll'].includes(v.screen)) || (v.kind === 'slider' && (v.a?.footage || v.b?.footage)));
    if (usesBrand) brandUse++;
    kindsInOrder.push(deviceOf(s, vis));
    (s.shake || []).forEach((t) => { if (t >= s.duration) warns.push(`${where}: shake at ${t}s is after the scene ends`); });
  });
  // ---- backgrounds: three scenes in a row on the same backdrop read as one slab
  {
    const bgs = ad.scenes.map((s) => (s.type === 'footage' ? null : `${s.bgStyle || 'glow'}`));
    for (let i = 2; i < bgs.length; i++) if (bgs[i] && bgs[i] === bgs[i - 1] && bgs[i] === bgs[i - 2]) {
      warns.push(`scenes ${i - 1}-${i + 1} all use the "${bgs[i]}" background - vary bgStyle (glow, gradient, spotlight, grid, paper, pattern, blur-footage, split)`); break;
    }
  }
  // ---- variety: the same animation back to back, or more than twice, reads as a template
  const FREE = ['footage', 'endcard'];
  for (let i = 1; i < kindsInOrder.length; i++) {
    if (kindsInOrder[i] === kindsInOrder[i - 1] && !FREE.includes(kindsInOrder[i])) {
      blocks.push(`scenes ${i} and ${i + 1} both lead with "${kindsInOrder[i]}" - change one (mg_plan.mjs picks varied visuals automatically)`);
    }
  }
  const counts = kindsInOrder.reduce((m, k) => ({...m, [k]: (m[k] || 0) + 1}), {});
  for (const [k, n] of Object.entries(counts)) {
    if (FREE.includes(k)) continue;
    if (n > 2) blocks.push(`"${k}" leads ${n} scenes - use each animation at most twice per ad`);
    else if (n === 2 && k !== 'pour') warns.push(`"${k}" leads 2 scenes - fine if it's a deliberate rhyme (problem vs solution), otherwise swap one`);
  }
  const distinct = new Set(kindsInOrder.filter((k) => !FREE.includes(k))).size;
  const animated = kindsInOrder.filter((k) => !FREE.includes(k)).length;
  if (animated >= 4 && distinct < Math.min(animated - 1, 6)) warns.push(`only ${distinct} different animations across ${animated} animated scenes - aim for ${Math.min(animated - 1, 6)}+`);
  else if (animated) oks.push(`${distinct} different animations across ${animated} animated scenes`);
  // ---- across ads: don't open, or run, the way the brand's last ad did
  // the planner already wrote this ad's own entry - compare with the brand's previous ad, not with itself
  const last = (motionHistory.ads || []).filter((a) => a.name !== path.basename(file, '.json')).slice(-1)[0];
  if (last?.devices?.length) {
    if (last.devices[0] === kindsInOrder[0] && !FREE.includes(kindsInOrder[0])) warns.push(`opens with "${kindsInOrder[0]}" like the last ${brand} ad (${last.name}) - lead with something else`);
    const same = kindsInOrder.filter((k, i) => last.devices[i] === k && !FREE.includes(k)).length;
    if (animated && same / animated > 0.6) warns.push(`${same}/${animated} scenes repeat the last ad's animation in the same slot - re-plan with another seed`);
  }
  const joins = ad.scenes.slice(1).map((s) => s.transition?.type || 'cut');
  if (joins.length >= 4 && new Set(joins).size === 1) warns.push(`every join is "${joins[0]}" - choose transitions per story beat`);
  for (let i = 2; i < joins.length; i++) if (joins[i] === joins[i - 1] && joins[i] === joins[i - 2] && joins[i] !== 'cut') warns.push(`three "${joins[i]}" transitions in a row (joins ${i - 1}-${i + 1})`);
  if (ad.scenes.length && brandUse / ad.scenes.length < 0.5) {
    warns.push(`only ${brandUse}/${ad.scenes.length} scenes use the brand's own material (library footage, packshots, its motif objects) - the animation should look like THIS brand`);
  }
  if (!blocks.some((b) => b.includes('only animates text'))) oks.push(`${ad.scenes.length} scenes: every one animates more than text`);
}

// ---- overlay
if (Array.isArray(ad.items)) {
  ad.items.forEach((it, i) => {
    const where = `overlay item ${i + 1} (${it.type})`;
    if (!it.icon && !it.visual) blocks.push(`${where} is text only - add "icon" or a "visual"`);
    else if (it.visual && NOT_ENOUGH.includes(it.visual.kind) && !it.icon) blocks.push(`${where}: a ${it.visual.kind} alone is still text - add an icon or a real visual`);
    iconOk(it.icon, where);
    if (it.visual) { checkVisual(it.visual, where, it.duration); collectVisualText(it.visual); }
    pushText(it.text, it.sub, it.value, it.label, it.items || []);
  });
}

// ---- motifs
if (!motifs.brand) warns.push(`no motifs.json in ${project} - run brand_motifs.mjs --brand <slug> --write, then hf_init.mjs`);
else if (!motifs.confirmed) warns.push('motifs.json is not confirmed - check props / problemObjects / style against two packshots and a sprite, then set "confirmed": true and re-run hf_init');
else oks.push(`motifs: ${motifs.category}, ${motifs.style}, props ${(motifs.props || []).map((p) => p.shape).join('/')}`);

// ---- claims: every number on screen must be on the site or approved (same rule as gate.mjs)
let siteText = '';
if (brand) {
  const wb = path.join(ROOT, 'brands', brand, 'catalog', 'website-brand.json');
  if (fs.existsSync(wb)) siteText = fs.readFileSync(wb, 'utf8');
  else warns.push(`no website-brand.json for "${brand}" - numbers cannot be checked`);
}
const norm = (s) => s.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ');
const hay = norm(siteText + ' ' + (ad.approvedClaims || []).join(' '));
const hayTight = hay.replace(/\s/g, '');
const allText = texts.join(' | ').replace(/<[^>]+>/g, '');
const nums = [...new Set((allText.match(/\$?\d[\d,.]*(?:\s?-\s?\d[\d,.]*)?\s?(?:%|g\b|mg\b|x\b|\+)?/gi) || []).map((n) => n.trim()))];
for (const n of nums) {
  const core = norm(n).replace(/\s/g, ''), bare = core.replace(/[^\d.,-]/g, '');
  if (!bare || /^\d{1,2}(am|pm)?$/i.test(core) && /\b\d{1,2}\s?(am|pm)\b/i.test(allText)) continue; // clock labels on a chart axis
  const ok = core !== bare ? hayTight.includes(core) : new RegExp(`(^|[^\\d.,])${bare.replace(/[.]/g, '\\.')}([^\\d]|$)`).test(hay);
  if (!ok && siteText) blocks.push(`number "${n}" is on screen but not in the website claims or approvedClaims`);
}
if (siteText && nums.length) oks.push(`${nums.length} on-screen number(s) checked against the site`);

// ---- report
console.log(`\n  mg_check: ${path.basename(file)}\n`);
for (const o of oks) console.log(`  ok     ${o}`);
for (const w of warns) console.log(`  warn   ${w}`);
for (const b of blocks) console.log(`  BLOCK  ${b}`);
console.log(`\n  ${blocks.length ? 'FAIL' : 'PASS'}\n`);
// ---- remember what this ad used, so the brand's next ad leads with something else (after the final render)
if (argv.includes('--record') && !blocks.length && historyFile && Array.isArray(ad.scenes)) {
  const devices = ad.scenes.map((s) => deviceOf(s, s.visuals || []));
  // replaces the entry mg_plan wrote for this ad at planning time (same name) with what was finally rendered
  const nm = path.basename(file, '.json');
  motionHistory.ads = [...(motionHistory.ads || []).filter((a) => a.name !== nm), {name: nm, date: new Date().toISOString().slice(0, 10), stage: 'final', devices, bgStyles: ad.scenes.map((s) => s.bgStyle || (s.type === 'footage' ? 'footage' : 'glow')),
    transitions: ad.scenes.slice(1).map((s) => s.transition?.type || 'cut')}].slice(-10);
  fs.writeFileSync(historyFile, JSON.stringify(motionHistory, null, 2));
  console.log(`  recorded in ${historyFile} (${motionHistory.ads.length} ads remembered)\n`);
}
process.exit(blocks.length ? 1 : 0);

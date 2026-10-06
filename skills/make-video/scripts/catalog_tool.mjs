#!/usr/bin/env node
/**
 * catalog_tool.mjs - the per-brand cache that makes the skill brand-agnostic.
 *
 * MCP tools (Recharm, WebFetch, the browser) can only be called by the model, so the model saves
 * what they return as JSON files and this script does the deterministic parts: folder layout,
 * label-category detection, catalog skeletons, dead-label bookkeeping, image downloads, freshness.
 *
 *   node catalog_tool.mjs init <slug>                       create ~/.claude/make-video/brands/<slug>/
 *   node catalog_tool.mjs status <slug>                     what is cached, how old, what is missing
 *   node catalog_tool.mjs labels <slug> <labels.json>       ingest list_labels output -> labels.json +
 *                                                           catalog skeletons (products, creators, actor-types,
 *                                                           audio-types, scene-types, filters, asset-types)
 *   node catalog_tool.mjs info <slug> <info.json>           ingest get_brand_info output -> brand.json (merged)
 *   node catalog_tool.mjs dead <slug> "<Category>" "<Value>" [...]   mark label values that retrieve nothing
 *   node catalog_tool.mjs set <slug> <catalog-name> <file>  replace a catalog file (e.g. enriched products.json)
 *   node catalog_tool.mjs images <slug> <images.json>       download [{kind, name, url}] into images/<kind>/
 *   node catalog_tool.mjs path <slug>                       print the brand directory
 *
 * The cache root is ~/.claude/make-video (override: MAKE_VIDEO_ROOT). A brand is "fresh" for 30 days;
 * after that, or when list_labels disagrees with labels.json, rebuild.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.env.MAKE_VIDEO_ROOT || path.join(os.homedir(), '.claude', 'make-video');
const FRESH_DAYS = 30;
const [cmd, slug, ...rest] = process.argv.slice(2);

const SUBDIRS = ['catalog', 'catalog/images/products', 'catalog/images/creators', 'catalog/images/scenes',
  'catalog/images/website', 'fonts', 'work'];

// Label categories vary per brand. Detect the ones the skill builds catalogs for by name, so a brand
// that calls it "Talent" or "Models" can still be mapped. The model confirms ambiguous matches.
const KINDS = {
  products: /^(product|products|sku|skus|product name|item|items|flavou?r|flavou?rs|variant|variants)$/i,
  creators: /^(creator|creators|talent|actor name|actors|person|people|model|models|influencer|influencers)$/i,
  'actor-types': /^actor ?types?$|^actor$|^talent type$/i,
  'audio-types': /^audio ?types?$|^audio$|^sound ?types?$/i,
  'scene-types': /^scene ?types?$|^scene$|^shot ?types?$/i,
  'asset-types': /^asset ?types?$|^captions?$|^content ?types?$/i,
};
// Admin/bookkeeping categories: never useful as a search filter.
const FILTER_SKIP = new Set(['batch', 'usage rights', 'recharm']);
// Values the library owners flagged as unusable, e.g. "Taste Test (do not use)".
const BANNED = /do not use|don'?t use|dnu/i;

function dirFor(s) { return path.join(ROOT, 'brands', s); }
function die(msg) { console.error(`  ${msg}`); process.exit(1); }
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, '')); }
function writeJson(p, o) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2)); }
const today = () => new Date().toISOString().slice(0, 10);

if (!cmd || !slug) die('usage: node catalog_tool.mjs <init|status|labels|info|dead|set|images|path> <slug> [args]  (see header)');
const B = dirFor(slug);
const CAT = path.join(B, 'catalog');

function normalizeLabels(raw) {
  // list_labels returns [{category, labels:[...]}], possibly wrapped.
  const arr = Array.isArray(raw) ? raw : raw.labelCategories || raw.categories || raw.result || [];
  return arr.map((c) => ({ category: c.category || c.name, labels: (c.labels || c.values || []).map(String), ...(c.partial ? { partial: true, count: c.count } : {}) }))
    .filter((c) => c.category);
}

if (cmd === 'init') {
  for (const d of SUBDIRS) fs.mkdirSync(path.join(B, d), { recursive: true });
  if (!fs.existsSync(path.join(B, 'brand.json'))) writeJson(path.join(B, 'brand.json'), { slug, createdAt: today() });
  console.log(B);
} else if (cmd === 'path') {
  console.log(B);
} else if (cmd === 'status') {
  if (!fs.existsSync(B)) { console.log(`  no cache for "${slug}" - build it (references/catalog-building.md)`); process.exit(0); }
  const have = (f) => fs.existsSync(path.join(CAT, f));
  const labels = have('labels.json') ? readJson(path.join(CAT, 'labels.json')) : null;
  const age = labels?._snapshot ? Math.floor((Date.now() - Date.parse(labels._snapshot)) / 864e5) : null;
  console.log(`\n  ${slug}  ${B}`);
  console.log(`  labels snapshot: ${labels ? `${labels._snapshot} (${age} days old${age > FRESH_DAYS ? ' - STALE, rebuild' : ''}), ${labels.labelCategories.length} categories` : 'MISSING'}`);
  for (const f of ['products', 'creators', 'actor-types', 'audio-types', 'scene-types', 'asset-types', 'filters', 'website-brand', 'clips', 'raw-videos'])
    console.log(`  ${f.padEnd(14)} ${have(`${f}.json`) ? 'ok' : (labels && f in KINDS && !labels.detected?.[f] ? 'n/a (brand has no such label category)' : 'missing')}`);
  const brand = fs.existsSync(path.join(B, 'brand.json')) ? readJson(path.join(B, 'brand.json')) : {};
  console.log(`  brand.json     ${brand.website ? `website ${brand.website}` : 'no website recorded'}${brand.palette ? ', palette ok' : ', palette missing'}${brand.fonts ? ', fonts ok' : ', fonts missing'}`);
  const count = (d) => (fs.existsSync(path.join(CAT, 'images', d)) ? fs.readdirSync(path.join(CAT, 'images', d)).length : 0);
  console.log(`  images         products ${count('products')}, creators ${count('creators')}, scenes ${count('scenes')}, website ${count('website')}\n`);
} else if (cmd === 'labels') {
  const file = rest[0]; if (!file) die('labels needs the saved list_labels JSON path');
  for (const d of SUBDIRS) fs.mkdirSync(path.join(B, d), { recursive: true });
  const cats = normalizeLabels(readJson(file));
  if (!cats.length) die('no label categories found in that file');
  const prev = fs.existsSync(path.join(CAT, 'labels.json')) ? readJson(path.join(CAT, 'labels.json')) : {};
  // kind -> [category names]. Products can span several categories (Product + Flavor); the rest take one.
  const detected = {};
  for (const [kind, re] of Object.entries(KINDS)) {
    const hits = cats.filter((c) => re.test(c.category.trim())).map((c) => c.category);
    if (hits.length) detected[kind] = kind === 'products' ? hits : hits.slice(0, 1);
  }
  const bannedValues = {};
  for (const c of cats) { const b = c.labels.filter((l) => BANNED.test(l)); if (b.length) bannedValues[c.category] = b; }
  writeJson(path.join(CAT, 'labels.json'), {
    brand: slug, _snapshot: today(), labelCategories: cats, detected, bannedValues, deadValues: prev.deadValues || {},
  });
  // Skeletons: only create if absent so enriched catalogs survive a refresh; always report new/removed labels.
  const skeleton = (name, categories, extra = {}) => {
    const p = path.join(CAT, `${name}.json`);
    const labels = categories.flatMap((cn) => cats.find((c) => c.category === cn).labels.filter((l) => !BANNED.test(l)).map((l) => ({ cn, l })));
    const old = fs.existsSync(p) ? readJson(p) : null;
    const key = (cn, l) => `${cn}::${l}`;
    const known = new Set((old?.entries || []).map((e) => key(e.category, e.label)));
    const entries = [...(old?.entries || [])];
    const added = [];
    for (const { cn, l } of labels) if (!known.has(key(cn, l))) { entries.push({ category: cn, label: l, ...extra }); added.push(l); }
    const present = new Set(labels.map(({ cn, l }) => key(cn, l)));
    const removed = [...known].filter((k) => !present.has(k)).map((k) => k.split('::')[1]);
    writeJson(p, { brand: slug, categories, updatedAt: today(), entries });
    return { added, removed, total: labels.length };
  };
  console.log(`\n  ${slug}: ${cats.length} label categories ingested\n`);
  for (const [kind, categoryList] of Object.entries(detected)) {
    const category = categoryList.join(' + ');
    const r = skeleton(kind, categoryList, kind === 'creators' ? { liveInSearch: null, talksToCamera: null, look: null, poster: null }
      : kind === 'products' ? { liveInSearch: null, websiteProduct: null, price: null, claims: [], packshots: [] }
      : kind === 'actor-types' || kind === 'audio-types' ? { clipCount: null, rule: null }
      : { liveInSearch: null, role: null });
    console.log(`  ${kind.padEnd(12)} <- "${category}"  ${r.total} labels${r.added.length ? `, ${r.added.length} new` : ''}${r.removed.length ? `, ${r.removed.length} no longer in library: ${r.removed.join(', ')}` : ''}`);
  }
  for (const kind of Object.keys(KINDS)) if (!detected[kind]) console.log(`  ${kind.padEnd(12)} (no matching category - skip this catalog; confirm by eye against the list below)`);
  const claimed = new Set(Object.values(detected).flat());
  const filters = cats.filter((c) => !claimed.has(c.category) && !FILTER_SKIP.has(c.category.toLowerCase()));
  writeJson(path.join(CAT, 'filters.json'), {
    brand: slug, updatedAt: today(),
    note: 'Every other label category: what it filters on. Fill "role" (what the category means) and tag dead/thin values via catalog_tool.mjs dead.',
    categories: filters.map((c) => ({ category: c.category, role: null, labels: c.labels.filter((l) => !BANNED.test(l)) })),
    skipped: cats.filter((c) => FILTER_SKIP.has(c.category.toLowerCase())).map((c) => c.category),
  });
  const nb = Object.values(bannedValues).flat().length;
  if (nb) console.log(`  banned       ${nb} values are tagged "do not use" and are excluded from catalogs (labels.json -> bannedValues)`);
  console.log(`  filters      <- ${filters.length} other categories: ${filters.map((c) => c.category).join(', ') || '(none)'}`);
  console.log('\n  All categories:');
  for (const c of cats) console.log(`    ${c.category}  (${c.labels.length})`);
  console.log('\n  Next: enrich each catalog (references/catalog-building.md), mark dead labels, then `status`.\n');
} else if (cmd === 'info') {
  const file = rest[0]; if (!file) die('info needs the saved get_brand_info JSON path');
  const p = path.join(B, 'brand.json');
  const cur = fs.existsSync(p) ? readJson(p) : { slug };
  const info = readJson(file);
  const website = info.website || info.url || info.websiteUrl;
  writeJson(p, { ...cur, ...info, slug, website: website || cur.website, infoFetchedAt: today() });
  console.log(`  brand.json updated (${info.prettyName || info.displayName || info.name || slug}${website ? `, ${website}` : ', NO website in get_brand_info - ask the user'})`);
} else if (cmd === 'dead') {
  const [category, ...vals] = rest;
  if (!category || !vals.length) die('usage: dead <slug> "<Category>" "<Value>" [...]');
  const p = path.join(CAT, 'labels.json');
  const L = readJson(p);
  const cat = L.labelCategories.find((c) => c.category === category);
  if (!cat) die(`no category "${category}"`);
  L.deadValues[category] = [...new Set([...(L.deadValues[category] || []), ...vals.filter((v) => cat.labels.includes(v))])];
  writeJson(p, L);
  console.log(`  ${category}: dead = ${L.deadValues[category].join(', ')}`);
} else if (cmd === 'set') {
  const [name, file] = rest; if (!name || !file) die('usage: set <slug> <catalog-name> <file>');
  writeJson(path.join(CAT, `${name}.json`), readJson(file));
  console.log(`  catalog/${name}.json written`);
} else if (cmd === 'images') {
  const file = rest[0]; if (!file) die('images needs a JSON path: [{kind: products|creators|scenes|website, name, url}]');
  const items = readJson(file);
  let ok = 0;
  for (const it of items) {
    try {
      const res = await fetch(it.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get('content-type') || '';
      const ext = (ct.includes('png') ? '.png' : ct.includes('webp') ? '.webp' : ct.includes('svg') ? '.svg' : ct.includes('gif') ? '.gif' : '.jpg');
      const base = String(it.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'image';
      const out = path.join(CAT, 'images', it.kind || 'website', base + (path.extname(base) ? '' : ext));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
      console.log(`  ok   ${it.kind}/${path.basename(out)}`);
      ok++;
    } catch (e) { console.log(`  FAIL ${it.name}: ${e.message}`); }
  }
  console.log(`  ${ok}/${items.length} saved`);
} else die(`unknown command "${cmd}"`);

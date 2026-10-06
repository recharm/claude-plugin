#!/usr/bin/env node
/**
 * check_filters.mjs - validate a search_clips_visually filter map against the
 * brand's label snapshot BEFORE searching, so an empty result can be read
 * correctly.
 *
 *   node check_filters.mjs --brand <slug> '{"Actor Type":["Actor A-roll"],"Product":["<label>"]}'
 *   (--brand defaults to $BRAND; the snapshot is <brand cache>/catalog/labels.json, written by
 *    catalog_tool.mjs labels)
 *   node check_filters.mjs --file filter.json      # PowerShell-safe
 *   node check_filters.mjs --list                  # print categories and values
 *   node check_filters.mjs --list "Problems"       # one category
 *
 * Catches:
 *   - categories that do not exist, or are mis-cased
 *   - values that are not labels, with a case-insensitive "did you mean"
 *   - DEAD values: listed by list_labels but retrieving nothing in search
 *     (labels.json -> deadValues). An empty search on them means "no footage".
 *   - Batch filters (they narrow to one shoot, which is rarely what you want)
 *   - too many categories at once (AND across categories starves results)
 *
 * Exit code 1 on errors, 0 otherwise (warnings do not fail).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const bi = argv.indexOf('--brand');
const BRAND = bi !== -1 ? argv.splice(bi, 2)[1] : process.env.BRAND;
if (!BRAND) { console.error('pass --brand <recharm slug> (or set BRAND)'); process.exit(2); }
const ROOT = process.env.MAKE_VIDEO_ROOT || path.join(os.homedir(), '.claude', 'make-video');
const CATALOG = path.join(ROOT, 'brands', BRAND, 'catalog');
if (!fs.existsSync(path.join(CATALOG, 'labels.json'))) {
  console.error(`no label snapshot for "${BRAND}" - run the catalog build first (references/catalog-building.md)`);
  process.exit(2);
}
const LABELS = JSON.parse(fs.readFileSync(path.join(CATALOG, 'labels.json'), 'utf8'));
const DEAD = LABELS.deadValues || {};
const BANNED = LABELS.bannedValues || {};

const PARTIAL = new Set(LABELS.labelCategories.filter((c) => c.partial).map((c) => c.category));
const byCat = new Map(LABELS.labelCategories.map((c) => [c.category, c.labels]));

const SYNONYMS = {
  'actor': 'Actor Type',
  'audio': 'Audio Type',
  'creators': 'Creator',
  'products': 'Product',
  'scene': 'Scene Type',
  'scenetype': 'Scene Type',
  'benefit': 'Benefits',
  'feature': 'Features',
  'problem': 'Problems',
  'caption': 'Captions',
  'filters': 'any of the label categories - see the brand cache catalog/filters.json',
};

const args = argv;
if (args[0] === '--list') {
  const only = args[1];
  console.log(`\n  Categories in ${BRAND}${only ? ` (${only})` : ''}:\n`);
  for (const [cat, vals] of byCat) {
    if (only && cat.toLowerCase() !== only.toLowerCase()) continue;
    console.log(`  ${cat}`);
    if (cat === 'Batch' && !only) { console.log(`       (${vals.length} batch values - pass "--list Batch" to see them)`); continue; }
    for (const v of vals) {
      const dead = (DEAD[cat] || []).includes(v);
      console.log(`    ${dead ? 'dead ' : '     '}${v}`);
    }
  }
  console.log(`\n  Snapshot ${LABELS._snapshot || '?'}. Re-read with list_labels("${BRAND}") each run.\n`);
  process.exit(0);
}

let raw;
const fi = args.indexOf('--file');
if (fi !== -1) raw = fs.readFileSync(args[fi + 1], 'utf8');
else raw = args.join(' ');
if (!raw.trim()) {
  console.error('usage: node check_filters.mjs \'{"Scene Type":["Testimonial"]}\'  |  --file f.json  |  --list [category]');
  process.exit(2);
}

let filters;
try {
  filters = JSON.parse(raw.replace(/^﻿/, ''));
} catch (e) {
  console.error(`  not valid JSON: ${e.message}`);
  console.error('  (PowerShell strips inner quotes - write the map to a file and pass --file)');
  process.exit(2);
}

const errors = [];
const warnings = [];

const cats = Object.keys(filters);
if (cats.length > 3) {
  warnings.push(`${cats.length} categories are ANDed together - results thin out fast. ` +
    'Prefer 1-2 categories and put the rest of the idea in the query text.');
}

for (const [key, vals] of Object.entries(filters)) {
  if (!Array.isArray(vals)) { errors.push(`"${key}" must map to an array of strings`); continue; }
  const known = byCat.get(key);
  if (!known) {
    const ci = [...byCat.keys()].find((k) => k.toLowerCase() === key.toLowerCase());
    if (ci) { errors.push(`category "${key}" is mis-cased - use "${ci}"`); continue; }
    const sub = SYNONYMS[key.toLowerCase().replace(/\s+/g, '')] || SYNONYMS[key.toLowerCase()];
    errors.push(`category "${key}" does not exist on ${BRAND}${sub ? ` - did you mean "${sub}"?` : ''}`);
    continue;
  }
  if (key === 'Batch') {
    warnings.push('"Batch" narrows to single shoots - only useful to trace a shoot. ' +
      'Filters cannot EXCLUDE, so "Don\'t Use" batches must be screened on the picks instead (see library.md).');
  }
  for (const v of vals) {
    if (!known.includes(v)) {
      const ci = known.find((k) => k.toLowerCase() === String(v).toLowerCase());
      if (!ci && PARTIAL.has(key)) { warnings.push(`"${key}: ${v}" is not in the cached partial list for this category - verify it against list_labels`); continue; }
      errors.push(ci ? `"${key}: ${v}" is mis-cased - use "${ci}"` :
        `"${key}: ${v}" is not a label. Values: ${known.slice(0, 40).join(', ')}${known.length > 40 ? ' ...' : ''}`);
      continue;
    }
    if ((BANNED[key] || []).includes(v)) {
      errors.push(`"${key}: ${v}" is tagged "do not use" by the library owners - pick another label`);
      continue;
    }
    if ((DEAD[key] || []).includes(v)) {
      warnings.push(`"${key}: ${v}" is listed by list_labels but retrieves NOTHING in search. ` +
        'An empty result means there is no such footage, not a bad query. See references/library.md -> "Dead labels".');
    }
  }
  const live = vals.filter((v) => known.includes(v) && !(DEAD[key] || []).includes(v));
  if (vals.length && !live.length && vals.every((v) => known.includes(v))) {
    warnings.push(`every "${key}" value here is dead - this search will return nothing.`);
  }
}

for (const w of warnings) console.log(`  warn   ${w}`);
for (const e of errors) console.log(`  ERROR  ${e}`);
if (!errors.length && !warnings.length) console.log('  ok     filters are valid and retrievable');
process.exit(errors.length ? 1 : 0);

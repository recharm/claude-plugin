#!/usr/bin/env node
/**
 * mg_init.mjs - set up (or refresh) the brand's Remotion project from assets/remotion-template.
 *
 *   node mg_init.mjs --brand <slug> --aspect 9:16|16:9 [--dir <path>] [--no-install]
 *
 * The project lives in the brand cache (<root>/brands/<slug>/remotion) so `npm install` runs once per
 * brand, not once per ad. Each run refreshes the template code and writes theme.json from brand.json:
 * palette, fonts (brand files from the cache's fonts/, else the bundled Poppins), the logo EXACTLY as
 * published (copied, never modified), product packshots, and the site URL. ads/ and node_modules/ are kept.
 *
 * Then: write ads/<name>.json (shape: ad.json) and render
 *   npx remotion render src/index.ts Ad out/<name>.mp4 --props=ads/<name>.json --crf=16
 *   npx remotion render src/index.ts Overlay out/<name>-overlay.mov --props=ads/<name>-overlay.json \
 *       --image-format=png --pixel-format=yuva444p10le --codec=prores --prores-profile=4444
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const brand = opt('--brand');
const aspect = opt('--aspect', '9:16');
if (!brand || !['9:16', '16:9'].includes(aspect)) {
  console.error('usage: node mg_init.mjs --brand <slug> --aspect 9:16|16:9 [--dir <path>] [--no-install]');
  process.exit(2);
}
const ROOT = process.env.MAKE_VIDEO_ROOT || path.join(os.homedir(), '.claude', 'make-video');
const B = path.join(ROOT, 'brands', brand);
const dir = path.resolve(opt('--dir', path.join(B, 'remotion')));
const TPL = path.resolve(HERE, '..', 'assets', 'remotion-template');
const FONTS = path.resolve(HERE, '..', 'assets', 'fonts');

const brandJson = path.join(B, 'brand.json');
if (!fs.existsSync(brandJson)) { console.error(`no brand cache for "${brand}" - build it first (catalog_tool.mjs)`); process.exit(1); }
const bj = JSON.parse(fs.readFileSync(brandJson, 'utf8'));

// ---- copy template code (keep node_modules, ads/, out/)
const copyDir = (src, dst) => {
  fs.mkdirSync(dst, {recursive: true});
  for (const e of fs.readdirSync(src, {withFileTypes: true})) {
    if (['node_modules', 'out', 'ads'].includes(e.name)) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    // src/custom/ holds this brand's bespoke scenes and their registry - seed it once, never overwrite it.
    if (e.isDirectory()) copyDir(s, d);
    else if (!(path.basename(path.dirname(d)) === 'custom' && fs.existsSync(d))) fs.copyFileSync(s, d);
  }
};
copyDir(TPL, dir);
for (const d of ['public/fonts', 'public/products', 'ads', 'out']) fs.mkdirSync(path.join(dir, d), {recursive: true});

// ---- palette
const hex = (k, d) => {
  const v = bj.palette?.[k];
  const h = typeof v === 'string' ? v : v?.hex || v?.value;
  return /^#[0-9a-f]{6}$/i.test(h || '') ? h : d;
};
const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const primary = hex('primary', '#222222');
const color = {
  primary,
  secondary: hex('secondary', primary),
  accent: hex('accent', '#FFD54A'),
  ground: hex('ground', '#FFFFFF'),
  text: hex('text', '#111111'),
  onPrimary: lum(primary) > 0.6 ? '#111111' : '#FFFFFF',
  muted: '#C9C9D6',
  dark: hex('footer', '#111111'),
};

// ---- fonts: brand files first (cache fonts/), else bundled Poppins
const pub = (p) => path.join(dir, 'public', p);
const files = [];
const brandFonts = path.join(B, 'fonts');
const heading = bj.fonts?.heading || 'Poppins';
const body = bj.fonts?.body || heading;
let usedHeading = heading, usedBody = body;
const brandFontFiles = fs.existsSync(brandFonts) ? fs.readdirSync(brandFonts).filter((f) => /\.(ttf|otf|woff2?)$/i.test(f)) : [];
for (const f of brandFontFiles) {
  fs.copyFileSync(path.join(brandFonts, f), pub(`fonts/${f}`));
  const fam = f.toLowerCase().includes(body.toLowerCase().replace(/\s/g, '')) ? body : heading;
  files.push({family: fam, file: f, weight: /bold|black|heavy|800|900/i.test(f) ? 700 : 400});
}
for (const f of ['Poppins-Regular.ttf', 'Poppins-Bold.ttf']) {
  fs.copyFileSync(path.join(FONTS, f), pub(`fonts/${f}`));
  files.push({family: 'Poppins', file: f, weight: f.includes('Bold') ? 700 : 400});
}
const haveBrandFile = (fam) => files.some((x) => x.family === fam && fam !== 'Poppins');
if (heading !== 'Poppins' && !haveBrandFile(heading)) { console.log(`  note   no licensed file for "${heading}" in ${brandFonts} - headings use Poppins`); usedHeading = 'Poppins'; }
if (body !== 'Poppins' && !haveBrandFile(body)) { usedBody = 'Poppins'; }

// ---- logo: copied exactly as published
const web = path.join(B, 'catalog', 'images', 'website');
const logos = fs.existsSync(web) ? fs.readdirSync(web).filter((f) => /^logo/i.test(f)) : [];
let logo = '';
if (logos.length) {
  const pick = logos.find((f) => /white/i.test(f) && lum(primary) < 0.6) || logos[0];
  logo = `logo${path.extname(pick)}`;
  fs.copyFileSync(path.join(web, pick), pub(logo));
  // An inline-SVG logo the site colours with CSS has no fill of its own and renders black elsewhere. Reproduce the
  // site's own colour (brand.json logo.cssFill) - the published look - by adding a style rule; the shapes are untouched.
  const svg = path.extname(pick).toLowerCase() === '.svg' ? fs.readFileSync(path.join(web, pick), 'utf8') : null;
  const cssFill = bj.logo?.cssFill;
  if (svg && cssFill && !/fill=|fill\s*:/i.test(svg)) {
    fs.writeFileSync(pub(logo), svg.replace(/<svg\b([^>]*)>/i, (m) => `${m}<style>*{fill:${cssFill}}</style>`));
    console.log(`  logo   shown in the site's CSS colour ${cssFill} (the SVG has no fill of its own)`);
  }
} else {
  console.log('  note   no logo in the brand cache - end cards will show the URL only');
}

// ---- packshots
const prod = path.join(B, 'catalog', 'images', 'products');
const packshots = fs.existsSync(prod) ? fs.readdirSync(prod) : [];
for (const f of packshots) fs.copyFileSync(path.join(prod, f), pub(`products/${f}`));

let url = '';
try { url = new URL(bj.website).hostname.replace(/^www\./, ''); } catch { url = bj.website || ''; }

const theme = {
  _about: `Written by mg_init.mjs from ${brandJson} on ${new Date().toISOString().slice(0, 10)} - edit brand.json, not this file.`,
  aspect, url, logo,
  endCardText: 'onPrimary',
  color,
  font: {heading: usedHeading, body: usedBody, files},
};
fs.writeFileSync(path.join(dir, 'theme.json'), JSON.stringify(theme, null, 2));

// ---- motifs: what the animations are made of (brand_motifs.mjs, from the website + library)
const motifsSrc = path.join(B, 'motifs.json');
let motifs = null;
if (fs.existsSync(motifsSrc)) {
  motifs = JSON.parse(fs.readFileSync(motifsSrc, 'utf8'));
  // Packshot paths in motifs are relative to public/ - keep only the ones that were copied.
  motifs.packshots = (motifs.packshots || []).filter((p) => fs.existsSync(pub(p)));
  fs.writeFileSync(path.join(dir, 'motifs.json'), JSON.stringify(motifs, null, 2));
} else {
  console.log(`  WARN   no motifs.json for "${brand}" - animations fall back to generic dots. Run:\n         node scripts/brand_motifs.mjs --brand ${brand} --write`);
}

console.log(`\n  ${bj.prettyName || brand} motion project: ${dir}`);
console.log(`  aspect ${aspect} - primary ${color.primary}, secondary ${color.secondary}, accent ${color.accent}, text on primary ${color.onPrimary}`);
console.log(`  fonts  ${usedHeading}${usedBody !== usedHeading ? ` / ${usedBody}` : ''} (${files.length} files)`);
console.log(`  logo   ${logo ? `public/${logo} (as published)` : 'none'}   packshots ${packshots.length} in public/products/`);
if (motifs) console.log(`  motifs ${motifs.category}, ${motifs.style}, props ${(motifs.props || []).map((p) => p.shape).join('/')}, problem ${(motifs.problemObjects || []).map((p) => p.shape).join('/')}, ${Object.keys(motifs.icons || {}).length} claim icons${motifs.confirmed ? '' : '  (NOT confirmed yet)'}`);

// ---- install once
if (!argv.includes('--no-install') && !fs.existsSync(path.join(dir, 'node_modules', 'remotion'))) {
  console.log('\n  installing Remotion (first time for this brand, ~1-3 min)...');
  const r = spawnSync(process.platform === 'win32' ? 'npm install --no-audit --no-fund --loglevel=error' : 'npm', process.platform === 'win32' ? [] : ['install', '--no-audit', '--no-fund', '--loglevel=error'], {cwd: dir, stdio: 'inherit', shell: process.platform === 'win32'});
  if (r.status !== 0) { console.error('  npm install failed'); process.exit(1); }
}
console.log(`\n  next: write ${path.join(dir, 'ads', '<name>.json')} (shape: ad.json), then`);
console.log(`        cd "${dir}" && npx remotion render src/index.ts Ad out/<name>.mp4 --props=ads/<name>.json\n`);

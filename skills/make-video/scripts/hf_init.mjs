#!/usr/bin/env node
/**
 * hf_init.mjs - set up (or refresh) the brand's HyperFrames project.
 *
 *   node hf_init.mjs --brand <slug> --aspect 9:16|16:9 [--dir <path>] [--no-install]
 *
 * The project lives in the brand cache (<root>/brands/<slug>/hyperframes). Each run refreshes the runtime
 * (assets/vendor/mv-runtime.js - the animation library - and GSAP) and writes theme.json from brand.json: palette,
 * fonts (brand files from the cache's fonts/, else the bundled Poppins), the logo EXACTLY as published (copied, never
 * modified), product packshots, and the site URL. ads/, out/, assets/clips, assets/cutouts and assets/custom are kept.
 * HyperFrames itself (pinned) is installed once for every brand in <root>/tools/hyperframes.
 *
 * Then: write ads/<name>.json (shape: ad.json) and build it
 *   node hf_build.mjs <project>/ads/<name>.json --out <project>/out/<name>.mp4 [--draft] [--blur]
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
  console.error('usage: node hf_init.mjs --brand <slug> --aspect 9:16|16:9 [--dir <path>] [--no-install]');
  process.exit(2);
}
const ROOT = process.env.MAKE_VIDEO_ROOT || path.join(os.homedir(), '.claude', 'make-video');
const B = path.join(ROOT, 'brands', brand);
const dir = path.resolve(opt('--dir', path.join(B, 'hyperframes')));
const RUNTIME = path.resolve(HERE, '..', 'assets', 'hyperframes-runtime', 'dist', 'mv-runtime.js');
const SCAFFOLD = path.resolve(HERE, '..', 'assets', 'hyperframes-project');
const FONTS = path.resolve(HERE, '..', 'assets', 'fonts');

const brandJson = path.join(B, 'brand.json');
if (!fs.existsSync(brandJson)) { console.error(`no brand cache for "${brand}" - build it first (catalog_tool.mjs)`); process.exit(1); }
const bj = JSON.parse(fs.readFileSync(brandJson, 'utf8'));

// ---- HyperFrames (pinned) and GSAP, once for every brand
const TOOLS = path.join(ROOT, 'tools', 'hyperframes');
const PIN = {hyperframes: '0.8.185', gsap: '3.14.2'};
const toolsReady = () => fs.existsSync(path.join(TOOLS, 'node_modules', 'hyperframes', 'package.json')) && fs.existsSync(path.join(TOOLS, 'node_modules', 'gsap', 'dist', 'gsap.min.js'))
  && JSON.parse(fs.readFileSync(path.join(TOOLS, 'node_modules', 'hyperframes', 'package.json'), 'utf8')).version === PIN.hyperframes;
if (!argv.includes('--no-install') && !toolsReady()) {
  fs.mkdirSync(TOOLS, {recursive: true});
  fs.writeFileSync(path.join(TOOLS, 'package.json'), JSON.stringify({name: 'make-video-hyperframes-tools', private: true, dependencies: PIN}, null, 2));
  console.log(`
  installing HyperFrames ${PIN.hyperframes} + GSAP ${PIN.gsap} in ${TOOLS} (first time only, ~1 min)...`);
  const win = process.platform === 'win32';
  const r = spawnSync(win ? 'npm install --no-audit --no-fund --loglevel=error' : 'npm', win ? [] : ['install', '--no-audit', '--no-fund', '--loglevel=error'], {cwd: TOOLS, stdio: 'inherit', shell: win});
  if (r.status !== 0) { console.error('  npm install failed - see setup.md (HyperFrames)'); process.exit(1); }
}
if (!fs.existsSync(RUNTIME)) { console.error(`  the runtime is missing (${RUNTIME}) - run: node assets/hyperframes-runtime/build.mjs`); process.exit(1); }

// ---- project folders; the runtime and GSAP are refreshed every run, the scaffold files only seeded
for (const d of ['assets/fonts', 'assets/products', 'assets/clips', 'assets/cutouts', 'assets/custom', 'assets/vendor', 'ads', 'out']) fs.mkdirSync(path.join(dir, d), {recursive: true});
fs.copyFileSync(RUNTIME, path.join(dir, 'assets', 'vendor', 'mv-runtime.js'));
const gsapFile = path.join(TOOLS, 'node_modules', 'gsap', 'dist', 'gsap.min.js');
if (fs.existsSync(gsapFile)) fs.copyFileSync(gsapFile, path.join(dir, 'assets', 'vendor', 'gsap.min.js'));
else console.log('  WARN   GSAP is not installed yet - run without --no-install once');
for (const f of ['ad.json', 'CREDITS.md']) if (!fs.existsSync(path.join(dir, f))) fs.copyFileSync(path.join(SCAFFOLD, f), path.join(dir, f));

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
const pub = (p) => path.join(dir, 'assets', p);
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
  _about: `Written by hf_init.mjs from ${brandJson} on ${new Date().toISOString().slice(0, 10)} - edit brand.json, not this file.`,
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
  // Packshot paths in motifs are relative to assets/ - keep only the ones that were copied.
  motifs.packshots = (motifs.packshots || []).filter((p) => fs.existsSync(pub(p)));
  fs.writeFileSync(path.join(dir, 'motifs.json'), JSON.stringify(motifs, null, 2));
} else {
  console.log(`  WARN   no motifs.json for "${brand}" - animations fall back to generic dots. Run:\n         node scripts/brand_motifs.mjs --brand ${brand} --write`);
}

console.log(`\n  ${bj.prettyName || brand} motion project: ${dir}`);
console.log(`  aspect ${aspect} - primary ${color.primary}, secondary ${color.secondary}, accent ${color.accent}, text on primary ${color.onPrimary}`);
console.log(`  fonts  ${usedHeading}${usedBody !== usedHeading ? ` / ${usedBody}` : ''} (${files.length} files)`);
console.log(`  logo   ${logo ? `assets/${logo} (as published)` : 'none'}   packshots ${packshots.length} in assets/products/`);
if (motifs) console.log(`  motifs ${motifs.category}, ${motifs.style}, props ${(motifs.props || []).map((p) => p.shape).join('/')}, problem ${(motifs.problemObjects || []).map((p) => p.shape).join('/')}, ${Object.keys(motifs.icons || {}).length} claim icons${motifs.confirmed ? '' : '  (NOT confirmed yet)'}`);

console.log(`
  next: write ${path.join(dir, 'ads', '<name>.json')} (shape: ad.json), check it with mg_check.mjs, then`);
console.log(`        node hf_build.mjs "${path.join(dir, 'ads', '<name>.json')}" --out "${path.join(dir, 'out', '<name>.mp4')}" --draft
`);

#!/usr/bin/env node
/**
 * harvest_site.mjs - pull the facts a brand's website publishes, fast, before reading it in the browser.
 *
 *   node harvest_site.mjs <https://brand.com> --brand <slug> [--images 8] [--product "frosted"] [--write]
 *   (--product puts that product's packshots first; an inline-SVG logo is saved byte-for-byte with --write)
 *
 * 1. Products: Shopify stores publish /products.json - every product, variant, price and image in one request.
 *    Writes catalog/site-products.json and (with --images) downloads the first image of up to N products into
 *    catalog/images/products/. Not Shopify? It says so - use the browser for the product pages.
 * 2. Look: from the homepage HTML and its stylesheets - CSS colour variables and the most-used hex colours,
 *    font families (and whether they come from Google Fonts), logo candidates (img/svg with "logo"), og:image,
 *    title and description. Writes catalog/site-harvest.json.
 *
 * Adapted from the ideas in leosssvip-dot/remotion-ad-video-skill (ecommerce harvester; stop rather than invent)
 * and norahe0304-art/30x-video (brand report with evidence) - both MIT. This is a first pass with evidence, not
 * the final word: claims must still be read VERBATIM in the browser (brand-assets.md), and the palette roles
 * (primary/secondary/accent) are your call from what's here. It never modifies a logo - candidates are URLs only.
 * Polite: a handful of requests, a normal user agent, no crawling beyond the homepage and its stylesheets.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const site = argv.find((a) => /^https?:\/\//.test(a));
const brand = opt('--brand');
const nImages = Number(opt('--images', '0'));
const write = argv.includes('--write');
if (!site || !brand) { console.error('usage: node harvest_site.mjs <https://brand.com> --brand <slug> [--images 8] [--write]'); process.exit(2); }
const ROOT = process.env.MAKE_VIDEO_ROOT || path.join(os.homedir(), '.claude', 'make-video');
const CAT = path.join(ROOT, 'brands', brand, 'catalog');
const UA = {'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'};
const origin = new URL(site).origin;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (url, type = 'text', tries = 3) => {
  try {
    let r;
    for (let k = 0; k < tries; k++) {
      r = await fetch(url, {headers: UA, redirect: 'follow'});
      if (r.status !== 429 && r.status !== 503) break;
      await sleep(2000 * (k + 1) ** 2);   // 2s, 8s - be polite to a rate-limited store
    }
    if (!r.ok) return {status: r.status};
    return {status: r.status, body: type === 'json' ? await r.json() : type === 'buf' ? Buffer.from(await r.arrayBuffer()) : await r.text(), ct: r.headers.get('content-type') || ''};
  } catch (e) { return {status: 0, error: e.message}; }
};

// ---------------------------------------------------------------- products
const products = [];
let shopify = false;
let productsStatus = null;
const productFirst = (opt('--product', '') || '').toLowerCase();
for (let page = 1; page <= 4; page++) {
  const r = await get(`${origin}/products.json?limit=250&page=${page}`, 'json');
  productsStatus = r.status;
  if (r.status !== 200 || !Array.isArray(r.body?.products)) break;
  shopify = true;
  for (const p of r.body.products) {
    const prices = (p.variants || []).map((v) => Number(v.price)).filter(Number.isFinite);
    products.push({
      title: p.title, handle: p.handle, url: `${origin}/products/${p.handle}`, type: p.product_type || '',
      tags: p.tags || [], price: prices.length ? `${Math.min(...prices)}${Math.max(...prices) !== Math.min(...prices) ? `-${Math.max(...prices)}` : ''}` : null,
      variants: (p.variants || []).map((v) => v.title).filter((t) => t && t !== 'Default Title').slice(0, 12),
      image: p.images?.[0]?.src || null, available: (p.variants || []).some((v) => v.available !== false),
    });
  }
  if (r.body.products.length < 250) break;
}

// ---------------------------------------------------------------- look
const home = await get(origin);
const html = home.body || '';
const attr = (re) => (html.match(re) || [])[1] || null;
const title = attr(/<title[^>]*>([^<]*)<\/title>/i);
const description = attr(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i) || attr(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
const ogImage = attr(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)/i);
const cssLinks = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)/gi)].map((m) => new URL(m[1].replace(/&amp;/g, '&'), origin).href).slice(0, 6);
let css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
for (const href of cssLinks.filter((h) => !/fonts\.googleapis/.test(h))) { const r = await get(href); if (r.body) css += '\n' + r.body; }

const vars = {};
for (const m of css.matchAll(/--([\w-]*(?:color|colour|primary|secondary|accent|brand|bg|background|text)[\w-]*)\s*:\s*(#[0-9a-f]{3,8}\b|rgba?\([^)]+\))/gi)) {
  if (!vars[m[1]]) vars[m[1]] = m[2];
}
const hexCount = {};
for (const m of css.matchAll(/#([0-9a-f]{6})\b/gi)) { const h = `#${m[1].toUpperCase()}`; hexCount[h] = (hexCount[h] || 0) + 1; }
const topHex = Object.entries(hexCount).sort((a, b) => b[1] - a[1]).filter(([h]) => !['#FFFFFF', '#000000'].includes(h)).slice(0, 10).map(([h, n]) => ({hex: h, uses: n}));
const fontFams = {};
for (const m of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
  const fam = m[1].split(',')[0].replace(/!important/i, '').replace(/["'“”‘’]/g, '').trim();
  // Skip generic families, CSS variables and icon fonts (widgets ship their own).
  if (fam && !/^(inherit|initial|unset|var\(|sans-serif|serif|monospace|system-ui|-apple-system)/i.test(fam) && !/icon|awesome|glyph|swiper/i.test(fam)) {
    fontFams[fam] = (fontFams[fam] || 0) + 1;
  }
}
const googleFonts = [...html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"']+)/g)].flatMap((m) => [...m[1].matchAll(/family=([^&:]+)/g)].map((f) => decodeURIComponent(f[1]).replace(/\+/g, ' ')));
const fonts = Object.entries(fontFams).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([family, uses]) => ({family, uses, google: googleFonts.some((g) => g.toLowerCase() === family.toLowerCase())}));
const logos = [...html.matchAll(/<img[^>]+>/gi)].map((m) => m[0]).filter((t) => /logo/i.test(t)).map((t) => ({
  src: (t.match(/src=["']([^"']+)/i) || [])[1], alt: (t.match(/alt=["']([^"']*)/i) || [])[1] || '',
})).filter((l) => l.src).map((l) => ({...l, src: new URL(l.src.replace(/^\/\//, 'https://'), origin).href})).slice(0, 5);
const inlineSvgLogo = /<svg[^>]*(class|aria-label|id)=["'][^"']*logo[^"']*["']/i.test(html);
// The logo is often an inline SVG inside the home link in the header: take the first <svg> in an <a href="/">
// (or one whose class/id/label says logo), byte-for-byte, and the CSS fill the site paints it with.
let logoSvg = null, logoFill = null;
{
  const homeLinks = [...html.matchAll(/<a\b[^>]*href=["'](?:\/|https?:\/\/[^"'\/]+\/?)["'][^>]*>([\s\S]{0,20000}?)<\/a>/gi)].map((m) => m[1]);
  const fromHome = homeLinks.map((h) => (h.match(/<svg\b[\s\S]*?<\/svg>/i) || [])[0]).find(Boolean);
  const labelled = (html.match(/<svg\b[^>]*(?:class|aria-label|id)=["'][^"']*logo[^"']*["'][\s\S]*?<\/svg>/i) || [])[0];
  logoSvg = labelled || fromHome || null;
  if (logoSvg) {
    const classes = [...new Set([...logoSvg.matchAll(/class=["']([^"']+)["']/gi)].flatMap((m) => m[1].split(/\s+/)))];
    for (const c of classes) {
      const m = css.match(new RegExp(`\\.${c.replace(/[^\w-]/g, '')}[^{]*\\{[^}]*?fill\\s*:\\s*(#[0-9a-f]{3,8})`, 'i'));
      if (m) { logoFill = m[1]; break; }
    }
  }
}

const harvest = {site: origin, harvestedAt: new Date().toISOString().slice(0, 10), shopify, productCount: products.length,
  title, description, ogImage, cssVariables: vars, topColours: topHex, fonts, googleFonts: [...new Set(googleFonts)],
  logoCandidates: logos, inlineSvgLogo, inlineLogoSaved: Boolean(logoSvg), logoCssFill: logoFill, homepageStatus: home.status,
  productsStatus};

console.log(`\n  ${origin}  (homepage HTTP ${home.status})`);
console.log(`  products  ${shopify ? `${products.length} from /products.json`
  : productsStatus === 429 ? 'BLOCKED (HTTP 429, rate-limited even after retries) - read the product pages in the browser'
    : 'not a Shopify store (or products.json closed) - read the product pages in the browser'}`);
for (const p of products.slice(0, 12)) console.log(`    - ${p.title}${p.price ? `  $${p.price}` : ''}${p.variants.length ? `  [${p.variants.slice(0, 4).join(', ')}${p.variants.length > 4 ? ', ...' : ''}]` : ''}${p.available ? '' : '  (sold out)'}`);
if (products.length > 12) console.log(`    ... ${products.length - 12} more`);
console.log(`  colours   vars: ${Object.entries(vars).slice(0, 6).map(([k, v]) => `--${k} ${v}`).join(', ') || 'none'}`);
console.log(`            most used: ${topHex.slice(0, 6).map((c) => `${c.hex}(${c.uses})`).join(' ') || 'none'}`);
console.log(`  fonts     ${fonts.map((f) => `${f.family}${f.google ? ' [Google]' : ''}`).join(', ') || 'none found'}`);
if (logoSvg) console.log(`  inline logo found (${logoSvg.length} bytes)${logoFill ? `, the site paints it ${logoFill}` : ', no CSS fill found - check its colour in the browser'}`);
if (!logoSvg || logos.length) console.log(`  logo      ${logos.length ? logos.map((l) => l.src).join(' | ') : inlineSvgLogo ? 'inline SVG in the page - save it as published from the browser' : 'no <img> logo - it is probably an inline SVG; save it as published from the browser'}`);
console.log(`  og:image  ${ogImage || '-'}`);

if (write) {
  fs.mkdirSync(path.join(CAT, 'images', 'products'), {recursive: true});
  fs.writeFileSync(path.join(CAT, 'site-harvest.json'), JSON.stringify(harvest, null, 1));
  if (shopify) fs.writeFileSync(path.join(CAT, 'site-products.json'), JSON.stringify({site: origin, harvestedAt: harvest.harvestedAt, products}, null, 1));
  if (logoSvg) {
    fs.mkdirSync(path.join(CAT, 'images', 'website'), {recursive: true});
    fs.writeFileSync(path.join(CAT, 'images', 'website', 'logo-inline.svg'), logoSvg);   // byte-for-byte as published
  }
  let saved = 0;
  const ranked = products.filter((x) => x.image && x.available)
    .sort((a, b) => (productFirst ? Number(b.title.toLowerCase().includes(productFirst)) - Number(a.title.toLowerCase().includes(productFirst)) : 0));
  for (const p of ranked.slice(0, nImages)) {
    const r = await get(p.image, 'buf');
    if (r.body && /image/.test(r.ct)) {
      const ext = /png/.test(r.ct) ? '.png' : /webp/.test(r.ct) ? '.webp' : '.jpg';
      fs.writeFileSync(path.join(CAT, 'images', 'products', `${p.handle.slice(0, 60)}${ext}`), r.body);
      saved++;
    }
  }
  if (logoSvg) console.log(`  saved the inline logo as published: images/website/logo-inline.svg${logoFill ? ` - record "logo": {"cssFill": "${logoFill}"} in brand.json` : ''}`);
  console.log(`\n  wrote ${path.join(CAT, 'site-harvest.json')}${shopify ? ' and site-products.json' : ''}${nImages ? `; ${saved} packshot(s) in images/products/` : ''}`);
  console.log('  next: confirm palette roles and fonts into brand.json; read claims verbatim in the browser (brand-assets.md)\n');
} else console.log('\n  (dry run - add --write to save to the brand cache)\n');

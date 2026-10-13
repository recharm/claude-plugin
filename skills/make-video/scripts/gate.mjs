#!/usr/bin/env node
/**
 * gate.mjs - pass/fail checks on a rendered ad before it is delivered.
 *
 *   node gate.mjs out/ad.mp4 --edl edl.json [--brand <slug>]
 *
 * BLOCK (exit 1) when a measurable rule is broken; WARN for things to look at. Run it on the FINAL
 * render (not the -draft file) before sending anything to the user. It cannot judge taste - the contact
 * sheet and qc-checklist.md still do that - but it stops the ad going out at the wrong size, length or
 * loudness, or with a number on screen that nobody approved.
 *
 * Checks
 *   picture   resolution matches the EDL's aspect (1080x1920 / 1920x1080), 30fps, H.264
 *   length    within 0.5s of targetDuration
 *   audio     an audio stream exists; integrated loudness -14 LUFS (+-1 LU warn, +-2 block);
 *             true peak <= -1.0 dBTP; silent gaps over 1s (warn)
 *   mix       music.gainDb set in the EDL (blocks: it disables the -4 dB music-under-voice rule)
 *   captions  inside the cut; <= 5 words visible; at most one `punch`
 *   claims    every number in a caption (12g, 0%, 4.6, 80,000+ ...) must appear in the brand's
 *             website-brand.json claims, or in the EDL's "approvedClaims" (things the user supplied)
 *   words     risky words ("#1", "cure", "guaranteed", "clinically proven" ...) unless the site says them
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); if (i === -1) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const edlPath = flag('--edl');
let brand = flag('--brand');
const file = argv[0];
if (!file || !fs.existsSync(file)) { console.error('usage: node gate.mjs <rendered.mp4> --edl edl.json [--brand <slug>]'); process.exit(2); }

const edl = edlPath ? JSON.parse(fs.readFileSync(edlPath, 'utf8')) : {};
brand = brand || edl.brand || null;
const blocks = [];
const warns = [];
const oks = [];

const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

// ---------------------------------------------------------------- picture + length
if (/-draft\.[a-z0-9]+$/i.test(file)) blocks.push('this is a -draft render - gate and deliver the final render, not the draft');

const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries',
  'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate', '-of', 'json', file]).stdout || '{}');
const v = (probe.streams || []).find((s) => s.codec_type === 'video');
const a = (probe.streams || []).find((s) => s.codec_type === 'audio');
const dur = Number(probe.format?.duration);

const want = edl.width && edl.height ? { w: edl.width, h: edl.height }
  : (edl.aspect === '16:9' ? { w: 1920, h: 1080 } : { w: 1080, h: 1920 });
if (!v) blocks.push('no video stream');
else {
  if (v.width !== want.w || v.height !== want.h) blocks.push(`resolution ${v.width}x${v.height}, expected ${want.w}x${want.h} (${edl.aspect || '9:16'})`);
  else oks.push(`resolution ${v.width}x${v.height}`);
  const [n, d] = String(v.r_frame_rate).split('/').map(Number);
  const fps = d ? n / d : n;
  const wantFps = edl.fps ?? 30;
  if (Math.abs(fps - wantFps) > 0.01) blocks.push(`frame rate ${fps.toFixed(2)}, expected ${wantFps}`);
  else oks.push(`${wantFps}fps`);
  if (v.codec_name !== 'h264') warns.push(`video codec ${v.codec_name} - platforms expect H.264`);
}

if (edl.targetDuration != null && Number.isFinite(dur)) {
  const off = Math.abs(dur - edl.targetDuration);
  if (off > 0.5) blocks.push(`duration ${dur.toFixed(2)}s is ${off.toFixed(2)}s off the ${edl.targetDuration}s target`);
  else oks.push(`duration ${dur.toFixed(2)}s (target ${edl.targetDuration}s)`);
}

// ---------------------------------------------------------------- audio
if (!a) {
  blocks.push('no audio stream - an ad needs sound (voice, clip audio or music)');
} else {
  const eb = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr || '';
  const summary = eb.slice(eb.lastIndexOf('Summary:'));
  const I = Number((summary.match(/I:\s+(-?[\d.]+) LUFS/) || [])[1]);
  const TP = Number((summary.match(/Peak:\s+(-?[\d.]+) dBFS/) || [])[1]);
  const target = edl.audio?.targetLufs ?? -14;
  if (!Number.isFinite(I)) warns.push('could not measure loudness');
  else if (Math.abs(I - target) > 2) blocks.push(`loudness ${I} LUFS, target ${target} (more than 2 LU off)`);
  else if (Math.abs(I - target) > 1) warns.push(`loudness ${I} LUFS, target ${target}`);
  else oks.push(`loudness ${I} LUFS`);
  if (Number.isFinite(TP)) {
    if (TP > -1.0) blocks.push(`true peak ${TP} dBTP - above -1.0, will clip after platform encoding`);
    else oks.push(`true peak ${TP} dBTP`);
  }
  const sd = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'silencedetect=noise=-45dB:d=1.0', '-f', 'null', '-']).stderr || '';
  const gaps = [...sd.matchAll(/silence_start: (-?[\d.]+)[\s\S]*?silence_duration: ([\d.]+)/g)].map((m) => `${(+m[1]).toFixed(1)}s (${(+m[2]).toFixed(1)}s)`);
  if (gaps.length) warns.push(`silent gaps over 1s at ${gaps.join(', ')} - intended?`);
}

if (edl.audio?.music?.gainDb != null) blocks.push('audio.music.gainDb is set - it disables the measured 4 dB music-under-voice rule; remove it');

// ---------------------------------------------------------------- captions
const caps = edl.captions || [];
const capText = (c) => (Array.isArray(c.lines) ? c.lines.join(' ') : String(c.text ?? ''));
let punches = 0;
for (const c of caps) {
  const t = capText(c);
  const words = Array.isArray(c.lines) ? Math.max(...c.lines.map((l) => l.split(/\s+/).filter(Boolean).length)) : t.split(/\s+/).filter(Boolean).length;
  if (words > 5) warns.push(`caption "${t.slice(0, 40)}" shows ${words} words at once (max 4-5)`);
  if (Number.isFinite(dur) && c.end > dur + 0.05) blocks.push(`caption "${t.slice(0, 30)}" ends at ${c.end}s, after the ${dur.toFixed(2)}s cut`);
  if (c.anim === 'punch') punches++;
}
if (punches > 1) warns.push(`${punches} captions use "punch" - keep one, for the main claim`);
if (caps.length) oks.push(`${caps.length} captions checked`);

// ---------------------------------------------------------------- claims and risky words
const root = process.env.MAKE_VIDEO_ROOT || path.join(os.homedir(), '.claude', 'make-video');
let siteText = '';
if (brand) {
  const wb = path.join(root, 'brands', brand, 'catalog', 'website-brand.json');
  if (fs.existsSync(wb)) siteText = fs.readFileSync(wb, 'utf8');
  else warns.push(`no website-brand.json for "${brand}" - claims cannot be checked against the site`);
} else if (caps.length) {
  warns.push('no --brand given - claims cannot be checked against the site');
}
const approved = (edl.approvedClaims || []).join(' ');
const norm = (s) => s.toLowerCase().replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ');
const haystack = norm(siteText + ' ' + approved);
const allText = caps.map(capText).join(' ');

// Numbers in captions: 12g, 0-2g, 4.6, 80,000+, 26%, $39 ...
const nums = [...new Set((allText.match(/\$?\d[\d,.]*(?:\s?-\s?\d[\d,.]*)?\s?(?:%|g\b|mg\b|x\b|\+)?/gi) || []).map((n) => n.trim()))];
const hayTight = haystack.replace(/\s/g, '');
for (const n of nums) {
  const core = norm(n).replace(/\s/g, '');
  const bare = core.replace(/[^\d.,-]/g, '');
  if (!bare) continue;
  // A number with a unit (12g, 26%, 80,000+) must appear WITH that unit - a bare "20" elsewhere on the
  // site (a date, "save 20%") does not approve "20g protein". A unitless number must match whole.
  const hasUnit = core !== bare;
  const ok = hasUnit
    ? hayTight.includes(core)
    : new RegExp(`(^|[^\\d.,])${bare.replace(/[.]/g, '\\.')}([^\\d]|$)`).test(haystack);
  if (ok) continue;
  blocks.push(`number "${n}" is on screen but not in the website claims or approvedClaims - remove it or get the source`);
}
if (siteText && nums.length) oks.push(`${nums.length} on-screen number${nums.length === 1 ? '' : 's'} checked against the site`);

const RISKY = ['#1', 'number one', 'best in the world', 'guaranteed', 'cure', 'cures', 'clinically proven',
  'doctor recommended', 'dermatologist recommended', 'fda approved', 'scientifically proven', 'miracle', 'risk-free'];
for (const w of RISKY) {
  const re = new RegExp(`(^|[^a-z])${w.replace(/[#]/g, '\\#')}([^a-z]|$)`, 'i');
  if (re.test(allText) && !haystack.includes(w)) warns.push(`"${w}" is on screen but not on the site - needs a source or must go`);
}

// ---------------------------------------------------------------- report
console.log(`\n  gate: ${path.basename(file)}\n`);
for (const o of oks) console.log(`  ok     ${o}`);
for (const w of warns) console.log(`  warn   ${w}`);
for (const b of blocks) console.log(`  BLOCK  ${b}`);
console.log(blocks.length ? `\n  BLOCKED - fix ${blocks.length} issue${blocks.length === 1 ? '' : 's'} and re-render.\n` : '\n  PASS\n');
process.exit(blocks.length ? 1 : 0);

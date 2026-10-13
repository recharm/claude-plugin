#!/usr/bin/env node
/**
 * critic_pack.mjs - build the packet an independent critic reviews (see references/critic.md).
 *
 *   node critic_pack.mjs out/ad.mp4 --edl edl.json [--brand <slug>] [--format testimonial|promo|motion] [--out critic/]
 *
 * Writes:
 *   sheet.jpg  one frame every 0.5s, each stamped with its time - the critic's view of the picture
 *   facts.md   measured facts: format, length, loudness, the cut list with transitions, every caption with its
 *              timing and animation, effects, overlays, the approved claims, and the gate's verdict
 *   rules/     the editing rules for this format + captions-and-timing.md + qc-checklist.md
 * It leaves out the script's intent and the plan's reasoning on purpose: the critic judges the result.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REFS = path.resolve(HERE, '..', 'references');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); if (i === -1) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const edlPath = opt('--edl');
const brand = opt('--brand');
let format = opt('--format');
const outDir = path.resolve(opt('--out', 'critic'));
const video = argv[0];
if (!video || !fs.existsSync(video) || !edlPath) {
  console.error('usage: node critic_pack.mjs <render.mp4> --edl edl.json [--brand <slug>] [--format testimonial|promo|motion] [--out critic/]');
  process.exit(2);
}
fs.mkdirSync(path.join(outDir, 'rules'), {recursive: true});
const edl = JSON.parse(fs.readFileSync(edlPath, 'utf8'));
const run = (cmd, args) => spawnSync(cmd, args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});

// ---- format guess: clip-voice ads with no transitions are testimonials; Remotion-only files are motion
const segs = edl.segments || [];
const hasTransitions = segs.some((s) => s.transition && s.transition !== 'cut');
const allFiles = segs.length && segs.every((s) => s.file && !s.url);
format = format || (allFiles ? 'motion' : edl.audio?.keepClipAudio && !hasTransitions ? 'testimonial' : 'promo');

// ---- sheet: a frame every 0.5s with its timestamp
const pr = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height', '-of', 'json', video]).stdout);
const dur = Number(pr.format.duration);
const vs = pr.streams.find((s) => s.width);
const tw = vs.height > vs.width ? 160 : 284, th = Math.round(tw * vs.height / vs.width);
const n = Math.ceil(dur / 0.5);
const cols = vs.height > vs.width ? 10 : 6, rows = Math.ceil(n / cols);
const font = process.platform === 'win32' ? "fontfile='C\\:/Windows/Fonts/arial.ttf':" : '';
run('ffmpeg', ['-v', 'error', '-y', '-i', video, '-vf',
  `fps=2,scale=${tw}:${th},drawtext=${font}text='%{pts\\:hms}':x=4:y=4:fontsize=${Math.round(tw / 9)}:fontcolor=white:box=1:boxcolor=black@0.6,tile=${cols}x${rows}`,
  '-frames:v', '1', path.join(outDir, 'sheet.jpg')]);

// ---- loudness
const eb = run('ffmpeg', ['-hide_banner', '-nostats', '-i', video, '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr || '';
const sum = eb.slice(eb.lastIndexOf('Summary:'));
const I = (sum.match(/I:\s+(-?[\d.]+)/) || [])[1], TP = (sum.match(/Peak:\s+(-?[\d.]+)/) || [])[1];

// ---- output timeline from the EDL (same maths as build_ad.mjs)
const tDur = (s) => (s.transition && typeof s.transition === 'object' ? Number(s.transition.duration ?? 0.4) : 0);
let t = 0;
const timeline = segs.map((s, i) => {
  const d = Number(s.out) - Number(s.in ?? 0);
  const start = i === 0 ? 0 : t - tDur(s);
  t = start + d;
  const tr = i === 0 ? 'start' : s.transition && typeof s.transition === 'object' ? `${s.transition.type} ${s.transition.duration ?? 0.4}s` : 'hard cut';
  return `| ${start.toFixed(2)}-${t.toFixed(2)} | ${s.clipSymbol || path.basename(s.file || s.url || '')} | ${tr} | ${s.move || ''} | ${s.fit || edl.fit || 'cover'} |`;
});
const fmt = (x) => Number(x).toFixed(2);

// ---- claims
let claims = [];
if (brand) {
  const root = process.env.MAKE_VIDEO_ROOT || path.join(os.homedir(), '.claude', 'make-video');
  const wb = path.join(root, 'brands', brand, 'catalog', 'website-brand.json');
  if (fs.existsSync(wb)) claims = (JSON.parse(fs.readFileSync(wb, 'utf8')).claims || []).map((c) => (typeof c === 'string' ? c : c.text));
}
claims.push(...(edl.approvedClaims || []).map((c) => `${c} (user-supplied)`));

// ---- brand look, so colours and the logo can be judged
let brandLook = '- not recorded';
if (brand) {
  const root = process.env.MAKE_VIDEO_ROOT || path.join(os.homedir(), '.claude', 'make-video');
  const bp = path.join(root, 'brands', brand, 'brand.json');
  if (fs.existsSync(bp)) {
    const bj = JSON.parse(fs.readFileSync(bp, 'utf8'));
    const pal = Object.entries(bj.palette || {}).map(([k, v]) => `${k} ${typeof v === 'string' ? v : v.hex}`).join(', ');
    brandLook = `- Palette: ${pal || 'not recorded'}
- Fonts: ${bj.fonts?.heading || '?'} / ${bj.fonts?.body || '?'}
- Logo: ${bj.logo?.note || 'use only as published'}`;
  }
}

// ---- gate
const g = run('node', [path.join(HERE, 'gate.mjs'), video, '--edl', edlPath, ...(brand ? ['--brand', brand] : [])]);
const gate = (g.stdout || '').trim().split(/\r?\n/).filter((l) => /ok|warn|BLOCK|PASS/.test(l)).map((l) => l.trim());

const facts = `# Facts for review

- Format: **${format}**  ·  ratio ${edl.aspect || `${vs.width}x${vs.height}`}  ·  ${vs.width}x${vs.height}  ·  length ${fmt(dur)}s (target ${edl.targetDuration ?? '-'}s)
- Loudness ${I ?? '?'} LUFS, true peak ${TP ?? '?'} dBTP  ·  clip audio ${edl.audio?.keepClipAudio ? 'ON (creator voice)' : 'muted'}  ·  voiceover ${edl.audio?.voiceover?.file ? 'yes' : 'no'}  ·  music ${edl.audio?.music?.file ? 'yes' : 'no'}
- Sheet: sheet.jpg, one frame every 0.5s, timestamp top-left (hh:mm:ss.ms)

## Cuts (output timeline)

| Time | Shot | Into it | Move | Fit |
|---|---|---|---|---|
${timeline.join('\n')}

## On-screen text (captions)

| Time | Anim | Position | Text |
|---|---|---|---|
${(edl.captions || []).map((c) => `| ${fmt(c.start)}-${fmt(c.end)} | ${c.anim || 'fadeup'}${c.exit === 'cut' ? ' (cut out)' : ''} | ${c.y != null ? `y ${c.y}` : c.band || 'middle'} | ${Array.isArray(c.lines) ? c.lines.join(' / ') : c.text} |`).join('\n') || '| - | - | - | none |'}

## Effects and overlays

${(edl.audio?.sfx || []).map((s) => `- sfx ${s.name || s.file} at ${s.at}s`).join('\n') || '- no sound effects'}
${(edl.overlays || []).map((o) => `- graphic overlay ${path.basename(o.file)} from ${o.at}s`).join('\n') || '- no graphic overlays'}

## Brand

${brandLook}

## Approved claims (anything else on screen is a problem)

${claims.map((c) => `- ${c}`).join('\n') || '- none recorded'}

## Gate

${gate.map((l) => `- ${l}`).join('\n')}
`;
fs.writeFileSync(path.join(outDir, 'facts.md'), facts);

const ruleFiles = {
  testimonial: ['editing-testimonial.md'],
  promo: ['editing-promo.md'],
  motion: ['motion-graphics.md'],
}[format] || ['editing-promo.md'];
for (const f of [...ruleFiles, 'captions-and-timing.md', 'qc-checklist.md']) fs.copyFileSync(path.join(REFS, f), path.join(outDir, 'rules', f));

console.log(`  critic packet: ${outDir}\n  format ${format}, ${fmt(dur)}s, ${segs.length} shots, ${(edl.captions || []).length} captions, gate ${gate.includes('PASS') ? 'PASS' : 'see facts.md'}`);
console.log('  next: spawn the critic with the prompt in references/critic.md');

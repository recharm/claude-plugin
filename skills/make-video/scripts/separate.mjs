#!/usr/bin/env node
/**
 * separate.mjs - cut the person / product / hand out of a library clip, so graphics can sit BEHIND them.
 *
 *   node separate.mjs <clip.mp4> --from 14.0 --dur 2.6 --points "0.5,0.45" --out <project>/public/cutouts/<name>
 *        [--fps 30] [--model auto|tiny|base-plus|large] [--feather 2] [--setup] [--cuda]
 *
 *   --from/--dur  the stretch of the clip the scene uses (its trimBefore and duration, plus a little margin)
 *   --points      on the first frame of that stretch, as fractions of the frame: "x,y" (subject) or "x,y,0" (exclude);
 *                 separate several with ";". Read them off the sprite / a frame grab. Two or three on the subject help.
 *   --out         a folder in the brand's HyperFrames project assets/ - the scene then sets "cutout": "cutouts/<name>"
 *
 * Writes <out>/frame_00000.png ... (the subject on transparency, full resolution), <out>/cutout.webm (the same frames as
 * transparent VP9, a keyframe every second - what the cut-out layer plays) and <out>/cutout.json ({fps, frames, start,
 * width, height}) that hf_build.mjs reads.
 *
 * Runs SAM 2.1 (Meta, Apache-2.0) locally through Hugging Face transformers - nothing is uploaded; the model downloads
 * once (tiny 156 MB on CPU, base-plus 323 MB, large 898 MB on a 12 GB+ NVIDIA GPU). Speed: ~5 s per frame on CPU,
 * well under 1 s on a GPU. Python 3.10+, in a venv the first run creates at <cache root>/tools/sam (--setup only sets
 * it up; --cuda installs the CUDA build of torch, a ~2.5 GB download, for an NVIDIA card).
 * Method after Barty-Bart/motion-graphics "object-separation" (MIT).
 */
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const ROOT = process.env.MAKE_VIDEO_ROOT || path.join(os.homedir(), '.claude', 'make-video');
const VENV = path.join(ROOT, 'tools', 'sam');
const win = process.platform === 'win32';
const PY = path.join(VENV, win ? 'Scripts' : 'bin', win ? 'python.exe' : 'python');
const run = (cmd, args, o = {}) => spawnSync(cmd, args, {stdio: 'inherit', ...o});

// ---- one-time setup: a venv with torch + transformers (reuses an installed torch when there is one)
const setup = () => {
  if (fs.existsSync(PY)) {
    const ok = spawnSync(PY, ['-c', 'import torch, torchvision, transformers, PIL, numpy; from transformers import Sam2VideoModel'], {encoding: 'utf8'});
    if (ok.status === 0 && !argv.includes('--cuda')) return true;
  }
  const sysPy = ['py', 'python3', 'python'].find((p) => spawnSync(p, ['--version']).status === 0);
  if (!sysPy) { console.error('  Python 3.10+ is needed for object separation (setup.md -> Object separation).'); return false; }
  fs.mkdirSync(path.dirname(VENV), {recursive: true});
  const hasTorch = spawnSync(sysPy, ['-c', 'import torch'], {encoding: 'utf8'}).status === 0;
  if (!fs.existsSync(PY)) {
    console.log(`\n  setting up object separation in ${VENV} (first time only)...`);
    // reuse a system torch when present - it is the big download
    const v = run(sysPy, ['-m', 'venv', ...(hasTorch && !argv.includes('--cuda') ? ['--system-site-packages'] : []), VENV]);
    if (v.status !== 0) return false;
  }
  if (argv.includes('--cuda')) {
    run(PY, ['-m', 'pip', 'install', '--quiet', 'torch', 'torchvision', '--index-url', 'https://download.pytorch.org/whl/cu124']);
  } else {
    // torchvision must match the torch build: take both from the CPU index unless they are already importable
    const tv = spawnSync(PY, ['-c', 'import torch, torchvision'], {encoding: 'utf8'}).status === 0;
    if (!tv) run(PY, ['-m', 'pip', 'install', '--quiet', ...(hasTorch ? ['torchvision'] : ['torch', 'torchvision']), '--index-url', 'https://download.pytorch.org/whl/cpu']);
  }
  const p = run(PY, ['-m', 'pip', 'install', '--quiet', 'transformers>=4.56', 'pillow', 'numpy', 'accelerate']);
  return p.status === 0;
};

if (argv.includes('--setup') && !argv[0]?.endsWith('.mp4')) { process.exit(setup() ? 0 : 1); }

const clip = argv[0];
const out = opt('--out');
if (!clip || !fs.existsSync(clip) || !out || !opt('--points')) {
  console.error('usage: node separate.mjs <clip.mp4> --from S --dur D --points "x,y[,1|0];..." --out <project>/public/cutouts/<name>');
  process.exit(2);
}
if (!setup()) process.exit(1);

const from = Number(opt('--from', 0)), dur = Number(opt('--dur', 3)), fps = Number(opt('--fps', 30));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-sep-'));
const framesDir = path.join(work, 'frames');
fs.mkdirSync(framesDir);
// constant frame rate at the composition's fps, so cut-out frame n is composition frame n of the stretch
const ex = run('ffmpeg', ['-v', 'error', '-ss', String(from), '-t', String(dur), '-i', clip, '-vf', `fps=${fps}`, '-start_number', '0', path.join(framesDir, 'frame_%05d.png')]);
if (ex.status !== 0) process.exit(1);
const n = fs.readdirSync(framesDir).filter((f) => f.endsWith('.png')).length;
console.log(`\n  separate: ${n} frames (${dur}s from ${from}s at ${fps} fps) -> ${out}`);
if (fs.existsSync(out)) for (const f of fs.readdirSync(out)) if (/^frame_\d+\.png$/.test(f)) fs.unlinkSync(path.join(out, f));
const r = run(PY, [path.join(HERE, 'separate.py'), framesDir, out, '--points', opt('--points'), '--model', opt('--model', 'auto'), '--feather', opt('--feather', '2')]);
fs.rmSync(work, {recursive: true, force: true});
if (r.status !== 0) process.exit(1);
const dims = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path.join(out, 'frame_00000.png')], {encoding: 'utf8'}).stdout.trim().split(',').map(Number);
// the layer plays a transparent WebM, seeked frame-exactly by HyperFrames with the footage under it
const webm = run('ffmpeg', ['-v', 'error', '-y', '-framerate', String(fps), '-i', path.join(out, 'frame_%05d.png'), '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p',
  '-b:v', '0', '-crf', '30', '-g', String(fps), '-row-mt', '1', '-auto-alt-ref', '0', path.join(out, 'cutout.webm')]);
if (webm.status !== 0) { console.error('  could not encode cutout.webm (ffmpeg needs libvpx)'); process.exit(1); }
fs.writeFileSync(path.join(out, 'cutout.json'), JSON.stringify({fps, frames: n, start: from, width: dims[0], height: dims[1], clip: path.basename(clip)}, null, 2));
console.log(`  cutout.json written. In the scene: "cutout": "${path.relative(path.join(out, '..', '..'), out).split(path.sep).join('/')}" (with trimBefore between ${from} and ${(from + dur).toFixed(2)})\n`);

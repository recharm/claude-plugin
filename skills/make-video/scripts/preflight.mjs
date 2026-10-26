#!/usr/bin/env node
/**
 * preflight.mjs - confirm the toolchain before the interview, not at render time.
 *
 *   node preflight.mjs
 *
 * Exits non-zero if anything required is missing.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// On Windows, npx/npm are .cmd shims that spawnSync cannot exec directly, so
// probing them without a shell reports a false absence.
const NEEDS_SHELL = process.platform === 'win32';

function probe(bin, args = ['-version'], shell = false) {
  const useShell = shell && NEEDS_SHELL;
  // With shell:true, pass one pre-joined string rather than an args array -
  // Node deprecates the array form because it concatenates without escaping.
  const r = useShell
    ? spawnSync([bin, ...args].join(' '), { encoding: 'utf8', shell: true })
    : spawnSync(bin, args, { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  return (r.stdout || r.stderr || '').trim().split('\n')[0];
}

const checks = [
  {
    name: 'ffmpeg',
    required: true,
    line: probe('ffmpeg'),
    fix: 'Windows: winget install Gyan.FFmpeg   macOS: brew install ffmpeg   Linux: apt install ffmpeg',
    why: 'trims, normalizes, concatenates and encodes every UGC cut',
  },
  {
    name: 'ffprobe',
    required: true,
    line: probe('ffprobe'),
    fix: 'ships with ffmpeg - if ffmpeg is present but ffprobe is not, the install is incomplete',
    why: 'measures real clip and voiceover durations so the cut matches the read',
  },
  {
    name: 'node',
    required: true,
    line: probe('node', ['--version']),
    fix: 'https://nodejs.org - v22 or newer (HyperFrames needs 22+)',
    why: 'runs this toolchain, and HyperFrames for the motion-graphics formats',
  },
  {
    name: 'npx',
    required: false,
    line: probe('npx', ['--version'], true),
    fix: 'ships with npm',
    why: 'runs video-use without a global install',
  },
];

console.log('\n  Make Video - preflight\n');

const DEEP = process.argv.includes('--deep');

let failed = false;
for (const c of checks) {
  if (c.line) {
    const v = c.line.length > 62 ? c.line.slice(0, 62) + '...' : c.line;
    console.log(`  ok       ${c.name.padEnd(9)} ${v}`);
  } else if (c.required) {
    failed = true;
    console.log(`  MISSING  ${c.name.padEnd(9)} required - ${c.why}`);
    console.log(`           install: ${c.fix}`);
  } else {
    console.log(`  absent   ${c.name.padEnd(9)} optional - ${c.why}`);
  }
}

// Confirm the encoder we actually depend on is compiled in.
if (!failed) {
  const enc = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  const out = (enc.stdout || '') + (enc.stderr || '');
  if (!/\blibx264\b/.test(out)) {
    failed = true;
    console.log('\n  MISSING  libx264 encoder - this ffmpeg build cannot produce H.264');
    console.log('           install a full build (Windows: Gyan.FFmpeg full)');
  }
  const filt = spawnSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' });
  const fout = (filt.stdout || '') + (filt.stderr || '');
  if (!/\bsubtitles\b/.test(fout)) {
    console.log('\n  warn     subtitles filter not available - captions cannot be burned in');
    console.log('           install a build with libass (Windows: Gyan.FFmpeg full)');
  }
  if (!/\bsidechaincompress\b/.test(fout)) {
    console.log('\n  warn     sidechaincompress not available - music will not duck under the VO');
    console.log('           set music.duck=false in the EDL to silence this');
  }
}

// The xfade filter carries every non-testimonial join, and zoompan carries the
// simulated camera moves. A minimal ffmpeg build can lack either, and the
// failure only shows up at the join step, after the downloads and the trims.
if (!failed) {
  const filt = spawnSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' });
  const fout = (filt.stdout || '') + (filt.stderr || '');
  for (const [name, why] of [
    ['xfade', 'swipe and smooth transitions - every format except testimonial needs these'],
    ['zoompan', 'simulated camera moves (move: pushin / glide*)'],
  ]) {
    if (!new RegExp(`\\b${name}\\b`).test(fout)) {
      console.log(`\n  warn     ${name} filter not available - ${why}`);
      console.log('           install a full build (Windows: Gyan.FFmpeg full)');
    }
  }
}

// Optional, and only worth probing on request: `npx -y video-use@latest` pulls
// the package on first use, which is slow enough that it should not sit in the
// default path when a poster or a sprite grid usually answers the question.
console.log('');
console.log('  Optional, resolved on demand - nothing to install ahead of time:');
console.log('    video-use    npx -y video-use@latest    reads a clip frame by frame when a');
console.log('                 poster cannot settle a question (e.g. does burned-in text clear');
console.log('                 before the frame you want to cut on)');
console.log('    HyperFrames  installed by hf_init.mjs   motion-graphics formats only (pinned, in <cache>/tools/hyperframes;');
console.log('                 its first render downloads a headless Chrome, ~150 MB)');
if (DEEP) {
  const vu = NEEDS_SHELL
    ? spawnSync('npx -y video-use@latest --help', { encoding: 'utf8', shell: true, timeout: 180000 })
    : spawnSync('npx', ['-y', 'video-use@latest', '--help'], { encoding: 'utf8', timeout: 180000 });
  const ok = !vu.error && vu.status === 0;
  console.log(`\n  ${ok ? 'ok      ' : 'warn    '} video-use ${ok ? 'resolves and runs' : 'could not be resolved - check network or npm registry access'}`);
}

// ghost-editor is a companion skill. Report whether it is installed; never install it from here -
// cloning third-party code is the user's call.
{
  const ge = path.join(os.homedir(), '.claude', 'skills', 'ghost-editor');
  const ok = fs.existsSync(path.join(ge, 'SKILL.md'));
  console.log('');
  console.log(`  ${ok ? 'ok      ' : 'absent  '} ghost-editor  ${ok ? ge : 'companion skill not installed (optional)'}`);
  if (ok) {
    const sfx = fs.existsSync(path.join(ge, 'library', 'sfx')) ? fs.readdirSync(path.join(ge, 'library', 'sfx')).filter((f) => f.endsWith('.wav')).length : 0;
    console.log(`                 sfx kit: ${sfx} files${sfx < 30 ? ' - run its scripts/library_restore.py' : ''}; full check: bash ${ge.split(path.sep).join('/')}/scripts/doctor.sh`);
  }
  if (!ok) {
    console.log('                 optional - not needed; ElevenLabs transcription covers testimonials');
  }
}

// Companion skills and optional tools.
{
  const sk = path.join(os.homedir(), '.claude', 'skills');
  // HyperFrames: installed once per cache by hf_init.mjs (pinned); Node 22+ is its floor
  const root = process.env.MAKE_VIDEO_ROOT || path.join(os.homedir(), '.claude', 'make-video');
  const hfPkg = path.join(root, 'tools', 'hyperframes', 'node_modules', 'hyperframes', 'package.json');
  const hfv = fs.existsSync(hfPkg) ? JSON.parse(fs.readFileSync(hfPkg, 'utf8')).version : null;
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  console.log('');
  console.log(`  ${hfv ? 'ok      ' : 'absent  '} hyperframes      ${hfv ? `${hfv} in ${path.dirname(path.dirname(path.dirname(hfPkg)))}` : 'not installed yet - hf_init.mjs installs it on the first motion-graphics ad'}`);
  if (nodeMajor < 22) console.log(`  WARN     node ${process.versions.node} - HyperFrames needs Node 22+; motion graphics will not render until Node is upgraded`);
  const py = process.platform === 'win32' ? 'py' : 'python3';
  const w = spawnSync(py, ['-c', 'import whisper'], { encoding: 'utf8' });
  console.log(`  ${!w.error && w.status === 0 ? 'ok      ' : 'absent  '} whisper          ${!w.error && w.status === 0 ? 'local transcription available (scripts/transcribe.mjs)' : 'optional - else use ElevenLabs transcription'}`);
  // OpenTimelineIO (optional): export_nle.mjs writes sequence.otio for Resolve 18.5+ with it, and checks its XML parses
  const otioPy = path.join(root, 'tools', 'otio', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const o = fs.existsSync(otioPy) ? spawnSync(otioPy, ['-c', 'import opentimelineio, otio_fcp_adapter'], {encoding: 'utf8'}) : null;
  console.log(`  ${o && o.status === 0 ? 'ok      ' : 'absent  '} opentimelineio   ${o && o.status === 0 ? 'export_nle writes sequence.otio (Resolve 18.5+) and checks its XML' : 'optional - export_nle skips sequence.otio (setup.md -> OpenTimelineIO)'}`);
}

// These live in the session, not on disk, so a script cannot probe them.
console.log('');
console.log('  Check in-session, not here:');
console.log('    Recharm MCP     needed for the clip library. Confirm with whoami + list_brands, then list_labels(<slug>) -');
console.log('                    expect categories such as Scene Type, Creator, Product, Actor Type,');
console.log('                    Audio Type, Captions. If they differ from the brand cache catalog/labels.json,');
console.log('                    the library was re-labelled - trust the live call (library.md -> Refreshing).');
console.log('    ElevenLabs MCP  voiceover: creative_list_voices + creative_generate_speech.');
console.log('                    music: creative_generate_in_flow node_type "music". Never invent a voice ID.');
console.log('    HyperFrames     only for motion-graphics ads; hf_init.mjs installs the pinned version, no global install.');
console.log('    -> Say which connectors are missing in your FIRST message (with the brand confirmation), and what');
console.log('       changes without them - not after the script is written.');

// ---- network: can this workspace reach what the ad needs? Cloud sandboxes (claude.ai) often allow only an
// allowlist of hosts, and finding that out at render time wastes the whole session.
const optArg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1]; };
if (!process.argv.includes('--no-net')) {
  const {probeHost} = await import('./lib/net.mjs');
  const site = optArg('--site');
  const targets = [
    ['clip storage', 'https://recharm-content-library.s3-accelerate.amazonaws.com/', true, 'Recharm clips (accelerated S3)'],
    ['clip storage', 'https://recharm-content-library.s3.amazonaws.com/', true, 'Recharm clips (standard S3, the fallback)'],
    ['npm registry', 'https://registry.npmjs.org/hyperframes', false, 'HyperFrames + GSAP install (motion graphics, end cards)'],
    ['chrome download', 'https://storage.googleapis.com/chrome-for-testing-public/', false, "HyperFrames' headless Chrome (first render only)"],
    ...(site ? [['brand website', site, false, 'claims, packshots, colours, fonts']] : []),
  ];
  const res = await Promise.all(targets.map(([, u, s3]) => probeHost(u, {expectS3: s3})));
  console.log('\n  Network (from this workspace):');
  targets.forEach(([name, u, , why], i) => {
    const r = res[i];
    console.log(`  ${r.ok ? 'ok      ' : 'BLOCKED '} ${name.padEnd(14)} ${new URL(u).host.padEnd(52)} ${r.ok ? '' : r.reason}`);
    if (!r.ok) console.log(`           needed for: ${why}`);
  });
  const clipsOk = res[0].ok || res[1].ok;
  if (!clipsOk) {
    console.log(`
  CLIP DOWNLOADS ARE BLOCKED here. Tell the user NOW, before the interview, and offer:
    1. Allow the hosts: an admin adds  recharm-content-library.s3-accelerate.amazonaws.com  and
       recharm-content-library.s3.amazonaws.com  (plus the brand website) to the workspace's allowed domains
       for code execution, then starts a new chat.
    2. Supply the clips by hand: after the shortlist, fetch_clips.mjs writes DOWNLOAD-THESE.html (one link
       per clip); the user downloads them into one folder and shares or uploads it; fetch_clips --from picks
       them up by file name.
    3. No library footage: a motion-graphics ad from the website packshots${res[4] && !res[4].ok ? ' (the website is blocked too - the user must upload packshots and a logo)' : ''}.`);
  } else if (!res[0].ok) {
    console.log('\n  note     the accelerated clip host is blocked but the standard one works - downloads fall back to it automatically.');
  }
  if (!res[2].ok) console.log('\n  note     npm is blocked - HyperFrames can only run if <cache>/tools/hyperframes is already installed; plan footage-only (ffmpeg) edits.');
  if (!res[3].ok) console.log("\n  note     the Chrome download host is blocked - HyperFrames renders only if its browser is already cached (npx hyperframes doctor).");
}

console.log('');
if (failed) {
  console.log('  Cannot proceed. Install the missing tools above, then re-run.\n');
  process.exit(1);
}
console.log('  Ready.\n');

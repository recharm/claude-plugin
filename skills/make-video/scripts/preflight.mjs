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
    fix: 'https://nodejs.org - v18 or newer',
    why: 'runs this toolchain, and Remotion for the motion-graphics formats',
  },
  {
    name: 'npx',
    required: false,
    line: probe('npx', ['--version'], true),
    fix: 'ships with npm',
    why: 'runs Remotion and video-use without a global install',
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
console.log('    Remotion     npx create-video@latest    motion-graphics formats only');
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
    console.log('                 to install (user runs/approves): git clone https://github.com/kurbaitaev/ghost-editor');
    console.log('                 ~/.claude/skills/ghost-editor, then follow its docs/INSTALL.md');
  }
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
console.log('    Remotion        only for motion-graphics ads; npx resolves it on demand, no global install.');

console.log('');
if (failed) {
  console.log('  Cannot proceed. Install the missing tools above, then re-run.\n');
  process.exit(1);
}
console.log('  Ready.\n');

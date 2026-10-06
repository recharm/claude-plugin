#!/usr/bin/env node
/**
 * set_music_level.mjs - put the music bed a fixed number of dB under the voice.
 *
 * The brand rule for Alevia ads is that the background music sits 4 dB below the voice - either a
 * generated/supplied voiceover, or the dialogue already on the clips when the cut rides on sync
 * audio.
 *
 * The reason this needs a script rather than a hardcoded number: `gainDb` in the EDL is a *knob*,
 * not a level. Two voiceover files at gainDb 0 can differ by 15 dB depending on how they were
 * generated or recorded, and music libraries are mastered far hotter than speech. Setting
 * `music.gainDb = vo.gainDb - 4` looks like it satisfies the rule and usually does not - the bed
 * ends up either inaudible or on top of the read.
 *
 * So: measure both stems, then solve for the gain that actually lands the bed 4 dB under.
 *
 * Usage:
 *   node scripts/set_music_level.mjs edl.json                  # measure + report + patch the EDL
 *   node scripts/set_music_level.mjs edl.json --offset -6      # a different gap
 *   node scripts/set_music_level.mjs edl.json --dry-run        # report only, do not write
 *   node scripts/set_music_level.mjs --vo vo.mp3 --music bed.mp3   # no EDL, just tell me the number
 *
 * For a sync-dialogue cut (keepClipAudio: true, no voiceover file), pass the clip whose dialogue
 * carries the ad so there is something to measure against:
 *   node scripts/set_music_level.mjs edl.json --dialogue work/clip-3.mp4
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_OFFSET_DB = -4;

function die(msg) {
  console.error(`set_music_level: ${msg}`);
  process.exit(1);
}

/**
 * Integrated loudness (LUFS) of a file's audio, via ffmpeg's ebur128 filter.
 *
 * LUFS rather than peak or mean RMS because it is perceptual - it weights the frequency bands the
 * ear actually uses to judge "how loud is this", which is the whole question here. A peak
 * measurement would be dominated by the music's transients and would put the bed far too quiet.
 */
function integratedLufs(file) {
  if (!fs.existsSync(file)) die(`file not found: ${file}`);
  let out;
  try {
    out = execFileSync(
      'ffmpeg',
      ['-hide_banner', '-nostats', '-i', file, '-map', 'a:0', '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
  } catch (err) {
    // ffmpeg writes the summary to stderr and exits non-zero on some builds; the text is still there.
    out = `${err.stdout || ''}${err.stderr || ''}`;
    if (!out.includes('Integrated loudness')) {
      die(`ffmpeg could not read audio from ${file}. Does it have an audio stream?`);
    }
  }
  const tail = out.slice(out.lastIndexOf('Integrated loudness'));
  const m = tail.match(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/);
  if (!m) die(`could not parse loudness for ${file}`);
  return parseFloat(m[1]);
}

const argv = process.argv.slice(2);
const VALUE_FLAGS = new Set(['--offset', '--vo', '--music', '--dialogue']);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
};
const has = (name) => argv.includes(name);

const offset = parseFloat(flag('--offset') ?? DEFAULT_OFFSET_DB);
if (Number.isNaN(offset)) die('--offset must be a number of dB, e.g. -4');

// Positional arg = the EDL. Skip flags and the values that belong to them.
const edlPath = argv.find((a, i) => !a.startsWith('--') && !VALUE_FLAGS.has(argv[i - 1]));

let voFile = flag('--vo');
let musicFile = flag('--music');
const dialogueFile = flag('--dialogue');
let edl = null;
let base = process.cwd();

if (edlPath && fs.existsSync(edlPath) && edlPath.endsWith('.json')) {
  edl = JSON.parse(fs.readFileSync(edlPath, 'utf8'));
  base = path.dirname(path.resolve(edlPath));
  const audio = edl.audio || {};
  voFile ||= audio.voiceover?.file ? path.resolve(base, audio.voiceover.file) : null;
  musicFile ||= audio.music?.file ? path.resolve(base, audio.music.file) : null;
}

if (!musicFile) die('no music file - pass --music, or give an EDL with audio.music.file set. Nothing to balance.');

const voiceSource = voFile || dialogueFile;
if (!voiceSource) {
  die(
    'no voice to measure against.\n' +
      '  - VO-led cut: the EDL needs audio.voiceover.file, or pass --vo vo.mp3\n' +
      '  - sync-dialogue cut (keepClipAudio: true): pass --dialogue <the clip carrying the read>'
  );
}

const voLufs = integratedLufs(voiceSource);
const musicLufs = integratedLufs(musicFile);

// The gain the EDL already applies to the voice; the bed has to land relative to the *post-gain* voice.
const voGainDb = edl?.audio?.voiceover?.gainDb ?? 0;
const voEffective = voLufs + voGainDb;
const target = voEffective + offset;
const musicGainDb = Math.round((target - musicLufs) * 10) / 10;

const label = voFile ? 'voiceover' : 'clip dialogue';
console.log(`  ${label.padEnd(14)} ${path.basename(voiceSource)}`);
console.log(`    measured      ${voLufs.toFixed(1)} LUFS${voGainDb ? `  (+ gainDb ${voGainDb} = ${voEffective.toFixed(1)})` : ''}`);
console.log(`  music          ${path.basename(musicFile)}`);
console.log(`    measured      ${musicLufs.toFixed(1)} LUFS`);
console.log('');
console.log(`  target for bed  ${target.toFixed(1)} LUFS  (${offset} dB under the voice)`);
console.log(`  => music.gainDb ${musicGainDb}`);

if (musicGainDb > 0) {
  console.log('');
  console.log(
    '  Note: that is a positive gain - this bed is quieter than the voice to begin with.\n' +
      '  Boosting a quiet track raises its noise floor with it. Prefer a louder source track.'
  );
}

// A bed only 4 dB under the read will mask it during speech unless something moves it out of the
// way. Ducking is what makes the two numbers compatible: the static level satisfies the brand rule,
// the sidechain gets the bed out from under the words while they are being spoken.
const duckOn = edl ? edl.audio?.music?.duck !== false : true;
if (!duckOn) {
  console.log('');
  console.log(
    '  WARNING: ducking is off and the bed is only 4 dB under the voice. At that level a bed\n' +
      '  without ducking will sit on top of the read. Set "duck": true (the default) unless you\n' +
      '  have a specific reason not to.'
  );
}

if (edl && !has('--dry-run')) {
  edl.audio ||= {};
  edl.audio.music ||= {};
  edl.audio.music.gainDb = musicGainDb;
  if (edl.audio.music.duck === undefined) edl.audio.music.duck = true;
  fs.writeFileSync(edlPath, `${JSON.stringify(edl, null, 2)}\n`);
  console.log('');
  console.log(`  wrote audio.music.gainDb = ${musicGainDb} to ${edlPath}`);
}

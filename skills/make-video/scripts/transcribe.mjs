#!/usr/bin/env node
/**
 * transcribe.mjs - word-timed transcripts of the shortlisted clips, via local Whisper.
 *
 *   node transcribe.mjs clips/EEF.mp4 clips/EEG.mp4 ... [--out transcripts.json] [--model base] [--lang en]
 *
 * Writes { "<clip basename>": [ { s, e, t, w: [[start, end, word], ...] } ] } and prints each clip's
 * lines with times, so cuts can land on word boundaries and captions can be timed to the words.
 * Times are in SOURCE seconds - add each segment's output offset (the builder prints it) for captions.
 *
 * Needs Python with openai-whisper (`py -m pip install openai-whisper` on Windows). The first run
 * downloads the chosen model (~140 MB for base). Only transcribe the shortlist - it is the slow step.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  if (i === -1) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const out = opt('--out', 'transcripts.json');
const model = opt('--model', 'base');
const lang = opt('--lang', 'en');
const files = args.filter((a) => fs.existsSync(a));
if (!files.length) {
  console.error('usage: node transcribe.mjs <clip.mp4> [...] [--out transcripts.json] [--model base] [--lang en]');
  process.exit(2);
}

// Windows ships the `py` launcher; elsewhere python3.
const PY = process.platform === 'win32' ? 'py' : 'python3';

const pyCode = `
import json, sys, os, whisper
files = json.loads(sys.argv[1]); model = whisper.load_model(sys.argv[2]); lang = sys.argv[3]
res = {}
for f in files:
    r = model.transcribe(f, language=lang, word_timestamps=True)
    res[os.path.splitext(os.path.basename(f))[0]] = [
        {"s": round(s["start"], 2), "e": round(s["end"], 2), "t": s["text"].strip(),
         "w": [[round(w["start"], 2), round(w["end"], 2), w["word"].strip()] for w in s.get("words", [])]}
        for s in r["segments"]]
print(json.dumps(res))
`;

const tmp = path.join(os.tmpdir(), `transcribe-${process.pid}.py`);
fs.writeFileSync(tmp, pyCode);
const r = spawnSync(PY, [tmp, JSON.stringify(files.map((f) => path.resolve(f))), model, lang], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, PYTHONUTF8: '1', PYTHONWARNINGS: 'ignore' },
});
fs.rmSync(tmp, { force: true });

if (r.error || r.status !== 0) {
  const err = (r.stderr || String(r.error || '')).trim().split('\n').slice(-4).join('\n');
  console.error(`  transcription failed:\n${err}`);
  if (/No module named 'whisper'/.test(r.stderr || '')) {
    console.error(`  install it: ${PY} -m pip install openai-whisper   (or use ElevenLabs creative_transcribe_audio)`);
  }
  process.exit(1);
}

const lastLine = r.stdout.trim().split('\n').pop();
const data = JSON.parse(lastLine);
fs.writeFileSync(out, JSON.stringify(data, null, 1));
for (const [clip, segs] of Object.entries(data)) {
  console.log(`  ${clip.padEnd(10)} ${segs.map((s) => `[${s.s}-${s.e}] ${s.t}`).join(' / ') || '(no speech)'}`);
}
console.log(`\n  word timings written to ${out}`);

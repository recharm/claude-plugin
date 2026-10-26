#!/usr/bin/env node
/**
 * beats.mjs - land cuts on the music.
 *
 *   node beats.mjs analyze music.mp3 [--out audiomap.json]
 *   node beats.mjs snap --edl edl.json --map audiomap.json [--window 0.35] [--write]
 *   node beats.mjs snap --scenes ads/<name>.json --map audiomap.json [--write]     (motion-graphics scene list)
 *
 * analyze: tempo, beats, downbeats, energy over time and whether the track is rhythmic at all (idea from
 * norahe0304-art/30x-video's audiomap, MIT; implemented here in plain Node - spectral-flux onsets, tempo by
 * autocorrelation, dynamic-programming beat tracking - so it needs nothing but ffmpeg).
 *
 * snap: moves each cut to the nearest beat within --window seconds (a downbeat when one is close), by trimming or
 * extending the outgoing clip - never past its source or below 0.6s. On a scene list it adjusts scene durations.
 * When the track isn't rhythmic it doesn't snap; it lists the energy changes so section changes can sit on them.
 *
 * For promo, problem/solution, motion-graphics and music-led ads. Not for testimonials (cut on sentences) or
 * VO-led cuts where the VO lines decide the cut points. Re-time captions afterwards (the timeline moved).
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';

const [cmd, ...argv] = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };

// ---------------------------------------------------------------- analysis
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

// Calibrated: noise 0.6-0.8, real music beds 1.06-1.56, a click track 2.6. Override with BEATS_RHYTHM_MIN.
const RHYTHM_MIN = Number(process.env.BEATS_RHYTHM_MIN || 1.0);

function analyze(file) {
  const SR = 22050, N = 1024, HOP = 512;
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], {maxBuffer: 1 << 30});
  if (r.status !== 0) throw new Error(`could not decode ${file}`);
  const buf = r.stdout;
  const x = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
  const frames = Math.floor((x.length - N) / HOP);
  const fps = SR / HOP;
  const win = Float32Array.from({length: N}, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  let prev = new Float32Array(N / 2);
  const onset = new Float32Array(frames), rms = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const re = new Float64Array(N), im = new Float64Array(N);
    let e = 0;
    for (let i = 0; i < N; i++) { const v = x[f * HOP + i]; re[i] = v * win[i]; e += v * v; }
    rms[f] = Math.sqrt(e / N);
    fft(re, im);
    const mag = new Float32Array(N / 2);
    let flux = 0;
    for (let k = 1; k < N / 2; k++) { mag[k] = Math.log1p(100 * Math.hypot(re[k], im[k])); const d = mag[k] - prev[k]; if (d > 0) flux += d; }
    onset[f] = flux; prev = mag;
  }
  // normalise onset envelope
  const mean = onset.reduce((a, b) => a + b, 0) / frames;
  const sd = Math.sqrt(onset.reduce((a, b) => a + (b - mean) ** 2, 0) / frames) || 1;
  const env = Float32Array.from(onset, (v) => Math.max(0, (v - mean) / sd));

  // tempo: autocorrelation over 70-180 BPM, weighted toward ~120
  const ac = (lag) => { let s = 0; for (let i = lag; i < frames; i++) s += env[i] * env[i - lag]; return s / (frames - lag); };
  let best = {bpm: 0, score: -1, lag: 0};
  const scores = [];
  for (let bpm = 70; bpm <= 180; bpm += 0.5) {
    const lag = (60 / bpm) * fps;
    const s = (ac(Math.floor(lag)) * (1 - (lag % 1)) + ac(Math.ceil(lag)) * (lag % 1)) * Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    scores.push(s);
    if (s > best.score) best = {bpm, score: s, lag};
  }
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const rhythmic = best.score > avgScore * 1.6;

  // beat tracking (Ellis 2007): best path of onsets spaced ~one period apart
  const P = best.lag, alpha = 100;
  const score = new Float32Array(frames), back = new Int32Array(frames).fill(-1);
  for (let t = 0; t < frames; t++) {
    let m = 0, arg = -1;
    for (let p = Math.max(0, Math.round(t - 2 * P)); p <= t - Math.round(P / 2); p++) {
      const v = score[p] - alpha * Math.log((t - p) / P) ** 2;
      if (v > m || arg === -1) { m = v; arg = p; }
    }
    score[t] = env[t] + (arg >= 0 ? m : 0); back[t] = arg;
  }
  let t = frames - 1;
  for (let k = frames - 1; k > frames - 1 - P && k > 0; k--) if (score[k] > score[t]) t = k;
  const beats = [];
  while (t >= 0) { beats.unshift(+(t / fps).toFixed(3)); t = back[t]; }
  // downbeats: the phase (0-3) whose beats carry the most onset energy
  // Tempo from the tracked beats (finer than the autocorrelation's whole-frame lag steps).
  const ibis = beats.slice(1).map((b, i) => b - beats[i]).sort((a, b) => a - b);
  const ibi = beats.length > 2 ? (beats[beats.length - 1] - beats[0]) / (beats.length - 1) : 60 / best.bpm;
  const bpm = +(60 / ibi).toFixed(1);
  // Rhythm test: onsets on the tracked beats vs onsets everywhere, and how steady the beat spacing is.
  const onBeat = beats.reduce((a, b) => a + (env[Math.round(b * fps)] || 0), 0) / Math.max(1, beats.length);
  const overall = env.reduce((a, b) => a + b, 0) / frames || 1e-9;
  const beatStrength = +(onBeat / overall).toFixed(2);
  // Periodicity: autocorrelation at the beat period vs at the half-off spacings (1.5x, 0.5x+). Music repeats at
  // its period; noise doesn't, so its ratio stays near 1.
  const lagP = ibi * fps;
  // Variation of the autocorrelation across spacings up to 4 beats: music has peaks and troughs at many
  // metrical spacings; noise is flat. (Coefficient of variation.)
  const acs = [];
  for (let l = 3; l <= Math.round(4 * lagP); l++) acs.push(ac(l));
  const acMean = acs.reduce((a, b) => a + b, 0) / acs.length || 1e-9;
  const periodicity = +(Math.sqrt(acs.reduce((a, b) => a + (b - acMean) ** 2, 0) / acs.length) / Math.abs(acMean)).toFixed(2);
  const spread = ibis.length ? (ibis[Math.floor(ibis.length * 0.9)] - ibis[Math.floor(ibis.length * 0.1)]) / ibi : 1;
  const phaseE = [0, 1, 2, 3].map((ph) => beats.filter((_, i) => i % 4 === ph).reduce((a, b) => a + env[Math.round(b * fps)] || 0, 0));
  const ph = phaseE.indexOf(Math.max(...phaseE));
  const downbeats = beats.filter((_, i) => i % 4 === ph);

  // energy in 0.5s steps, and where it shifts (section changes)
  const step = Math.round(fps / 2);
  const energy = [];
  for (let f = 0; f < frames; f += step) energy.push(+(rms.slice(f, f + step).reduce((a, b) => a + b, 0) / step).toFixed(4));
  const med = [...energy].sort((a, b) => a - b)[Math.floor(energy.length / 2)] || 0;
  const shifts = [];
  for (let i = 2; i < energy.length - 2; i++) {
    const before = (energy[i - 2] + energy[i - 1]) / 2, after = (energy[i] + energy[i + 1]) / 2;
    if (Math.abs(after - before) > med * 0.6 && (!shifts.length || i * 0.5 - shifts[shifts.length - 1].t > 2)) shifts.push({t: i * 0.5, to: after > before ? 'up' : 'down'});
  }
  return {file, duration: +(x.length / SR).toFixed(2), bpm, rhythmic: rhythmic && periodicity >= RHYTHM_MIN && spread < 0.25,
    periodicity, beatStrength, beatSpread: +spread.toFixed(2), beats, downbeats, energyStep: 0.5, energy, shifts};
}

// ---------------------------------------------------------------- snapping
function snapTimes(cuts, map, window) {
  // returns target time per cut (or the cut itself if nothing is close)
  return cuts.map((c) => {
    const near = (list) => list.reduce((b, x) => (Math.abs(x - c) < Math.abs(b - c) ? x : b), Infinity);
    const db = near(map.downbeats), b = near(map.beats);
    const tgt = Math.abs(db - c) <= window ? db : Math.abs(b - c) <= window ? b : c;
    return +tgt.toFixed(3);
  });
}

if (cmd === 'analyze') {
  const file = argv.find((a) => !a.startsWith('--'));
  const out = opt('--out', 'audiomap.json');
  if (!file) { console.error('usage: node beats.mjs analyze <music> [--out audiomap.json]'); process.exit(2); }
  const m = analyze(file);
  fs.writeFileSync(out, JSON.stringify(m));
  console.log(`\n  ${file}: ${m.duration}s, ${m.bpm} BPM, periodicity ${m.periodicity}, beat strength ${m.beatStrength}, spread ${m.beatSpread}, ${m.rhythmic ? 'rhythmic' : 'NOT clearly rhythmic (ambient/rubato) - cut to energy shifts, not beats'}`);
  console.log(`  beats ${m.beats.length} (first ${m.beats.slice(0, 6).join(', ')} ...), downbeats every ${(4 * 60 / m.bpm).toFixed(2)}s from ${m.downbeats[0]}s`);
  console.log(`  energy shifts: ${m.shifts.map((s) => `${s.t}s ${s.to}`).join(', ') || 'none'}\n  wrote ${out}\n`);
} else if (cmd === 'snap') {
  const map = JSON.parse(fs.readFileSync(opt('--map'), 'utf8'));
  const window = Number(opt('--window', '0.35'));
  const write = argv.includes('--write');
  const delay = 0; // music starts at 0 on the output timeline
  if (!map.rhythmic) {
    console.log(`  the track isn't clearly rhythmic - not snapping. Put section changes on its energy shifts: ${map.shifts.map((s) => `${s.t}s (${s.to})`).join(', ') || 'none found'}`);
    process.exit(0);
  }
  if (opt('--edl')) {
    const p = opt('--edl');
    const edl = JSON.parse(fs.readFileSync(p, 'utf8'));
    const tDur = (s) => (s.transition && typeof s.transition === 'object' ? Number(s.transition.duration ?? 0.4) : 0);
    let shift = 0, t = 0;
    const lines = [];
    edl.segments.forEach((seg, i) => {
      const dur = seg.out - seg.in;
      const start = i === 0 ? 0 : t - tDur(seg);
      t = start + dur;
      if (i === edl.segments.length - 1) return;
      // the cut is where the next segment starts (its transition centre for xfades)
      const next = edl.segments[i + 1];
      const cut = t - tDur(next) / 2 + shift;
      const [tgt] = snapTimes([cut - delay], map, window);
      let d = +(tgt + delay - cut).toFixed(3);
      const src = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', seg.url || seg.file], {encoding: 'utf8'});
      const srcDur = Number(src.stdout) || Infinity;
      if (seg.out + d > srcDur) d = +(srcDur - seg.out).toFixed(3);
      if (seg.out + d - seg.in < 0.6) d = +(0.6 - (seg.out - seg.in)).toFixed(3);
      if (Math.abs(d) > 0.001) { seg.out = +(seg.out + d).toFixed(3); shift += d; }
      lines.push(`  cut ${i + 1}->${i + 2}: ${cut.toFixed(2)}s -> ${(cut + d).toFixed(2)}s ${Math.abs(d) < 0.001 ? '(on beat / no beat near)' : `(${d > 0 ? '+' : ''}${d.toFixed(2)}s on ${seg.clipSymbol || 'segment ' + (i + 1)})`}`);
    });
    lines.forEach((l) => console.log(l));
    console.log(`  runtime change ${shift >= 0 ? '+' : ''}${shift.toFixed(2)}s${edl.targetDuration ? ` - check against the ${edl.targetDuration}s target` : ''}; re-time captions to the new timeline`);
    if (write) { fs.writeFileSync(p, JSON.stringify(edl, null, 2)); console.log(`  written to ${p}`); }
  } else if (opt('--scenes')) {
    const p = opt('--scenes');
    const ad = JSON.parse(fs.readFileSync(p, 'utf8'));
    const scenes = ad.scenes || ad.ad?.scenes;
    const tr = (s) => (s.transition ? Number(s.transition.seconds ?? 0.4) : 0);
    let start = 0;
    scenes.forEach((s, i) => {
      if (i === scenes.length - 1) return;
      const end = start + s.duration;
      const cut = end - tr(scenes[i + 1]) / 2;
      const [tgt] = snapTimes([cut], map, window);
      const d = Math.max(0.8 - s.duration, +(tgt - cut).toFixed(3));
      if (Math.abs(d) > 0.001) { s.duration = +(s.duration + d).toFixed(3); console.log(`  scene ${i + 1} (${s.type}) ${d > 0 ? '+' : ''}${d.toFixed(2)}s -> its cut lands at ${(cut + d).toFixed(2)}s`); }
      start = start + s.duration - tr(scenes[i + 1]);
    });
    if (write) { fs.writeFileSync(p, JSON.stringify(ad, null, 2)); console.log(`  written to ${p}`); }
  } else {
    console.error('snap needs --edl or --scenes');
    process.exit(2);
  }
} else {
  console.error('usage: node beats.mjs analyze <music> | snap --edl edl.json|--scenes ad.json --map audiomap.json [--write]');
  process.exit(2);
}

#!/usr/bin/env node
/**
 * build_ad.mjs - render a 9:16 or 16:9 ad from an EDL.
 *
 *   node build_ad.mjs edl.json
 *
 * Pipeline: download/cache -> normalize each segment -> join (hard cuts via
 * concat, or transitions via an xfade chain) -> mix audio -> burn animated
 * captions -> H.264/AAC MP4.
 *
 * Three things here are worth knowing before you edit it:
 *
 * 1. NORMALIZE IS NOT OPTIONAL. The library mixes 9:16 and 16:9, 576x1024 to
 *    4K, and 23.976 to 150fps. Joining those without a normalize pass produces
 *    audio drift you only notice near the end, long after the render "worked".
 *
 * 2. TRANSITIONS SHORTEN THE TIMELINE. xfade overlaps two clips, so the output
 *    is sum(durations) - sum(transition durations). The builder prints the real
 *    output timeline per segment so captions can be placed against it.
 *
 * 3. CAPTIONS ARE ANIMATED via ASS override tags, not static. See CAPTION_ANIMS.
 *
 * Schema and a worked example: scripts/edl.example.json
 */

import { spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

/** This script's own directory, so bundled assets resolve wherever the EDL lives. */
const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * The two delivery formats the skill offers. `aspect` is the ergonomic way to
 * say it in an EDL; explicit `width`/`height` still win when something
 * off-spec is genuinely wanted.
 *
 * Both share a 1080px short edge, which is why the caption defaults scale off
 * the short edge rather than off the width. An 80px caption reads the same in
 * either frame - but the line LENGTH must not, because a line allowed to run
 * the full 1920 of a landscape frame is too wide for an eye to track.
 */
const ASPECTS = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
};

const DEFAULTS = {
  aspect: '9:16',
  fps: 30,
  fit: 'cover',
  cacheDir: '.adcache',
  workDir: '.adwork',
  transitionDuration: 0.4,
};

/**
 * Resolve the output frame. Precedence: explicit width+height, then `aspect`,
 * then the 9:16 default. A half-specified size (width but no height) is a typo
 * rather than an intent, so it stops here instead of quietly pairing with a
 * default and rendering the wrong shape.
 */
function resolveFrame(edl) {
  const hasW = edl.width != null, hasH = edl.height != null;
  if (hasW !== hasH) {
    die(`set both "width" and "height", or neither - got ${hasW ? `width=${edl.width}` : `height=${edl.height}`} alone. ` +
        `Simpler: "aspect": "9:16" or "16:9".`);
  }
  if (hasW) {
    const W = even(Number(edl.width)), H = even(Number(edl.height));
    if (!(W > 0 && H > 0)) die(`width/height must be positive numbers - got ${edl.width}x${edl.height}`);
    const named = Object.entries(ASPECTS).find(([, v]) => v.width === W && v.height === H);
    return { W, H, aspect: named ? named[0] : null };
  }

  const a = edl.aspect ?? DEFAULTS.aspect;
  if (!ASPECTS[a]) {
    die(`unknown aspect "${a}". Use ${Object.keys(ASPECTS).map(k => `"${k}"`).join(' or ')}, ` +
        `or set explicit "width" and "height".`);
  }
  return { W: ASPECTS[a].width, H: ASPECTS[a].height, aspect: a };
}

/**
 * Durations the skill offers: three presets, or any custom length up to a
 * minute. The tolerance is what makes the target useful - an ad that lands 2s
 * short of its slot is a re-render, and the cheapest place to catch that is
 * here rather than after upload.
 *
 * Past the ceiling nothing is refused - the builder is also used for Remotion
 * segments and re-cuts - but it says so, because over a minute the piece stops
 * being a paid-social ad and the duration should have been agreed with the
 * user rather than assumed.
 */
const PRESET_DURATIONS = [15, 20, 25];
const MAX_OFFERED_DURATION = 60;
const DURATION_TOLERANCE = 0.5;

const CAPTION_BANDS = { upper: 0.27, middle: 0.5, lower: 0.73 };

/**
 * Friendly transition names -> ffmpeg xfade transition names.
 *
 * `cut` is deliberately not an xfade: a hard cut is the correct join for a
 * testimonial, where jump cuts and match cuts carry the energy and a dissolve
 * would make it feel like a slideshow. Reach for the smooth family on product
 * promotional and problem/solution work instead.
 */
const TRANSITIONS = {
  cut: null,
  fade: 'fade',
  dissolve: 'dissolve',
  fadeblack: 'fadeblack',
  fadewhite: 'fadewhite',
  // Swipes - the workhorse for product promotional / problem-solution.
  swipeleft: 'slideleft',
  swiperight: 'slideright',
  swipeup: 'slideup',
  swipedown: 'slidedown',
  // Softer, eased-looking variants. Best default for "smooth".
  smoothleft: 'smoothleft',
  smoothright: 'smoothright',
  smoothup: 'smoothup',
  smoothdown: 'smoothdown',
  // Wipes and reveals.
  wipeleft: 'wipeleft',
  wiperight: 'wiperight',
  wipeup: 'wipeup',
  wipedown: 'wipedown',
  revealleft: 'revealleft',
  revealright: 'revealright',
  coverleft: 'coverleft',
  coverright: 'coverright',
  coverup: 'coverup',
  coverdown: 'coverdown',
  // Shape and scale - use sparingly, they draw attention to themselves.
  circleopen: 'circleopen',
  circleclose: 'circleclose',
  radial: 'radial',
  zoomin: 'zoomin',
  squeezeh: 'squeezeh',
  squeezev: 'squeezev',
  pixelize: 'pixelize',
  hblur: 'hblur',
};

/**
 * Simulated camera moves, applied within a single segment.
 *
 * These exist because a static frame held for three seconds is dead air in
 * vertical video, and because the grammar wants a way to add motion WITHOUT
 * cutting - the solution half of a problem/solution ad should relax and glide
 * where the problem half jabs. A push-in also rescues a clip that is composed
 * a little wide.
 *
 * `amount` is the extra scale travelled (0.10 = a 10% push). Keep it small:
 * past ~0.15 the move reads as a zoom effect rather than as camera language.
 */
const MOVES = {
  pushin: { grow: 1, pan: null },
  pullback: { grow: -1, pan: null },
  glideleft: { pan: 'x', panFrom: 1, panTo: 0 },
  glideright: { pan: 'x', panFrom: 0, panTo: 1 },
  glideup: { pan: 'y', panFrom: 1, panTo: 0 },
  glidedown: { pan: 'y', panFrom: 0, panTo: 1 },
};

const MOVE_DEFAULT_AMOUNT = 0.10;
// Oversample before zooming so a pushed-in frame still resolves at full
// output size instead of being upscaled from exactly 1080x1920.
const MOVE_OVERSAMPLE = 1.22;

/**
 * Build the zoompan filter for a segment move. Returns null for no move.
 *
 * Frame count is fixed up front (`frames`) so the move lands exactly at the
 * end of the segment - driving it off `t` instead lets a fractional final
 * frame overshoot and snap.
 */
function moveFilter(name, amount, frames, W, H, fps) {
  const m = MOVES[name];
  if (!m) return null;
  const amt = Number.isFinite(amount) ? Math.abs(amount) : MOVE_DEFAULT_AMOUNT;
  const last = Math.max(1, frames - 1);
  const p = `min(1,on/${last})`;

  let z;
  if (m.pan) {
    // A glide holds a constant slight crop and travels across it, so the
    // frame moves without appearing to zoom.
    z = (1 + amt).toFixed(4);
  } else if (m.grow > 0) {
    z = `1+${amt.toFixed(4)}*${p}`;
  } else {
    z = `${(1 + amt).toFixed(4)}-${amt.toFixed(4)}*${p}`;
  }

  const cx = 'iw/2-(iw/zoom/2)';
  const cy = 'ih/2-(ih/zoom/2)';
  let x = cx;
  let y = cy;
  if (m.pan === 'x') {
    const d = (m.panTo - m.panFrom).toFixed(4);
    x = `(iw-iw/zoom)*(${m.panFrom}+(${d})*${p})`;
  } else if (m.pan === 'y') {
    const d = (m.panTo - m.panFrom).toFixed(4);
    y = `(ih-ih/zoom)*(${m.panFrom}+(${d})*${p})`;
  }

  // Pin fps: zoompan re-times its output to its own fps option, which defaults
  // to 25, and a 25fps segment cannot be xfaded onto a 30fps neighbour.
  return `zoompan=z='${z}':x='${x}':y='${y}':d=1:s=${W}x${H}:fps=${fps}`;
}

/**
 * Caption animations, as ASS override-tag builders. libass renders these, so
 * they cost nothing extra at encode time.
 *
 * Static text on a moving image reads as a subtitle; animated text reads as
 * design. `fadeup` is the safe default for almost everything.
 */
const CAPTION_ANIMS = {
  none: (x, y) => `\\pos(${x},${y})`,
  fade: (x, y) => `\\fad(250,250)\\pos(${x},${y})`,
  fadeup: (x, y) => `\\fad(200,200)\\move(${x},${y + 45},${x},${y},0,320)`,
  fadedown: (x, y) => `\\fad(200,200)\\move(${x},${y - 45},${x},${y},0,320)`,
  slideleft: (x, y) => `\\fad(150,180)\\move(${x + 140},${y},${x},${y},0,300)`,
  slideright: (x, y) => `\\fad(150,180)\\move(${x - 140},${y},${x},${y},0,300)`,
  pop: (x, y) => `\\fad(120,160)\\pos(${x},${y})\\fscx82\\fscy82\\t(0,200,\\fscx100\\fscy100)`,
  punch: (x, y) => `\\fad(80,140)\\pos(${x},${y})\\fscx118\\fscy118\\t(0,160,\\fscx100\\fscy100)`,
};

// ---------------------------------------------------------------- utilities

/** libx264 rejects odd dimensions outright, so round to even. */
/**
 * Where a cover-crop sits inside the scaled source: 0 = left/top edge,
 * 0.5 = centre (the default), 1 = right/bottom edge. When a landscape clip
 * goes into a 9:16 frame (landscape clips), a cover
 * keeps only ~32% of the width - the anchor is how a segment keeps the worker
 * instead of empty ground.
 */
function cropPos(anchor, axis) {
  const a = anchor == null ? 0.5 : Math.min(1, Math.max(0, Number(anchor)));
  return axis === 'w' ? `(iw-ow)*${a.toFixed(3)}` : `(ih-oh)*${a.toFixed(3)}`;
}

function even(n) {
  return Math.max(2, Math.round(n / 2) * 2);
}

function die(msg) {
  console.error(`\n  ERROR  ${msg}\n`);
  process.exit(1);
}
function warn(msg) {
  console.error(`  warn   ${msg}`);
}
function info(msg) {
  console.log(`  ${msg}`);
}

function run(bin, args, opts = {}) {
  const r = spawnSync(bin, args, { encoding: 'utf8', ...opts });
  if (r.error) die(`could not run ${bin}: ${r.error.message}`);
  if (r.status !== 0) {
    const tail = (r.stderr || '').trim().split('\n').slice(-25).join('\n');
    die(`${bin} failed (exit ${r.status})\n\n${tail}`);
  }
  return r;
}

/**
 * Integrated loudness (LUFS) of a file's audio, via ffmpeg's EBU R128 meter.
 *
 * This exists so the music bed can be placed a specific number of dB under the
 * speech instead of at a guessed fixed gain. A guess cannot work: a generated
 * VO lands near -18 LUFS, a library music bed can arrive anywhere from -9 to
 * -30, and a creator's phone audio is its own thing entirely. Measuring both
 * and taking the difference is the only way "4 dB under the voice" means the
 * same thing on every render.
 *
 * Returns null if the file has no audio or the meter cannot parse - callers
 * fall back to a fixed gain and say so rather than failing the render.
 */
function measureLufs(input) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', input, '-af', 'ebur128', '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 1 << 24 });
  const text = `${r.stderr || ''}`;
  // The Summary block at the end carries the integrated figure; take the last
  // "I:  -xx.x LUFS" so a per-frame line can never be mistaken for it.
  const all = [...text.matchAll(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g)];
  if (!all.length) return null;
  const v = Number(all[all.length - 1][1]);
  return Number.isFinite(v) && v > -70 ? v : null;
}

function probeDuration(input) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', input], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const d = parseFloat((r.stdout || '').trim());
  return Number.isFinite(d) ? d : null;
}

function probeDims(input) {
  // Phone footage is often stored landscape with a 90-degree display matrix;
  // ffmpeg autorotates on decode, so the DISPLAYED size is what the crop sees.
  // Reading the coded width/height alone reports a portrait clip as 1920x1080.
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=width,height:stream_side_data=rotation', '-of', 'csv=p=0', input], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const [w, h, rot] = (r.stdout || '').trim().split(/\r?\n/)[0].split(',').map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  return Math.abs(rot) % 180 === 90 ? { w: h, h: w } : { w, h };
}

function hasAudioStream(input) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', input], { encoding: 'utf8' });
  return r.status === 0 && (r.stdout || '').includes('audio');
}

function fmtTime(sec) {
  const cs = Math.max(0, Math.round(sec * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

/** #RRGGBB -> ASS &HAABBGGRR (alpha 00 = fully opaque) */
function assColour(hex, alpha = '00') {
  const h = String(hex || '#FFFFFF').replace('#', '').trim();
  if (h.length !== 6) return `&H${alpha}FFFFFF`;
  return `&H${alpha}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
}

function assText(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\N').replace(/\{/g, '(').replace(/\}/g, ')');
}

// ---------------------------------------------------------------- fetching

async function fetchToFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) die(`download failed (${res.status}) for ${url}`);
  // Write to .part and rename, so an interrupted run never leaves a truncated
  // file in the cache that a later run would trust.
  const part = `${dest}.part`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(part));
  fs.renameSync(part, dest);
}

function readableMedia(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return r.status === 0 && Number(r.stdout.trim()) > 0;
}

async function materialise(src, cacheDir) {
  if (!/^https?:\/\//i.test(src)) {
    if (!fs.existsSync(src)) die(`local file not found: ${src}`);
    return path.resolve(src);
  }
  const key = crypto.createHash('sha1').update(src).digest('hex').slice(0, 16);
  const ext = (src.split('?')[0].match(/\.([a-z0-9]{2,4})$/i) || [, 'mp4'])[1].toLowerCase();
  const dest = path.join(cacheDir, `${key}.${ext}`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    if (readableMedia(dest)) {
      info(`cached   ${path.basename(dest)}`);
      return path.resolve(dest);
    }
    warn(`cached ${path.basename(dest)} is unreadable (interrupted download?) - fetching again`);
    fs.unlinkSync(dest);
  }
  info(`download ${src.slice(0, 76)}${src.length > 76 ? '...' : ''}`);
  await fetchToFile(src, dest);
  return path.resolve(dest);
}

// ---------------------------------------------------------------- captions

function buildAss(captions, style, W, H) {
  // Scale off the SHORT edge: a caption's legibility is set by its height
  // relative to the frame's height in portrait and by the same physical size
  // in landscape, and both delivery formats share a 1080 short edge.
  const short = Math.min(W, H);
  const landscape = W > H;

  // The side margin is the one value that must NOT be shared between the two
  // formats. Portrait wants a thin gutter so the line fills the narrow frame;
  // landscape needs a wide one, or a caption runs the full 1920 and the eye
  // cannot track it back to the start of the next line. ~26% each side keeps
  // the text column near 1000px - about the same reading width as portrait.
  const marginX = landscape ? Math.round(W * 0.26) : Math.round(W * 0.097);

  const st = {
    // Default face is the bundled Poppins (SIL OFL), staged into the work
    // directory below. For on-brand captions set captionStyle.font to the
    // brand's face (and primary/outline to its colours) and put the font
    // files in the brand cache's fonts/ dir, which the EDL's fontsDir points
    // at. A near-black outline holds on bright and dark footage alike.
    font: 'Poppins',
    fontSize: Math.round(short * 0.068),
    primary: '#FFFFFF',
    outline: '#111111',
    outlineWidth: Math.max(4, Math.round(short * 0.0055)),
    shadow: 2,
    bold: true,
    marginX,
    ...(style || {}),
  };

  const head = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.709',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    [
      'Style: Default', st.font, st.fontSize,
      assColour(st.primary), assColour(st.primary), assColour(st.outline), '&H80000000',
      st.bold ? -1 : 0, 0, 0, 0, 100, 100, 0, 0,
      1, st.outlineWidth, st.shadow, 5, st.marginX, st.marginX, 0, 1,
    ].join(','),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  // A caption is normally one event. `lines` makes it several, entering one
  // after another - the "slide in sequence" read for an ordered list of
  // benefits, where arriving all together would make them a paragraph rather
  // than a list. Each line gets its own entrance; they all leave together.
  const events = (captions || []).flatMap((c) => {
    const frac = CAPTION_BANDS[c.band] ?? CAPTION_BANDS.middle;
    const x = Math.round(W / 2);
    const animName = c.anim && CAPTION_ANIMS[c.anim] ? c.anim : 'fadeup';
    const colour = c.color ? `\\c${assColour(c.color)}` : '';

    // A hard cut-out is right when the next beat starts immediately: a fade
    // that outlives the shot it belongs to reads as a caption left on by
    // mistake, which is the commonest way burned-in text looks amateur.
    const decorate = (tags) =>
      c.exit === 'cut' ? tags.replace(/\\fad\((\d+),\d+\)/, '\\fad($1,0)') : tags;

    const lines = Array.isArray(c.lines) ? c.lines.map(String).filter((l) => l.trim()) : null;

    if (!lines || lines.length < 2) {
      const text = lines ? lines[0] : c.text;
      const y = Math.round(H * frac);
      const tags = decorate(CAPTION_ANIMS[animName](x, y));
      return [`Dialogue: 0,${fmtTime(c.start)},${fmtTime(c.end)},Default,,0,0,0,,{${tags}${colour}}${assText(text)}`];
    }

    const stagger = Number.isFinite(c.stagger) ? Math.max(0, c.stagger) : 0.14;
    const lh = Math.round(st.fontSize * 1.22);
    // Centre the stack on the band, so a three-line list sits where a
    // one-line caption would instead of drifting down the frame.
    const top = Math.round(H * frac - ((lines.length - 1) * lh) / 2);

    return lines.map((line, k) => {
      const y = top + k * lh;
      const tags = decorate(CAPTION_ANIMS[animName](x, y));
      return `Dialogue: 0,${fmtTime(c.start + k * stagger)},${fmtTime(c.end)},Default,,0,0,0,,{${tags}${colour}}${assText(line)}`;
    });
  });

  return [...head, ...events].join('\n') + '\n';
}

// ---------------------------------------------------------------- audio graph

/*
 * Split edits (J-cuts and L-cuts).
 *
 * The normal path chains each segment's audio to its own picture with
 * acrossfade, so sound and image are locked together. A split edit is exactly
 * the opposite: you hear the next clip before you see it (J-cut), or keep
 * hearing the last one after it has gone (L-cut). That cannot be expressed as
 * a chain, so when any segment asks for one we rebuild the clip audio as a
 * flat timeline instead - every clip's audio placed at its own start time and
 * mixed - and hand that to the final mix in place of the joined file's track.
 *
 * Audio is re-read from the SOURCE, not from the normalized segment, because
 * the whole point is to use audio the picture never shows.
 *
 * This runs for EVERY sync-dialogue cut, not only split edits, because it is
 * also measurably more accurate. Trimming a segment with `-ss` in front of
 * `-i` leaves the audio ~67ms ahead of its own picture - measured against an
 * unseeked decode of the same source - which is inside the range where a
 * viewer reads a talking head as out of sync. Trimming decoded samples with
 * atrim instead lands at 0.0ms. The acrossfade chain in the join step still
 * runs, but its audio is discarded in favour of this.
 *
 * Returns the path to a rendered clip-audio track, or null when no segment has
 * any audio to place.
 */
function buildClipAudioTimeline({ segMeta, timeline, trans, total, workDir, fadeDefault = 0.06 }) {
  const PREROLL = 0.5; // seconds decoded before the wanted audio and discarded in-filter

  const usable = segMeta
    .map((m, i) => ({ ...m, i }))
    .filter((m) => m.hasAudio);
  if (!usable.length) return null;

  const inputs = [];
  const chains = [];
  const mixLabels = [];

  usable.forEach((m, n) => {
    const from = Math.max(0, m.tIn - m.lead);
    const len = m.lead + m.dur + m.tail;
    // Where the sound lands relative to the picture: the clip's video starts at
    // timeline[i].start, so its audio starts `lead` seconds before that.
    const at = Math.max(0, timeline[m.i].start - m.lead);

    // Seek a little EARLY and drop the excess inside the filter graph, rather
    // than trusting the demuxer to land on the exact sample. Seeking straight
    // to `from` leaves the decoder's priming samples in front of the audio,
    // which measured ~45ms of drift against the picture - harmless on b-roll,
    // but on a talking head that is the difference between a split edit and a
    // sync error. atrim works on decoded samples, so the offset is exact.
    const seekAt = Math.max(0, from - PREROLL);
    const skip = from - seekAt;
    inputs.push('-accurate_seek', '-ss', seekAt.toFixed(3), '-t', (skip + len + 0.25).toFixed(3), '-i', m.src);

    // Ramp lengths. A transition crossfades the picture, so the audio under it
    // should cross over the same span or the sound arrives before the image
    // settles. A split edit ramps over its own lead/tail. Everything else gets
    // a short ramp purely to stop two summed tracks clicking at the seam.
    const inTrans = trans?.[m.i]?.dur ?? 0;
    const outTrans = trans?.[m.i + 1]?.dur ?? 0;
    const fin = m.lead > 0 ? Math.min(fadeDefault * 2, m.lead) : Math.max(fadeDefault, inTrans);
    const fout = m.tail > 0 ? Math.min(fadeDefault * 2, m.tail) : Math.max(fadeDefault, outTrans);
    const fadeOutStart = Math.max(0, len - fout);
    const d = Math.round(at * 1000);

    chains.push(
      `[${n}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,` +
      `atrim=start=${skip.toFixed(3)}:end=${(skip + len).toFixed(3)},asetpts=PTS-STARTPTS,` +
      `afade=t=in:st=0:d=${fin.toFixed(3)},` +
      `afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fout.toFixed(3)},` +
      `adelay=${d}|${d}[ca${n}]`
    );
    mixLabels.push(`[ca${n}]`);
  });

  // normalize=0 keeps each clip at its own level instead of dividing by the
  // input count - otherwise adding a one-second L-cut tail would duck the
  // entire rest of the ad.
  chains.push(
    `${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=longest:normalize=0,` +
    `apad,atrim=0:${total.toFixed(3)}[caout]`
  );

  const out = path.join(workDir, 'clipaudio.m4a');
  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    ...inputs,
    '-filter_complex', chains.join(';'),
    '-map', '[caout]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    out,
  ]);

  for (const m of usable) {
    if (m.lead > 0) info(`  J-cut  ${m.label}: audio leads picture by ${m.lead.toFixed(2)}s`);
    if (m.tail > 0) info(`  L-cut  ${m.label}: audio holds ${m.tail.toFixed(2)}s past the cut`);
  }
  return out;
}

function buildAudioFilter(cfg, total) {
  const { vo, music, duck, duckDb, voGainDb, musicGainDb, voDelay, fadeOut, loudnorm, lufs, clipAudioLabel } = cfg;
  const parts = [];
  const AF = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';

  if (!vo && !music && !clipAudioLabel) return null;

  if (vo) {
    const d = Math.max(0, Math.round(voDelay * 1000));
    parts.push(`[${vo.idx}:a]${AF},adelay=${d}|${d},volume=${voGainDb}dB,apad,atrim=0:${total}${music && duck ? ',asplit=2[vo1][vo2]' : '[vo1]'}`);
  }
  if (music) {
    const fadeStart = Math.max(0, total - fadeOut);
    parts.push(`[${music.idx}:a]${AF},volume=${musicGainDb}dB,apad,atrim=0:${total},afade=t=out:st=${fadeStart.toFixed(3)}:d=${fadeOut}[bed]`);
  }

  const stack = [];
  if (clipAudioLabel) stack.push(clipAudioLabel);

  if (vo && music) {
    if (duck) {
      parts.push(`[bed][vo2]sidechaincompress=threshold=0.03:ratio=${Math.max(2, Math.abs(duckDb))}:attack=15:release=280:makeup=1[duckedbed]`);
      stack.push('[duckedbed]', '[vo1]');
    } else {
      stack.push('[bed]', '[vo1]');
    }
  } else if (vo) {
    stack.push('[vo1]');
  } else if (music) {
    stack.push('[bed]');
  }

  if (stack.length === 1) {
    parts.push(`${stack[0]}anull[premix]`);
  } else {
    parts.push(`${stack.join('')}amix=inputs=${stack.length}:duration=first:normalize=0[premix]`);
  }

  // Normalize the finished mix. Without this the ad plays at whatever level
  // the VO happened to be generated at, and an ad that is quieter than the
  // clip before it in the feed gets scrolled past before the hook lands.
  parts.push(loudnorm ? `[premix]loudnorm=I=${lufs}:TP=-1.5:LRA=11[aout]` : `[premix]anull[aout]`);
  return parts.join(';');
}

// ---------------------------------------------------------------- main

async function main() {
  const edlPath = process.argv[2];
  if (!edlPath) die('usage: node build_ad.mjs <edl.json>');
  if (!fs.existsSync(edlPath)) die(`EDL not found: ${edlPath}`);

  let edl;
  try {
    edl = JSON.parse(fs.readFileSync(edlPath, 'utf8'));
  } catch (e) {
    die(`EDL is not valid JSON: ${e.message}`);
  }

  const { W, H, aspect } = resolveFrame(edl);
  const FPS = edl.fps ?? DEFAULTS.fps;
  info(`output ${W}x${H}${aspect ? ` (${aspect})` : ''} @ ${FPS}fps`);
  const base = path.dirname(path.resolve(edlPath));
  const cacheDir = path.resolve(base, edl.cacheDir ?? DEFAULTS.cacheDir);
  const workDir = path.resolve(base, edl.workDir ?? DEFAULTS.workDir);
  const output = path.resolve(base, edl.output ?? 'out/ad.mp4');

  if (!Array.isArray(edl.segments) || edl.segments.length === 0) die('EDL has no segments');

  const target = edl.targetDuration ?? null;
  if (target !== null) {
    if (!(Number.isFinite(target) && target > 0)) {
      die(`targetDuration must be a positive number of seconds, got ${JSON.stringify(target)}`);
    } else if (target > MAX_OFFERED_DURATION) {
      warn(
        `targetDuration ${target}s is over the ${MAX_OFFERED_DURATION}s the skill offers - ` +
        `confirm the length with the user before delivering this`
      );
    } else if (!PRESET_DURATIONS.includes(target)) {
      info(`custom length ${target}s (presets are ${PRESET_DURATIONS.join('/')}s)`);
    }
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  // Windows refuses to start a process whose working directory is past
  // MAX_PATH (260 chars), and the join and encode steps both run ffmpeg with
  // cwd set to workDir so the filter graphs can use basenames. Left alone the
  // failure surfaces as an ENOENT naming ffmpeg, which reads as a missing
  // install and sends you reinstalling an ffmpeg that was fine all along.
  if (process.platform === 'win32' && workDir.length > 240) {
    die([
      `work directory path is ${workDir.length} characters, past the 260 Windows allows`,
      '  for a process working directory:',
      '',
      `    ${workDir}`,
      '',
      '  Set a shorter "workDir" in the EDL - "C:/adwork" works - or move the EDL',
      '  somewhere shallower.',
    ].join('\n'));
  }

  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });

  // Stage the bundled brand fonts where libass will look. Without this, a font
  // name that is not installed on the machine is substituted SILENTLY - the
  // render succeeds and ships in the wrong face, which nobody notices until the
  // ad is live. Copying them costs milliseconds and removes the whole class of
  // bug, and it is why the skill can promise on-brand captions with no install.
  // Bundled Poppins first, then the brand's own fonts (edl.fontsDir) so a brand
  // file wins on a name clash.
  const fontsDir = path.join(workDir, 'fonts');
  fs.mkdirSync(fontsDir, { recursive: true });
  let stagedFonts = 0;
  for (const fontsSrc of [path.resolve(HERE, '..', 'assets', 'fonts'), edl.fontsDir ? path.resolve(edl.fontsDir) : null]) {
    if (!fontsSrc || !fs.existsSync(fontsSrc)) continue;
    for (const f of fs.readdirSync(fontsSrc)) {
      if (!/\.(ttf|otf|ttc)$/i.test(f)) continue;
      fs.copyFileSync(path.join(fontsSrc, f), path.join(fontsDir, f));
      stagedFonts++;
    }
  }
  if (!stagedFonts) warn('no fonts staged - captions will fall back to whatever is installed, which may not be the brand face');
  fs.mkdirSync(path.dirname(output), { recursive: true });

  const audioCfg = edl.audio || {};
  const keepClipAudio = audioCfg.keepClipAudio === true;

  // ---- 1. sources ------------------------------------------------------
  console.log('\n[1/5] sources');
  const resolved = [];
  for (const seg of edl.segments) {
    const src = seg.url || seg.file;
    if (!src) die(`segment ${JSON.stringify(seg.clipSymbol ?? '')} has no url or file`);
    resolved.push(await materialise(src, cacheDir));
  }

  // ---- 2. normalize ----------------------------------------------------
  console.log('\n[2/5] normalize segments');
  const segFiles = [];
  const durations = [];
  // Kept so the J/L-cut pass can re-read each segment's audio from the SOURCE
  // over a wider window than its video trim - a split edit needs audio the
  // picture never shows, which the normalized seg files no longer contain.
  const segMeta = [];

  for (let i = 0; i < edl.segments.length; i++) {
    const seg = edl.segments[i];
    const src = resolved[i];
    const label = seg.clipSymbol || path.basename(src);

    const srcDur = probeDuration(src);
    const tIn = Math.max(0, Number(seg.in ?? 0));
    let tOut = Number(seg.out ?? (srcDur ?? 0));
    if (srcDur != null && tOut > srcDur + 0.01) {
      warn(`${label}: out=${tOut.toFixed(2)}s exceeds source length ${srcDur.toFixed(2)}s - clamping`);
      tOut = srcDur;
    }
    const dur = tOut - tIn;
    if (!(dur > 0.05)) die(`${label}: segment duration is ${dur.toFixed(3)}s - check in/out points`);

    const fit = seg.fit || edl.fit || DEFAULTS.fit;

    // A move zooms into the frame, so render the intermediate larger than the
    // output and let zoompan scale down - otherwise the push-in is an upscale
    // of a 1080-wide frame and visibly softens.
    const moveName = seg.move && seg.move !== 'none' ? String(seg.move) : null;
    if (moveName && !MOVES[moveName]) {
      die(`${label}: unknown move "${moveName}". Use one of: ${Object.keys(MOVES).join(', ')}`);
    }
    const frames = Math.max(1, Math.round(dur * FPS));
    const mf = moveName ? moveFilter(moveName, seg.moveAmount, frames, W, H, FPS) : null;
    const SW = mf ? even(W * MOVE_OVERSAMPLE) : W;
    const SH = mf ? even(H * MOVE_OVERSAMPLE) : H;

    // blurfill: the whole source, sharp and centred, over a blurred cover-crop
    // of itself. The right treatment for a vertical UGC clip in a 16:9 ad (or
    // the reverse) when cropping would cut off the face or the box - black
    // bars read as a mistake, a blurred fill reads as a choice.
    const scaleCrop = fit === 'contain'
      ? [`scale=${SW}:${SH}:force_original_aspect_ratio=decrease`, `pad=${SW}:${SH}:(ow-iw)/2:(oh-ih)/2:color=black`]
      : fit === 'blurfill'
        ? [`split=2[bgx][fgx];[bgx]scale=${SW}:${SH}:force_original_aspect_ratio=increase,crop=${SW}:${SH},boxblur=luma_radius=40:luma_power=2,eq=brightness=-0.06[bgy];` +
           `[fgx]scale=${SW}:${SH}:force_original_aspect_ratio=decrease[fgy];[bgy][fgy]overlay=(W-w)/2:(H-h)/2`]
        : [`scale=${SW}:${SH}:force_original_aspect_ratio=increase`, `crop=${SW}:${SH}:${cropPos(seg.anchorX, 'w')}:${cropPos(seg.anchorY, 'h')}`];

    // Orientation mismatch is the single most common way a good clip pick
    // produces a bad frame, and it is silent - ffmpeg crops happily. Quantify
    // how much of the source is being thrown away so the size of the problem
    // is visible: trimming 8% off the sides of a wide shot is fine, losing 44%
    // of a portrait clip to fill a landscape frame usually is not.
    const dims = probeDims(src);
    if (dims && fit !== 'contain' && fit !== 'blurfill') {
      const srcAR = dims.w / dims.h, outAR = W / H;
      const kept = srcAR > outAR ? outAR / srcAR : srcAR / outAR; // fraction of the long axis retained
      const lostPct = Math.round((1 - kept) * 100);
      if (lostPct >= 25 && seg.anchorX != null) {
        info(`   ${label}: ${lostPct}% cropped off the ${srcAR > outAR ? "sides" : "top and bottom"}, anchorX ${Number(seg.anchorX).toFixed(2)} - check the subject stays in frame`);
      } else if (lostPct >= 25) {
        const axis = srcAR > outAR ? 'sides' : 'top and bottom';
        warn(`${label}: ${dims.w}x${dims.h} source into a ${W}x${H} frame loses ${lostPct}% off the ${axis}. ` +
             `Set "anchorX" (0 = left, 1 = right) so the crop keeps the subject, or "fit": "blurfill" to show the whole frame.`);
      } else if (lostPct >= 8) {
        warn(`${label}: ${dims.w}x${dims.h} centre-cropped to ${W}x${H} (${lostPct}% trimmed) - check the subject is centred`);
      }
    }

    const out = path.join(workDir, `seg${String(i).padStart(3, '0')}.mp4`);
    const args = [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-accurate_seek', '-ss', tIn.toFixed(3),
      '-i', src,
      '-t', dur.toFixed(3),
      '-vf', [...scaleCrop, `fps=${FPS}`, ...(mf ? [mf] : []), 'setsar=1', 'format=yuv420p'].join(','),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
      '-video_track_timescale', String(FPS * 1000),
    ];
    if (keepClipAudio && hasAudioStream(src)) {
      args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2');
    } else {
      args.push('-an');
    }
    args.push(out);

    run('ffmpeg', args);
    info(`${String(i + 1).padStart(2)}. ${label.padEnd(30)} ${tIn.toFixed(2)} -> ${tOut.toFixed(2)}  (${dur.toFixed(2)}s)${mf ? `  move:${moveName}` : ''}`);
    segFiles.push(out);
    durations.push(dur);

    // Split-edit windows. `audioLead` (J-cut) pulls this clip's audio EARLIER
    // than its picture; `audioTail` (L-cut) holds it after the picture cuts
    // away. Both are clamped to what the source actually has, and the clamp is
    // reported - silently shortening a lead turns a deliberate J-cut into a
    // plain cut, which is invisible until someone watches the render.
    const wantLead = Math.max(0, Number(seg.audioLead ?? 0));
    const wantTail = Math.max(0, Number(seg.audioTail ?? 0));
    const lead = Math.min(wantLead, tIn);
    const tail = srcDur != null ? Math.min(wantTail, Math.max(0, srcDur - tOut)) : wantTail;
    if (wantLead > 0 && lead < wantLead - 0.005) {
      warn(`${label}: audioLead ${wantLead.toFixed(2)}s clamped to ${lead.toFixed(2)}s - only ${tIn.toFixed(2)}s of source exists before in=${tIn.toFixed(2)}`);
    }
    if (wantTail > 0 && tail < wantTail - 0.005) {
      warn(`${label}: audioTail ${wantTail.toFixed(2)}s clamped to ${tail.toFixed(2)}s - source ends at ${(srcDur ?? 0).toFixed(2)}s`);
    }
    if ((wantLead > 0 || wantTail > 0) && !keepClipAudio) {
      warn(`${label}: audioLead/audioTail set but audio.keepClipAudio is false - a split edit needs the clips' own audio, so this has no effect`);
    }
    if ((wantLead > 0 || wantTail > 0) && !hasAudioStream(src)) {
      warn(`${label}: audioLead/audioTail set but this clip has no audio stream - nothing to lead or hold`);
    }
    segMeta.push({ src, tIn, tOut, dur, lead, tail, label, hasAudio: hasAudioStream(src) });
  }

  // ---- 3. join ---------------------------------------------------------
  // Transition on segment i describes how segment i ENTERS (i.e. the join
  // between i-1 and i). Segment 0 cannot have one.
  const trans = edl.segments.map((seg, i) => {
    if (i === 0) return { name: 'cut', xfade: null, dur: 0 };
    const raw = seg.transition;
    if (!raw || raw === 'cut') return { name: 'cut', xfade: null, dur: 0 };
    const name = typeof raw === 'string' ? raw : raw.type;
    if (!(name in TRANSITIONS)) {
      die(`segment ${i} has unknown transition "${name}". Known: ${Object.keys(TRANSITIONS).join(', ')}`);
    }
    const xfade = TRANSITIONS[name];
    if (!xfade) return { name: 'cut', xfade: null, dur: 0 };
    let dur = typeof raw === 'string' ? DEFAULTS.transitionDuration : (raw.duration ?? DEFAULTS.transitionDuration);
    // An xfade cannot be longer than either side of the join, and eats into
    // both - cap it so a short segment cannot be swallowed whole.
    const cap = Math.min(durations[i], durations[i - 1]) * 0.6;
    if (dur > cap) {
      warn(`segment ${i}: transition ${dur.toFixed(2)}s too long for neighbouring clips - capping to ${cap.toFixed(2)}s`);
      dur = cap;
    }
    return { name, xfade, dur };
  });

  const anyTransition = trans.some((t) => t.xfade);
  const totalTransition = trans.reduce((a, t) => a + t.dur, 0);
  const totalRaw = durations.reduce((a, d) => a + d, 0);
  const total = Number((totalRaw - totalTransition).toFixed(3));

  console.log(`\n[3/5] join  (${anyTransition ? 'xfade chain' : 'hard cuts'})`);

  // Output timeline, so captions can be placed against what the viewer sees.
  let cursor = 0;
  const timeline = [];
  for (let i = 0; i < durations.length; i++) {
    const start = i === 0 ? 0 : cursor - trans[i].dur;
    const end = start + durations[i];
    timeline.push({ label: edl.segments[i].clipSymbol || `seg${i}`, start, end, trans: trans[i].name });
    cursor = end;
  }
  for (const t of timeline) {
    info(`${t.start.toFixed(2).padStart(6)} - ${t.end.toFixed(2).padStart(6)}  ${t.trans === 'cut' ? 'cut ' : t.trans.padEnd(11)} ${t.label}`);
  }
  console.log(`\n       picture: ${total.toFixed(2)}s` + (totalTransition > 0 ? `  (${totalRaw.toFixed(2)}s of clips minus ${totalTransition.toFixed(2)}s of overlap)` : ''));

  if (target !== null && Math.abs(total - target) > DURATION_TOLERANCE) {
    warn(`runtime ${total.toFixed(2)}s misses the ${target}s target by ${(total - target).toFixed(2)}s`);
  }

  // Split edits, if any segment asked for one. Built against the timeline
  // above, so it has to come after it - and it replaces the joined file's own
  // audio track rather than adding to it.
  const splitAudio = keepClipAudio
    ? buildClipAudioTimeline({ segMeta, timeline, trans, total, workDir })
    : null;

  const joined = path.join(workDir, 'joined.mp4');

  if (!anyTransition) {
    fs.writeFileSync(path.join(workDir, 'concat.txt'), segFiles.map((f) => `file '${path.basename(f)}'`).join('\n') + '\n', 'utf8');
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', 'joined.mp4'], { cwd: workDir });
  } else {
    // Chain xfades. offset_k = (length of chain so far) - transition duration.
    //
    // Every stream is put on one explicit timebase first. Two filters here
    // disagree about timebases by default: xfade keeps its inputs', while
    // concat rewrites its output to AV_TIME_BASE (1/1000000). So an EDL that
    // mixes smooth joins with a hard cut in the middle - a problem/solution
    // ad, where the pivot swipes but the beats inside a section cut - dies
    // with "do not match the corresponding second input link" unless the
    // timebase is pinned after each concat as well as on every input.
    const VTB = `1/${FPS * 1000}`;
    const ATB = '1/48000';

    const args = ['-hide_banner', '-loglevel', 'error', '-y'];
    segFiles.forEach((f) => args.push('-i', path.basename(f)));

    const chains = [];
    for (let i = 0; i < segFiles.length; i++) {
      chains.push(`[${i}:v]settb=${VTB},setpts=PTS-STARTPTS[nv${i}]`);
      if (keepClipAudio) chains.push(`[${i}:a]asettb=${ATB},asetpts=PTS-STARTPTS[na${i}]`);
    }

    let vprev = '[nv0]';
    let aprev = keepClipAudio ? '[na0]' : null;
    let chainLen = durations[0];

    for (let i = 1; i < segFiles.length; i++) {
      const t = trans[i];
      const last = i === segFiles.length - 1;
      const vout = last ? '[vjoin]' : `[v${i}]`;
      const aout = last ? '[ajoin]' : `[a${i}]`;

      if (t.xfade) {
        const offset = Math.max(0, chainLen - t.dur);
        chains.push(`${vprev}[nv${i}]xfade=transition=${t.xfade}:duration=${t.dur.toFixed(3)}:offset=${offset.toFixed(3)}${vout}`);
        if (aprev) {
          chains.push(`${aprev}[na${i}]acrossfade=d=${t.dur.toFixed(3)}:c1=tri:c2=tri${aout}`);
          aprev = aout;
        }
        chainLen = chainLen + durations[i] - t.dur;
      } else {
        // A hard cut inside an xfade chain: concat, then restore the timebase
        // concat just threw away, or the next xfade in the chain refuses it.
        if (aprev) {
          chains.push(`${vprev}${aprev}[nv${i}][na${i}]concat=n=2:v=1:a=1[cv${i}][ca${i}]`);
          chains.push(`[cv${i}]settb=${VTB}${vout}`);
          chains.push(`[ca${i}]asettb=${ATB}${aout}`);
          aprev = aout;
        } else {
          chains.push(`${vprev}[nv${i}]concat=n=2:v=1:a=0[cv${i}]`);
          chains.push(`[cv${i}]settb=${VTB}${vout}`);
        }
        chainLen = chainLen + durations[i];
      }
      vprev = vout;
    }

    args.push('-filter_complex', chains.join(';'), '-map', '[vjoin]');
    if (keepClipAudio) args.push('-map', '[ajoin]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000');
    else args.push('-an');
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), 'joined.mp4');

    run('ffmpeg', args, { cwd: workDir });
  }
  info(`joined.mp4  ${(probeDuration(joined) ?? 0).toFixed(2)}s`);

  // ---- 4. captions -----------------------------------------------------
  console.log('\n[4/5] captions');
  const caps = edl.captions || [];
  let assFile = null;
  if (caps.length) {
    for (const c of caps) {
      if (c.end <= c.start) die(`caption "${String(c.text).slice(0, 30)}" has end <= start`);
      if (c.end > total + 0.05) warn(`caption "${String(c.text).slice(0, 28)}" ends at ${c.end}s, past the ${total.toFixed(2)}s cut`);
      if (c.anim && !CAPTION_ANIMS[c.anim]) warn(`caption anim "${c.anim}" unknown - falling back to fadeup. Known: ${Object.keys(CAPTION_ANIMS).join(', ')}`);
    }
    assFile = path.join(workDir, 'captions.ass');
    fs.writeFileSync(assFile, buildAss(caps, edl.captionStyle, W, H), 'utf8');
    const used = [...new Set(caps.map((c) => (c.anim && CAPTION_ANIMS[c.anim] ? c.anim : 'fadeup')))];
    info(`${caps.length} caption${caps.length === 1 ? '' : 's'}, animated: ${used.join(', ')}`);
  } else {
    warn('no captions - most of this audience watches muted');
  }

  // ---- 5. mix and encode -----------------------------------------------
  console.log('\n[5/5] mix and encode');
  const inputs = ['-i', 'joined.mp4'];
  let idx = 1;
  const srcs = {};
  const voSpec = audioCfg.voiceover;
  const musicSpec = audioCfg.music;

  if (voSpec?.file) {
    const p = path.resolve(base, voSpec.file);
    if (!fs.existsSync(p)) die(`voiceover file not found: ${p}`);
    inputs.push('-i', p);
    srcs.vo = { idx: idx++ };
  }
  if (musicSpec?.file) {
    const p = path.resolve(base, musicSpec.file);
    if (!fs.existsSync(p)) die(`music file not found: ${p}`);
    const md = probeDuration(p);
    if (md != null && md < total - 0.2) warn(`music is ${md.toFixed(1)}s but the ad is ${total.toFixed(1)}s - the tail will be silent`);
    inputs.push('-i', p);
    srcs.music = { idx: idx++ };
  }

  // A split-edit track supersedes the joined file's own audio: it already
  // contains every clip's sound, just placed against the picture rather than
  // locked to it. Mixing both would double every line.
  let clipAudioLabel = keepClipAudio ? '[0:a]' : null;
  if (splitAudio) {
    inputs.push('-i', splitAudio);
    clipAudioLabel = `[${idx++}:a]`;
  }
  const voGainDb = voSpec?.gainDb ?? 0;

  /*
   * Place the bed a fixed number of dB under the speech - default 4.
   *
   * The speech reference is whichever track actually carries the words: the
   * voiceover file when there is one, otherwise the clips' own dialogue on a
   * mashup or sync testimonial. Both are measured, because "4 dB under" is a
   * relationship between two real levels and a fixed gain can only approximate
   * it for one particular pair of files.
   *
   * An explicit `music.gainDb` overrides this entirely - that is the escape
   * hatch for a bed that needs to sit somewhere else - but it is reported, so
   * a deliberate override never looks like the rule silently not running.
   */
  const musicOffsetDb = musicSpec?.offsetDb ?? -4;
  let musicGainDb = musicSpec?.gainDb;
  if (musicSpec?.file && musicGainDb == null) {
    // On a split edit the joined file's audio is not what the viewer hears -
    // the rebuilt track is - so measure that, or the 4dB rule is computed
    // against a track the render discards.
    const speechSrc = voSpec?.file ? path.resolve(base, voSpec.file)
      : splitAudio ? splitAudio
      : (keepClipAudio && hasAudioStream(joined) ? joined : null);
    const speechLufs = speechSrc ? measureLufs(speechSrc) : null;
    const musicLufs = measureLufs(path.resolve(base, musicSpec.file));

    if (speechLufs != null && musicLufs != null) {
      const target = speechLufs + voGainDb + musicOffsetDb;
      musicGainDb = Math.max(-40, Math.min(10, +(target - musicLufs).toFixed(1)));
      info(`music bed: speech ${(speechLufs + voGainDb).toFixed(1)} LUFS, bed ${musicLufs.toFixed(1)} LUFS ` +
           `-> ${musicGainDb >= 0 ? '+' : ''}${musicGainDb}dB so the bed sits ${Math.abs(musicOffsetDb)}dB under the voice`);
    } else {
      musicGainDb = -20;
      warn(`could not measure ${speechLufs == null ? 'the speech' : 'the music'} level - ` +
           `falling back to a fixed ${musicGainDb}dB bed instead of the ${Math.abs(musicOffsetDb)}dB-under-voice rule. ` +
           `Check the mix by ear before delivering.`);
    }
  } else if (musicSpec?.file) {
    info(`music bed: explicit gainDb ${musicGainDb}dB (overrides the ${Math.abs(musicOffsetDb)}dB-under-voice default)`);
  }

  const audioFilter = buildAudioFilter({
    vo: srcs.vo,
    music: srcs.music,
    duck: musicSpec?.duck !== false,
    duckDb: musicSpec?.duckDb ?? -9,
    voGainDb,
    musicGainDb: musicGainDb ?? -20,
    voDelay: voSpec?.delay ?? 0.2,
    fadeOut: musicSpec?.fadeOut ?? 1.0,
    loudnorm: audioCfg.loudnorm !== false,
    lufs: audioCfg.targetLufs ?? -14,
    clipAudioLabel,
  }, total);

  const chains = [];
  if (assFile) chains.push(`[0:v]subtitles=captions.ass:fontsdir=fonts[vout]`);
  if (audioFilter) chains.push(audioFilter);

  const args = ['-hide_banner', '-loglevel', 'error', '-y', ...inputs];
  if (chains.length) args.push('-filter_complex', chains.join(';'));
  args.push('-map', assFile ? '[vout]' : '0:v');

  if (audioFilter) args.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000');
  else { args.push('-an'); warn('rendering with no audio track'); }

  args.push(
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.2',
    '-r', String(FPS), '-t', total.toFixed(3),
    '-movflags', '+faststart', output,
  );
  run('ffmpeg', args, { cwd: workDir });

  const finalDur = probeDuration(output);
  const sizeMb = (fs.statSync(output).size / 1e6).toFixed(2);
  console.log(`\n  done   ${output}`);
  console.log(`         ${W}x${H} @ ${FPS}fps  ${finalDur ? finalDur.toFixed(2) : '?'}s  ${sizeMb} MB\n`);

  if (finalDur != null && target !== null && Math.abs(finalDur - target) > DURATION_TOLERANCE) {
    warn(`final duration ${finalDur.toFixed(2)}s is off the ${target}s target - fix before delivering\n`);
  }
}

main().catch((e) => die(e?.stack || String(e)));

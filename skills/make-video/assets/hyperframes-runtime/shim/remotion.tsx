// A Remotion-compatible surface over Preact, so the animation library (src/) runs inside HyperFrames.
// HyperFrames seeks a paused timeline frame by frame; the runner (runner.tsx) renders each scene for one frame at a
// time and these hooks read that frame. Only what the library uses is here - same names, same behaviour.
import {createContext, h} from 'preact';
import {useContext} from 'preact/hooks';
import type {ComponentChildren, JSX} from 'preact';

// ------------------------------------------------------------------ frame and config

export const FrameCtx = createContext(0);
export type VideoConfig = {width: number; height: number; fps: number; durationInFrames: number; id: string};
export const ConfigCtx = createContext<VideoConfig>({width: 1080, height: 1920, fps: 30, durationInFrames: 1, id: 'scene'});
export const useCurrentFrame = () => useContext(FrameCtx);
export const useVideoConfig = () => useContext(ConfigCtx);

// ------------------------------------------------------------------ easing and interpolation

type Ease = (t: number) => number;
const bezier = (x1: number, y1: number, x2: number, y2: number): Ease => {
  // cubic-bezier(x1,y1,x2,y2): solve x(t) = x by Newton, then bisection as a fallback
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t, sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x; if (Math.abs(e) < 1e-6) return sy(t); const d = dx(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
    let lo = 0, hi = 1; t = x;
    for (let i = 0; i < 30; i++) { const v = sx(t); if (Math.abs(v - x) < 1e-6) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return sy(t);
  };
};
export const Easing = {
  linear: (t: number) => t,
  quad: (t: number) => t * t,
  cubic: (t: number) => t * t * t,
  sin: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  bezier,
  in: (e: Ease) => e,
  out: (e: Ease) => (t: number) => 1 - e(1 - t),
  inOut: (e: Ease) => (t: number) => (t < 0.5 ? e(t * 2) / 2 : 1 - e((1 - t) * 2) / 2),
};

type Extrap = 'clamp' | 'extend' | 'identity';
type InterpOpts = {easing?: Ease; extrapolateLeft?: Extrap; extrapolateRight?: Extrap};
export const interpolate = (x: number, input: readonly number[], output: readonly number[], o: InterpOpts = {}): number => {
  const n = input.length;
  if (n !== output.length || n < 2) throw new Error('interpolate: input and output ranges need the same length (2+)');
  let i = 1;
  while (i < n - 1 && x > input[i]) i++;
  const a = input[i - 1], b = input[i];
  let t = b === a ? 0 : (x - a) / (b - a);
  if (t < 0 && x < input[0]) { if ((o.extrapolateLeft ?? 'extend') === 'clamp') t = 0; else if (o.extrapolateLeft === 'identity') return x; }
  if (t > 1 && x > input[n - 1]) { if ((o.extrapolateRight ?? 'extend') === 'clamp') t = 1; else if (o.extrapolateRight === 'identity') return x; }
  const e = o.easing && t >= 0 && t <= 1 ? o.easing(t) : t;
  return output[i - 1] + (output[i] - output[i - 1]) * e;
};

const parseColor = (c: string): [number, number, number, number] => {
  c = c.trim();
  if (c[0] === '#') {
    let x = c.slice(1);
    if (x.length === 3 || x.length === 4) x = [...x].map((k) => k + k).join('');
    const v = (k: number) => parseInt(x.slice(k, k + 2), 16);
    return [v(0), v(2), v(4), x.length === 8 ? v(6) / 255 : 1];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) { const p = m[1].split(',').map((s) => parseFloat(s)); return [p[0], p[1], p[2], p[3] ?? 1]; }
  return [0, 0, 0, 1];
};
export const interpolateColors = (x: number, input: readonly number[], colors: readonly string[]) => {
  const cs = colors.map(parseColor);
  const ch = (k: number) => interpolate(x, input, cs.map((c) => c[k]), {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return `rgba(${Math.round(ch(0))}, ${Math.round(ch(1))}, ${Math.round(ch(2))}, ${+ch(3).toFixed(3)})`;
};

// ------------------------------------------------------------------ spring (damped harmonic oscillator, 0 -> 1, at rest)

type SpringConfig = {damping?: number; stiffness?: number; mass?: number; overshootClamping?: boolean};
export const spring = ({frame, fps, config = {}, from = 0, to = 1, durationInFrames}: {frame: number; fps: number; config?: SpringConfig; from?: number; to?: number; durationInFrames?: number}) => {
  const m = config.mass ?? 1, k = config.stiffness ?? 100, c = config.damping ?? 10;
  let t = Math.max(0, frame) / fps;
  if (durationInFrames) t *= settleTime(m, k, c) / (durationInFrames / fps); // stretched to finish in durationInFrames
  const x = springAt(t, m, k, c);
  const v = config.overshootClamping ? Math.min(1, x) : x;
  return from + (to - from) * v;
};
const springAt = (t: number, m: number, k: number, c: number) => {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(k / m), z = c / (2 * Math.sqrt(k * m));
  if (z < 1) { const wd = w0 * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t)); }
  if (z === 1) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  const r1 = -w0 * (z - Math.sqrt(z * z - 1)), r2 = -w0 * (z + Math.sqrt(z * z - 1));
  return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
};
const settleTime = (m: number, k: number, c: number) => {
  for (let t = 0.01; t < 20; t += 0.01) {
    let ok = true;
    for (let u = t; u < t + 0.3; u += 0.05) if (Math.abs(springAt(u, m, k, c) - 1) > 0.005) { ok = false; break; }
    if (ok) return t;
  }
  return 20;
};

// ------------------------------------------------------------------ deterministic randomness (seeded by a string)

export const random = (seed: string | number | null) => {
  const s = String(seed);
  let hsh = 2166136261;
  for (let i = 0; i < s.length; i++) { hsh ^= s.charCodeAt(i); hsh = Math.imul(hsh, 16777619); }
  let a = hsh >>> 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// ------------------------------------------------------------------ files, images, sequences

/** Remotion's public/ is the HyperFrames project's assets/. */
export const staticFile = (p: string) => (/^(https?:|data:|assets\/)/.test(p) ? p : `assets/${p.replace(/^\/+/, '')}`);
/** Every image the scene shows, so the runner can load and decode them before the first frame is captured. */
export const IMAGES = new Set<string>();

type Style = JSX.CSSProperties | Record<string, unknown>;
export const AbsoluteFill = ({style, children, ...rest}: {style?: Style; children?: ComponentChildren; [k: string]: unknown}) =>
  h('div', {...rest, style: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', ...(style as object)}}, children);

export const Img = ({src, ...rest}: {src: string; [k: string]: unknown}) => { IMAGES.add(src); return h('img', {src, ...rest}); };

/** Children see a frame counted from `from`, and render only inside [from, from + durationInFrames). */
export const Sequence = ({from = 0, durationInFrames = Infinity, children}: {from?: number; durationInFrames?: number; premountFor?: number; children?: ComponentChildren; name?: string}) => {
  const f = useCurrentFrame();
  if (f < from || f >= from + durationInFrames) return null;
  return h(FrameCtx.Provider, {value: f - from}, h('div', {style: {position: 'absolute', inset: 0}}, children));
};

// Remotion's render-gating calls: HyperFrames waits on window.__hf.buildReady instead (see runner.tsx).
export const delayRender = (_label?: string) => 0;
export const continueRender = (_h?: number) => {};
export const cancelRender = (e: unknown) => { throw e instanceof Error ? e : new Error(String(e)); };

// ------------------------------------------------------------------ video: slots for the scene's static <video> tags

/** HyperFrames pre-extracts and seeks the <video> tags written in the scene file; a <Video> here renders a slot that
 * the runner moves the matching tag into. The key is the clip and its start - hf_build writes one tag per key. */
export const VIDEO_KEYS: string[] = [];
export const videoKey = (src: string, trimBeforeFrames = 0) => `${src}@${Math.round(trimBeforeFrames)}`;
export const Video = ({src, trimBefore = 0, objectFit = 'cover', style}: {src: string; trimBefore?: number; objectFit?: string; style?: Style; muted?: boolean}) => {
  const key = videoKey(src, trimBefore);
  const n = VIDEO_KEYS.filter((k) => k.startsWith(key + '#')).length;
  const slot = `${key}#${n}`;
  VIDEO_KEYS.push(slot);
  return h('div', {'data-mv-video': slot, 'data-fit': objectFit, style: {position: 'absolute', overflow: 'hidden', ...(style as object)}});
};

export type CalculateMetadataFunction<T> = (o: {props: T}) => {durationInFrames: number};

// More transitions, after the HyperFrames registry's transition blocks (Apache-2.0, heygen-com/hyperframes - ideas
// and techniques, rewritten for this runtime). They work on the live scene - masks, clip-paths and SVG filters on the
// scene's own DOM - so footage, packshots and the cut-out carry through, unlike a canvas re-draw.
// The incoming scene is drawn above the outgoing one (its host has the higher z-index), so most of these reveal the
// incoming scene through a growing shape; the outgoing scene adds its own exit where it helps (glitch, ripple, warp).
// Decorative layers (the leak, the ember, the paper) are drawn only on the scene's base layer, like carry.tsx.
import React, {useContext} from 'react';
import {AbsoluteFill, random, useVideoConfig} from 'remotion';
import type {TransitionPresentation, TransitionPresentationComponentProps} from '@remotion/transitions';
import {C, INK} from './theme';
import {easeIn, easeInOut, easeOut} from './lib/anim';
import {PartCtx, partShows} from './carry';

export type PlusType = 'lightleak' | 'ink' | 'torn' | 'halftone' | 'glitch' | 'ripple' | 'chromatic' | 'vortex' | 'warp' | 'collage' | 'burn' | 'flash' | 'pixel';
export const PLUS_TYPES: PlusType[] = ['lightleak', 'ink', 'torn', 'halftone', 'glitch', 'ripple', 'chromatic', 'vortex', 'warp', 'collage', 'burn', 'flash', 'pixel'];
/** Default lengths in seconds - mirrored in scripts/lib/transitions.mjs (hf_build, export_ae, mg_plan, mg_check). */
export const PLUS_SECONDS: Record<PlusType, number> = {
  lightleak: 0.7, ink: 0.7, torn: 0.6, halftone: 0.6, glitch: 0.35, ripple: 0.6, chromatic: 0.45, vortex: 0.6, warp: 0.6, collage: 0.8, burn: 0.7, flash: 0.3, pixel: 0.6,
};

type P = {type: PlusType; color?: string; seed: number};
type Props = TransitionPresentationComponentProps<P>;
const cl = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, x: number) => { const t = cl((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const svgUri = (w: number, h: number, body: string) => `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`)}")`;
const masked = (uri: string, children: React.ReactNode) => (
  <AbsoluteFill style={{WebkitMaskImage: uri, maskImage: uri, WebkitMaskSize: '100% 100%', maskSize: '100% 100%', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat'}}>{children}</AbsoluteFill>
);
const useDecor = () => partShows(useContext(PartCtx), 'base');

/** An SVG filter living next to the scene it distorts; the id is per scene and per frame-state so frames stay independent. */
const Filter: React.FC<{id: string; children: React.ReactNode}> = ({id, children}) => (
  <svg width={0} height={0} style={{position: 'absolute'}}><defs><filter id={id} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">{children}</filter></defs></svg>
);

const View: React.FC<Props> = ({children, presentationDirection: dir, presentationProgress: p, passedProps: {type, color, seed}}) => {
  const {width: W, height: H, id} = useVideoConfig() as {width: number; height: number; id?: string};
  const decor = useDecor();
  const enter = dir === 'entering';
  const fid = `mvx-${id || 's'}-${type}-${dir}`;
  const accent = color || C.accent;

  switch (type) {
    // ---------------------------------------------------------------- light leak: warm light floods, the cut hides in it
    case 'lightleak': {
      if (!enter) return <AbsoluteFill>{children}</AbsoluteFill>;
      const L = Math.sin(Math.PI * p), x = -0.3 + 1.6 * easeInOut(p);
      return (
        <AbsoluteFill>
          <AbsoluteFill style={{opacity: smooth(0.38, 0.62, p)}}>{children}</AbsoluteFill>
          {decor && L > 0.001 && <AbsoluteFill style={{pointerEvents: 'none', opacity: L,
            background: `radial-gradient(ellipse 60% 80% at ${x * 100}% 40%, rgba(255,250,235,0.95) 0%, rgba(255,190,110,0.75) 28%, rgba(255,110,60,0.35) 55%, transparent 75%),
              radial-gradient(ellipse 50% 60% at ${(1.2 - x) * 100}% 75%, ${accent}aa 0%, transparent 70%)`}} />}
        </AbsoluteFill>
      );
    }
    // ---------------------------------------------------------------- ink bleed: blots spread and merge into the next scene
    case 'ink': {
      if (!enter) return <AbsoluteFill>{children}</AbsoluteFill>;
      const far = Math.hypot(W, H);
      const blobs = Array.from({length: 7}, (_, i) => {
        const d = random(`ink-d${seed}-${i}`) * 0.4, k = easeInOut(cl((p - d) / 0.6));
        return `<circle cx='${(0.12 + random(`ink-x${seed}-${i}`) * 0.76) * W}' cy='${(0.12 + random(`ink-y${seed}-${i}`) * 0.76) * H}' r='${k * far * (0.16 + random(`ink-r${seed}-${i}`) * 0.16) + smooth(0.72, 1, p) * far}' fill='white'/>`;
      }).join('');
      const body = `<filter id='w'><feTurbulence type='fractalNoise' baseFrequency='0.012' numOctaves='2' seed='${seed}'/><feDisplacementMap in='SourceGraphic' scale='${80 + 60 * (1 - p)}'/></filter><g filter='url(#w)'>${blobs}</g>`;
      return masked(svgUri(W, H, body), children);
    }
    // ---------------------------------------------------------------- torn paper: the frame rips open along a ragged line
    case 'torn': {
      if (!enter) return <AbsoluteFill>{children}</AbsoluteFill>;
      const N = 36, open = easeIn(p) * H * 0.62, slope = (random(`tn-s${seed}`) - 0.5) * H * 0.25;
      const edge = Array.from({length: N + 1}, (_, i) => ({x: (i / N) * W, y: H / 2 + slope * (i / N - 0.5) + (random(`tn${seed}-${i}`) - 0.5) * H * 0.035}));
      const top = edge.map((e) => `${e.x}px ${e.y - open}px`), bot = edge.slice().reverse().map((e) => `${e.x}px ${e.y + open}px`);
      const poly = `polygon(-10px ${edge[0].y - open}px, ${top.join(', ')}, ${W + 10}px ${edge[N].y - open}px, ${W + 10}px ${edge[N].y + open}px, ${bot.join(', ')}, -10px ${edge[0].y + open}px)`;
      const rim = (sign: number) => edge.map((e, i) => `${e.x}px ${e.y + sign * open + sign * (8 + random(`tr${seed}-${i}-${sign}`) * 14)}px`);
      const rimPoly = (sign: number) => `polygon(${edge.map((e) => `${e.x}px ${e.y + sign * open}px`).join(', ')}, ${rim(sign).reverse().join(', ')})`;
      return (
        <AbsoluteFill>
          <AbsoluteFill style={{clipPath: poly}}>{children}</AbsoluteFill>
          {decor && open > 1 && [-1, 1].map((s) => <AbsoluteFill key={s} style={{clipPath: rimPoly(s), background: '#F6F1E7', filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.35))'}} />)}
        </AbsoluteFill>
      );
    }
    // ---------------------------------------------------------------- halftone: dots swell across the frame
    case 'halftone': {
      if (!enter) return <AbsoluteFill>{children}</AbsoluteFill>;
      const cell = Math.round(Math.min(W, H) / 16), cols = Math.ceil(W / cell) + 1, rows = Math.ceil(H / cell) + 1;
      let dots = '';
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const diag = (c / cols + r / rows) / 2, k = cl((p * 1.7 - diag * 0.7));
        if (k > 0) dots += `<circle cx='${c * cell + (r % 2) * cell / 2}' cy='${r * cell}' r='${(k * cell * 0.78).toFixed(1)}'/>`;
      }
      return masked(svgUri(W, H, `<g fill='white'>${dots}</g>`), children);
    }
    // ---------------------------------------------------------------- glitch: the picture tears into bands and channels, then swaps
    case 'glitch': {
      const a = Math.sin(Math.PI * p), step = Math.floor(p * 9);
      const show = enter ? p >= 0.5 : true;
      return (
        <AbsoluteFill style={{opacity: show ? 1 : 0}}>
          <Filter id={fid}>
            <feTurbulence type="turbulence" baseFrequency="0 0.09" numOctaves={1} seed={seed + step} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={a * 140} xChannelSelector="R" yChannelSelector="A" result="d" />
            <feColorMatrix in="d" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
            <feOffset in="r" dx={a * 22} result="ro" />
            <feColorMatrix in="d" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="gb" />
            <feOffset in="gb" dx={-a * 22} result="gbo" />
            <feBlend in="ro" in2="gbo" mode="screen" />
          </Filter>
          <AbsoluteFill style={{filter: a > 0.01 ? `url(#${fid})` : undefined}}>{children}</AbsoluteFill>
        </AbsoluteFill>
      );
    }
    // ---------------------------------------------------------------- ripple / warp: liquid displacement through the dissolve
    case 'ripple':
    case 'warp': {
      const a = Math.sin(Math.PI * p);
      const freq = type === 'ripple' ? '0.008' : '0.0025 0.03';
      const push = type === 'warp' ? (enter ? (1 - easeOut(p)) * W * 0.12 : -easeIn(p) * W * 0.12) : 0;
      return (
        <AbsoluteFill style={{opacity: enter ? smooth(0.25, 0.75, p) : 1, transform: push ? `translateX(${push}px)` : undefined}}>
          <Filter id={fid}>
            <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={2} seed={seed} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={a * (type === 'ripple' ? 160 : 260)} xChannelSelector="R" yChannelSelector="G" />
          </Filter>
          <AbsoluteFill style={{filter: a > 0.01 ? `url(#${fid})` : undefined}}>{children}</AbsoluteFill>
        </AbsoluteFill>
      );
    }
    // ---------------------------------------------------------------- chromatic: a punch-in that splits into colour channels
    case 'chromatic': {
      const a = enter ? 1 - easeOut(p) : easeIn(p);
      const s = enter ? 1 + 0.25 * a : 1 + 0.35 * a;
      return (
        <AbsoluteFill style={{opacity: enter ? smooth(0.2, 0.55, p) : 1, transform: `scale(${s})`}}>
          <Filter id={fid}>
            <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
            <feOffset in="r" dx={a * 30} dy={a * 8} result="ro" />
            <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
            <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
            <feOffset in="b" dx={-a * 30} dy={-a * 8} result="bo" />
            <feBlend in="ro" in2="g" mode="screen" result="rg" />
            <feBlend in="rg" in2="bo" mode="screen" />
          </Filter>
          <AbsoluteFill style={{filter: a > 0.01 ? `url(#${fid}) blur(${a * 6}px)` : undefined}}>{children}</AbsoluteFill>
        </AbsoluteFill>
      );
    }
    // ---------------------------------------------------------------- vortex: the next scene spins up out of the centre
    case 'vortex': {
      if (!enter) {
        const e = easeIn(p);
        return <AbsoluteFill style={{transform: `rotate(${e * 90}deg) scale(${1 + e * 0.6})`, filter: `blur(${e * 12}px)`, opacity: 1 - smooth(0.6, 1, p)}}>{children}</AbsoluteFill>;
      }
      const e = easeOut(p);
      return (
        <AbsoluteFill style={{clipPath: `circle(${e * 80}% at 50% 50%)`, transform: `rotate(${(1 - e) * -200}deg) scale(${0.3 + 0.7 * e})`, filter: `blur(${(1 - e) * 14}px)`}}>{children}</AbsoluteFill>
      );
    }
    // ---------------------------------------------------------------- collage: torn paper scraps slap down, then lift away on the new scene
    case 'collage': {
      if (!enter) return <AbsoluteFill>{children}</AbsoluteFill>;
      const cols = [C.ground, accent, C.secondary, '#F6F1E7', C.primary];
      const scraps = cols.map((col, i) => {
        const tIn = i * 0.07, tOut = 0.55 + i * 0.05;
        const kin = easeOut(cl((p - tIn) / 0.18)), kout = easeIn(cl((p - tOut) / 0.25));
        if (kin <= 0 || kout >= 1) return null;
        const cx = (0.2 + random(`co-x${seed}${i}`) * 0.6) * W, cy = (0.15 + (i / 4) * 0.7) * H, w = W * 1.25, h = H * 0.42;
        const pts = Array.from({length: 14}, (_, k) => {
          const t = k / 14, side = Math.floor(t * 4), u = (t * 4) % 1, j = (random(`co-j${seed}${i}${k}`) - 0.5) * 30;
          const [x, y] = side === 0 ? [u * w, j] : side === 1 ? [w + j, u * h] : side === 2 ? [(1 - u) * w, h + j] : [j, (1 - u) * h];
          return `${x}px ${y}px`;
        });
        const rot = (random(`co-r${seed}${i}`) - 0.5) * 16, drop = (1 - kin) * -H * 0.25 + kout * (i % 2 ? -1 : 1) * W;
        return <div key={i} style={{position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h, background: col, clipPath: `polygon(${pts.join(', ')})`,
          transform: `translate(${kout ? drop : 0}px, ${kout ? 0 : drop}px) rotate(${rot}deg) scale(${1.15 - 0.15 * kin})`, opacity: kin,
          backgroundImage: 'repeating-linear-gradient(115deg, rgba(0,0,0,0.035) 0 2px, transparent 2px 7px)'}} />;
      });
      return (
        <AbsoluteFill>
          <AbsoluteFill style={{opacity: p >= 0.45 ? 1 : 0}}>{children}</AbsoluteFill>
          {decor && scraps}
        </AbsoluteFill>
      );
    }
    // ---------------------------------------------------------------- burn: a glowing ragged edge eats across the frame
    case 'burn': {
      if (!enter) return <AbsoluteFill>{children}</AbsoluteFill>;
      const N = 30, front = -0.25 + 1.5 * easeInOut(p), band = 0.06;
      const edge = (off: number) => Array.from({length: N + 1}, (_, i) => {
        const y = (i / N) * H, x = (front - off - (i / N) * 0.25) * W + (random(`bn${seed}-${i}`) - 0.5) * W * 0.05 + Math.sin(i * 1.7 + p * 9) * W * 0.008;
        return [x, y] as const;
      });
      const e0 = edge(0), e1 = edge(band);
      const reveal = `polygon(-50px 0px, ${e1.map(([x, y]) => `${x}px ${y}px`).join(', ')}, -50px ${H}px)`;
      const ember = `polygon(${e0.map(([x, y]) => `${x}px ${y}px`).join(', ')}, ${e1.slice().reverse().map(([x, y]) => `${x}px ${y}px`).join(', ')})`;
      return (
        <AbsoluteFill>
          <AbsoluteFill style={{clipPath: reveal}}>{children}</AbsoluteFill>
          {decor && <AbsoluteFill style={{clipPath: ember, background: 'linear-gradient(90deg, #2a0d00 0%, #ff5a1f 35%, #ffd27a 70%, #fff6dc 100%)'}} />}
        </AbsoluteFill>
      );
    }
    // ---------------------------------------------------------------- flash: through white on the beat
    case 'flash': {
      if (!enter) return <AbsoluteFill>{children}</AbsoluteFill>;
      const f = Math.pow(Math.sin(Math.PI * p), 0.6);
      return (
        <AbsoluteFill>
          <AbsoluteFill style={{opacity: p >= 0.5 ? 1 : 0}}>{children}</AbsoluteFill>
          {decor && <AbsoluteFill style={{background: color && color !== 'accent' ? accent : '#ffffff', opacity: f}} />}
        </AbsoluteFill>
      );
    }
    // ---------------------------------------------------------------- pixel: the frame flips over cell by cell
    default: {
      if (!enter) return <AbsoluteFill>{children}</AbsoluteFill>;
      const cols = 9, cell = W / cols, rows = Math.ceil(H / cell);
      let rects = '';
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const order = 0.55 * random(`px${seed}-${r}-${c}`) + 0.45 * ((c / cols + r / rows) / 2);
        if (p * 1.05 > order) rects += `<rect x='${(c * cell).toFixed(1)}' y='${(r * cell).toFixed(1)}' width='${(cell + 1).toFixed(1)}' height='${(cell + 1).toFixed(1)}'/>`;
      }
      return (
        <AbsoluteFill>
          {masked(svgUri(W, H, `<g fill='white'>${rects}</g>`), children)}
          {decor && p < 1 && <AbsoluteFill style={{pointerEvents: 'none', opacity: 0.35 * Math.sin(Math.PI * p),
            backgroundImage: `linear-gradient(${INK}40 2px, transparent 2px), linear-gradient(90deg, ${INK}40 2px, transparent 2px)`, backgroundSize: `${cell}px ${cell}px`}} />}
        </AbsoluteFill>
      );
    }
  }
};

const colorOf = (c?: string) => (!c || c === 'accent' ? C.accent : c === 'primary' ? C.primary : c === 'secondary' ? C.secondary : c);
export const plus = (t: {type: PlusType; color?: string; seed?: number}): TransitionPresentation<P> => ({
  component: View as never,
  props: {type: t.type, color: t.color ? colorOf(t.color) : undefined, seed: t.seed ?? 7},
});

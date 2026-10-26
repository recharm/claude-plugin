// Animated captions, word by word, in the brand's colours - rendered as a transparent layer over the finished cut
// (build_ad.mjs, captionStyle.animated). Styles after the HyperFrames registry's caption blocks (Apache-2.0,
// heygen-com/hyperframes - pill karaoke, highlight, kinetic slam, gradient fill, neon; ideas rewritten for this runtime).
// Word timings come from captions_from_words.mjs ("words": [[start, end, word], ...], output seconds); a caption
// without them gets its words spread over its first part by length.
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, random} from 'remotion';
import {C, FONT, INK} from './theme';
import {easeOut, spr, SPRING} from './lib/anim';

export type CaptionStyle = 'pop' | 'karaoke' | 'pill' | 'highlight' | 'slam' | 'gradient' | 'neon' | 'boxed';
export const CAPTION_STYLES: CaptionStyle[] = ['pop', 'karaoke', 'pill', 'highlight', 'slam', 'gradient', 'neon', 'boxed'];
export type Caption = {start: number; end: number; text: string; band?: 'upper' | 'middle' | 'lower'; y?: number; anim?: string; words?: [number, number, string][]};

const BAND = {upper: 0.27, middle: 0.5, lower: 0.73}; // build_ad's caption bands
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Words with their own times: the transcript's, or spread over the caption by length (about 0.3s a word). */
const wordsOf = (c: Caption): {w: string; s: number; e: number}[] => {
  const parts = c.text.split(/\s+/).filter(Boolean);
  if (c.words?.length && c.words.length === parts.length) return c.words.map(([s, e], i) => ({w: parts[i], s, e}));
  // the text was corrected after timing (captions_from_words --fix): keep the timed span, spread the corrected words over it
  const from = c.words?.length ? c.words[0][0] : c.start, to = c.words?.length ? c.words[c.words.length - 1][1] : 0;
  const span = to > from ? to - from : Math.min(c.end - c.start, Math.max(0.4, parts.length * 0.3));
  const total = parts.reduce((n, w) => n + w.length + 2, 0);
  let t = from;
  return parts.map((w) => { const d = span * (w.length + 2) / total; const r = {w, s: t, e: t + d}; t += d; return r; });
};

const stroke = (px: number, color = 'rgba(0,0,0,0.85)'): React.CSSProperties => ({WebkitTextStroke: `${px * 0.09}px ${color}`, paintOrder: 'stroke fill', textShadow: `0 ${px * 0.05}px ${px * 0.12}px rgba(0,0,0,0.45)`});

const One: React.FC<{c: Caption; style: CaptionStyle; next?: Caption; index: number}> = ({c, style, next, index}) => {
  const f = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const t = f / fps, short = Math.min(W, H);
  const punch = c.anim === 'punch';
  const s0 = Math.round(c.start * fps);
  const words = wordsOf(c);
  const px = short * 0.068 * (style === 'slam' || punch ? 1.18 : 1);
  // the burst leaves quickly unless the next caption takes over immediately
  const cutOut = next && next.start - c.end < 0.05;
  const outK = cutOut ? 1 : clamp01((c.end - t) / 0.12);
  const inK = easeOut(clamp01((f - s0) / 5));
  const y = (c.y != null ? Math.min(0.88, Math.max(0.08, c.y)) : BAND[c.band ?? 'middle']) * H;
  const spoken = (w: {s: number}) => t >= w.s - 0.02;
  const active = (w: {s: number; e: number}, i: number) => t >= w.s - 0.02 && t < (words[i + 1]?.s ?? c.end);

  let shakeX = 0, shakeY = 0;
  if (style === 'slam' || punch) {
    for (const w of words) { const d = t - w.s; if (d >= 0 && d < 0.12) { const k = 1 - d / 0.12; shakeX += (random(`sx${index}${w.s}`) - 0.5) * 14 * k; shakeY += (random(`sy${index}${w.s}`) - 0.5) * 10 * k; } }
  }

  const word = (w: {w: string; s: number; e: number}, i: number) => {
    const on = spoken(w), act = active(w, i), k = spr(f, Math.round(w.s * fps), SPRING.pop);
    const base: React.CSSProperties = {display: 'inline-block', margin: `0 ${px * 0.13}px`, fontFamily: FONT, fontWeight: 800, fontSize: px, lineHeight: 1.12};
    switch (style) {
      case 'pop':
        return <span key={i} style={{...base, ...stroke(px), color: '#fff', opacity: on ? Math.min(1, k * 1.5) : 0, transform: `translateY(${(1 - k) * px * 0.35}px) scale(${0.6 + 0.4 * k})`}}>{w.w}</span>;
      case 'karaoke':
        return <span key={i} style={{...base, ...stroke(px), color: on ? C.accent : '#fff', transform: `scale(${act ? 1.08 : 1})`}}>{w.w}</span>;
      case 'pill':
        return <span key={i} style={{...base, color: on ? INK : '#A6A6A6', transition: 'none'}}>{w.w}</span>;
      case 'highlight':
        return <span key={i} style={{...base, ...(act ? {} : stroke(px)), color: act ? INK : '#fff', background: act ? C.accent : 'transparent', borderRadius: px * 0.18,
          padding: `0 ${px * 0.16}px`, transform: `scale(${act ? 0.92 + 0.12 * k : 1}) rotate(${act ? -2 : 0}deg)`}}>{w.w}</span>;
      case 'slam':
        return <span key={i} style={{...base, ...stroke(px), color: act ? C.accent : '#fff', textTransform: 'uppercase', opacity: on ? 1 : 0,
          transform: `scale(${on ? 2.1 - 1.1 * clamp01((t - w.s) / 0.12) : 2.1}) rotate(${(i % 2 ? 3 : -3) * (1 - clamp01((t - w.s) / 0.12))}deg)`}}>{w.w}</span>;
      case 'gradient': {
        const fill = clamp01((t - w.s) / Math.max(0.08, w.e - w.s)) * 100;
        return <span key={i} style={{...base, color: 'transparent', WebkitTextStroke: `${px * 0.03}px rgba(0,0,0,0.35)`,
          backgroundImage: `linear-gradient(90deg, ${C.accent} 0%, ${C.primary === C.accent ? '#fff' : '#ffffff'} ${fill}%, rgba(255,255,255,0.6) ${fill}%)`,
          WebkitBackgroundClip: 'text', backgroundClip: 'text', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.45))'}}>{w.w}</span>;
      }
      case 'neon': {
        const flick = f - s0 < 8 ? [1, 0.2, 1, 0.4, 1, 0.7, 1, 1][f - s0] ?? 1 : 1;
        const glow = on ? 1 : 0.25;
        return <span key={i} style={{...base, color: on ? '#fff' : C.accent, opacity: flick * (on ? 1 : 0.55),
          textShadow: `0 0 ${px * 0.08}px #fff, 0 0 ${px * 0.25 * glow}px ${C.accent}, 0 0 ${px * 0.6 * glow}px ${C.accent}`}}>{w.w}</span>;
      }
      default: // boxed
        return <span key={i} style={{...base, color: '#fff'}}>{w.w}</span>;
    }
  };

  const wrap: React.CSSProperties = {position: 'absolute', left: W * 0.07, right: W * 0.07, top: y, transform: `translate(${shakeX}px, calc(-50% + ${shakeY}px))`,
    display: 'flex', justifyContent: 'center', opacity: outK * (style === 'pop' || style === 'slam' ? 1 : inK)};
  const lineBox: React.CSSProperties = {display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', maxWidth: W * 0.86, textAlign: 'center'};
  if (style === 'pill') {
    const k = spr(f, s0, SPRING.tactile);
    return (
      <div style={wrap}>
        <div style={{...lineBox, background: '#F2F0F4', borderRadius: px * 0.32, padding: `${px * 0.2}px ${px * 0.45}px`, boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
          transform: `scale(${0.85 + 0.15 * k})`}}>{words.map(word)}</div>
      </div>
    );
  }
  if (style === 'boxed') {
    return (
      <div style={{...wrap, transform: `translate(0, calc(-50% + ${(1 - inK) * px * 0.3}px))`}}>
        <div style={{...lineBox, background: 'rgba(12,12,16,0.82)', borderRadius: px * 0.2, padding: `${px * 0.12}px ${px * 0.3}px`}}>{words.map(word)}</div>
      </div>
    );
  }
  return <div style={wrap}><div style={lineBox}>{words.map(word)}</div></div>;
};

/** Every caption of the ad, each shown over [start, end). */
export const Captions: React.FC<{captions: Caption[]; style?: CaptionStyle}> = ({captions, style = 'pop'}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = f / fps;
  const st = (CAPTION_STYLES as string[]).includes(style) ? style : 'pop';
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {captions.map((c, i) => (t >= c.start && t < c.end ? <One key={i} c={c} style={st} next={captions[i + 1]} index={i} /> : null))}
    </AbsoluteFill>
  );
};

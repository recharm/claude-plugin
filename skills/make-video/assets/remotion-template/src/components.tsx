// Building blocks for ad scenes. Every colour, font and the logo come from theme.ts; every motion eases.
// Text presets match captions-and-timing.md: fadeRise, fadeDrop, scalePop, slideInSequence.
import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Video} from '@remotion/media';
import {C, FONT, BODY, T} from './theme';
import {cl, easeInOut, easeOut, out, ramp, spr, SPRING} from './lib/anim';

export type Preset = 'fade' | 'fadeRise' | 'fadeDrop' | 'scalePop' | 'slideInSequence';

/** Scale type off the short edge so 9:16 and 16:9 read the same. */
export const useUnit = () => {
  const {width, height} = useVideoConfig();
  return Math.min(width, height) / 1080;
};
const colorOf = (name?: string) => (name && (C as Record<string, string>)[name]) || name || C.text;

// ------------------------------------------------------------------ text

export const Txt: React.FC<{
  text: string; preset?: Preset; at?: number; exitAt?: number; size?: number; weight?: number;
  color?: string; align?: 'center' | 'left'; maxWidth?: number;
}> = ({text, preset = 'fadeRise', at = 0, exitAt, size = 96, weight = 800, color, align = 'center', maxWidth = 0.86}) => {
  const f = useCurrentFrame();
  const u = useUnit();
  const {width} = useVideoConfig();
  const px = size * u;
  // Hook text snaps in (<300ms = 9 frames); supporting text eases a little slower.
  // `fade` is the hook's snap-in: 8 frames (<300ms), no movement. scalePop is kept for the one main claim.
  const len = preset === 'scalePop' || preset === 'fade' ? 8 : 12;
  const p = ramp(f, at, len);
  let y = 0, scale = 1, o = p;
  if (preset === 'fadeRise') y = (1 - p) * px * 0.35;
  if (preset === 'fadeDrop') y = -(1 - p) * px * 0.35;
  if (preset === 'scalePop') { const s = spr(f, at, SPRING.pop); scale = 0.6 + 0.4 * s; o = Math.min(1, s * 1.6); }
  if (exitAt !== undefined) { const q = 1 - out(f, exitAt, 8); o *= 1 - q; y += q * px * 0.25; }
  return (
    <div style={{fontFamily: FONT, fontWeight: weight, fontSize: px, lineHeight: 1.08, color: colorOf(color),
      textAlign: align, maxWidth: width * maxWidth, opacity: o, transform: `translateY(${y}px) scale(${scale})`,
      letterSpacing: -0.01 * px, textWrap: 'balance' as React.CSSProperties['textWrap']}}>
      {text}
    </div>
  );
};

/** Items read in order: each slides in from the left, staggered 0.15-0.20s. */
export const SlideList: React.FC<{items: string[]; at?: number; stagger?: number; size?: number; color?: string; marker?: 'check' | 'number' | 'dot'}> =
  ({items, at = 0, stagger = 5, size = 64, color, marker = 'check'}) => {
    const f = useCurrentFrame();
    const u = useUnit();
    const px = size * u;
    return (
      <div style={{display: 'flex', flexDirection: 'column', gap: px * 0.45}}>
        {items.map((it, i) => {
          const t0 = at + i * stagger;
          const p = ramp(f, t0, 12);
          const s = spr(f, t0 + 2, SPRING.tactile);
          return (
            <div key={i} style={{display: 'flex', alignItems: 'center', gap: px * 0.4, opacity: p, transform: `translateX(${(1 - p) * -px * 1.2}px)`}}>
              <div style={{width: px * 0.9, height: px * 0.9, borderRadius: px, background: C.primary, color: C.onPrimary,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontWeight: 800,
                fontSize: px * 0.5, transform: `scale(${0.4 + 0.6 * s})`, flexShrink: 0}}>
                {marker === 'number' ? i + 1 : marker === 'check' ? '✓' : ''}
              </div>
              <div style={{fontFamily: BODY, fontWeight: 700, fontSize: px, color: colorOf(color), lineHeight: 1.1}}>{it}</div>
            </div>
          );
        })}
      </div>
    );
  };

// ------------------------------------------------------------------ graphics

/** Brand ground: a slow gradient drift, soft glows, ambient particles (the one place linear motion is allowed). */
export const Background: React.FC<{tone?: 'primary' | 'secondary' | 'ground' | 'dark'; seed?: number}> = ({tone = 'ground', seed = 1}) => {
  const f = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const base = tone === 'primary' ? C.primary : tone === 'secondary' ? C.secondary : tone === 'dark' ? C.dark : C.ground;
  const glow = tone === 'ground' ? C.accent : C.primary;
  const drift = (f / 30) * 6; // linear, ambient
  const dots = Array.from({length: 14}, (_, i) => {
    const r = ((i * 9301 + seed * 49297) % 233280) / 233280;
    const r2 = ((i * 4271 + seed * 7919) % 99991) / 99991;
    return {x: r * width, y: ((r2 * height - f * (0.6 + r)) % height + height) % height, s: 6 + r2 * 14, o: 0.12 + r * 0.18};
  });
  return (
    <AbsoluteFill style={{background: base, overflow: 'hidden'}}>
      <div style={{position: 'absolute', width: width * 1.2, height: width * 1.2, left: -width * 0.45 + drift, top: -width * 0.5,
        borderRadius: '50%', background: `radial-gradient(circle, ${glow}55 0%, transparent 65%)`}} />
      <div style={{position: 'absolute', width: width, height: width, right: -width * 0.4 - drift, bottom: -width * 0.35,
        borderRadius: '50%', background: `radial-gradient(circle, ${glow}40 0%, transparent 60%)`}} />
      {dots.map((d, i) => (
        <div key={i} style={{position: 'absolute', left: d.x, top: d.y, width: d.s, height: d.s, borderRadius: d.s,
          background: tone === 'ground' ? C.primary : C.onPrimary, opacity: d.o}} />
      ))}
    </AbsoluteFill>
  );
};

/** A rule line drawing on under a heading - a cheap, always-on-brand accent. */
export const Rule: React.FC<{at?: number; width?: number; color?: string}> = ({at = 0, width = 0.3, color}) => {
  const f = useCurrentFrame();
  const {width: W} = useVideoConfig();
  const u = useUnit();
  return <div style={{height: 10 * u, borderRadius: 10 * u, width: W * width * ramp(f, at, 16), background: colorOf(color ?? 'accent')}} />;
};

/** Number counting up to its value (ease-out), with optional prefix/suffix. Non-numeric values scale-pop instead. */
export const Stat: React.FC<{value: string; label?: string; at?: number; color?: string}> = ({value, label, at = 0, color}) => {
  const f = useCurrentFrame();
  const u = useUnit();
  const m = value.match(/^([^\d-]*)(\d[\d,]*\.?\d*)(.*)$/);
  let shown = value;
  if (m && !/^\s?-\s?\d/.test(m[3])) {
    const target = Number(m[2].replace(/,/g, ''));
    const dec = (m[2].split('.')[1] || '').length;
    const v = target * ramp(f, at, 30);
    shown = `${m[1]}${v.toLocaleString('en-US', {minimumFractionDigits: dec, maximumFractionDigits: dec})}${m[3]}`;
  }
  const s = spr(f, at, SPRING.pop);
  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 * u}}>
      <div style={{fontFamily: FONT, fontWeight: 900, fontSize: 270 * u, lineHeight: 1, color: colorOf(color ?? 'primary'),
        transform: `scale(${0.7 + 0.3 * s})`, opacity: Math.min(1, s * 1.5), fontVariantNumeric: 'tabular-nums'}}>{shown}</div>
      {label && <Txt text={label} at={at + 8} size={64} weight={700} />}
    </div>
  );
};

/** Comparison bars growing from zero (ease-out). Only the site's own figures go in here. */
export const Bars: React.FC<{bars: {label: string; value: number; highlight?: boolean}[]; unit?: string; at?: number}> = ({bars, unit = '', at = 0}) => {
  const f = useCurrentFrame();
  const u = useUnit();
  const {width} = useVideoConfig();
  const max = Math.max(...bars.map((b) => b.value));
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 34 * u, width: width * 0.8}}>
      {bars.map((b, i) => {
        const p = ramp(f, at + i * 6, 26);
        return (
          <div key={i}>
            <div style={{fontFamily: BODY, fontWeight: 700, fontSize: 44 * u, color: C.text, marginBottom: 10 * u, opacity: ramp(f, at + i * 6, 10)}}>{b.label}</div>
            <div style={{display: 'flex', alignItems: 'center', gap: 20 * u}}>
              <div style={{height: 64 * u, borderRadius: 64 * u, width: `${(b.value / max) * 78 * p}%`,
                background: b.highlight ? C.primary : C.muted}} />
              <div style={{fontFamily: FONT, fontWeight: 800, fontSize: 52 * u, color: b.highlight ? C.primary : C.text, opacity: p}}>
                {Math.round(b.value * p)}{unit}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** A brand-coloured ring that draws itself on around a point (SVG stroke, ease-out). */
export const HighlightRing: React.FC<{x: number; y: number; r?: number; at?: number}> = ({x, y, r = 0.18, at = 0}) => {
  const f = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const R = Math.min(width, height) * r;
  const circ = 2 * Math.PI * R;
  return (
    <svg style={{position: 'absolute', left: 0, top: 0}} width={width} height={height}>
      <circle cx={x * width} cy={y * height} r={R} fill="none" stroke={C.accent} strokeWidth={R * 0.06}
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - ramp(f, at, 22))}
        transform={`rotate(-90 ${x * width} ${y * height})`} />
    </svg>
  );
};

/** Product image (website packshot) floating up on a spring, with a soft shadow. Never a generated product. */
export const ProductShot: React.FC<{src: string; at?: number; height?: number}> = ({src, at = 0, height = 0.5}) => {
  const f = useCurrentFrame();
  const {height: H} = useVideoConfig();
  const s = spr(f, at, SPRING.tactile);
  const float = Math.sin(f / 22) * 6; // ambient idle drift
  return (
    <Img src={staticFile(src)} style={{height: H * height, objectFit: 'contain', opacity: Math.min(1, s * 1.4),
      transform: `translateY(${(1 - s) * H * 0.08 + float}px) scale(${0.9 + 0.1 * s})`,
      filter: 'drop-shadow(0 30px 40px rgba(0,0,0,0.18))'}} />
  );
};

/** Library or uploaded footage filling the frame, with an optional eased push-in. Muted: audio lives in build_ad.mjs. */
// `blurfill` shows the whole clip sharp over a blurred cover of itself - use it for a portrait clip in 16:9
// (or the reverse) instead of cropping it to a sliver.
export const Footage: React.FC<{src: string; trimBefore?: number; pushIn?: boolean; fit?: 'cover' | 'blurfill'}> = ({src, trimBefore = 0, pushIn = true, fit = 'cover'}) => {
  const f = useCurrentFrame();
  const {durationInFrames, fps} = useVideoConfig();
  const z = pushIn ? interpolate(f, [0, durationInFrames], [1, 1.08], {...cl, easing: easeInOut}) : 1;
  const url = /^https?:/.test(src) ? src : staticFile(src);
  const trim = Math.round(trimBefore * fps);
  return (
    <AbsoluteFill style={{overflow: 'hidden', background: '#000'}}>
      {fit === 'blurfill' && (
        // @remotion/media's Video takes objectFit as a PROP - inside `style` it is ignored and the clip letterboxes.
        <Video src={url} muted trimBefore={trim} objectFit="cover" style={{position: 'absolute', width: '100%', height: '100%',
          filter: 'blur(36px) brightness(0.8)', transform: 'scale(1.1)'}} />
      )}
      <Video src={url} muted trimBefore={trim} objectFit={fit === 'blurfill' ? 'contain' : 'cover'}
        style={{position: 'absolute', width: '100%', height: '100%', transform: `scale(${z})`}} />
    </AbsoluteFill>
  );
};

/** Lower third: a brand pill sliding in with a title and an optional subtitle. */
export const LowerThird: React.FC<{title: string; sub?: string; at?: number; exitAt?: number}> = ({title, sub, at = 0, exitAt}) => {
  const f = useCurrentFrame();
  const u = useUnit();
  const p = ramp(f, at, 14);
  const o = exitAt !== undefined ? out(f, exitAt, 10) : 1;
  return (
    <div style={{display: 'inline-flex', flexDirection: 'column', gap: 6 * u, padding: `${22 * u}px ${36 * u}px`, borderRadius: 30 * u,
      background: C.primary, opacity: p * o, transform: `translateX(${(1 - p) * -80 * u}px)`, boxShadow: '0 12px 30px rgba(0,0,0,0.2)'}}>
      <div style={{fontFamily: FONT, fontWeight: 800, fontSize: 52 * u, color: C.onPrimary}}>{title}</div>
      {sub && <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 34 * u, color: C.onPrimary, opacity: 0.85}}>{sub}</div>}
    </div>
  );
};

/** End card: the logo exactly as published (scaled and faded only), the URL, a CTA pill and a ring motif. */
export const EndCard: React.FC<{url?: string; cta?: string}> = ({url = T.url, cta}) => {
  const f = useCurrentFrame();
  const u = useUnit();
  const {width, height} = useVideoConfig();
  const logo = spr(f, 4, SPRING.soft);
  const pill = spr(f, 18, SPRING.tactile);
  const ringR = Math.min(width, height) * 0.36;
  const circ = 2 * Math.PI * ringR;
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
      <svg style={{position: 'absolute'}} width={width} height={height}>
        <circle cx={width / 2} cy={height / 2} r={ringR} fill="none" stroke={C.accent} strokeOpacity={0.5} strokeWidth={8 * u}
          strokeDasharray={circ} strokeDashoffset={circ * (1 - ramp(f, 0, 30))} transform={`rotate(-90 ${width / 2} ${height / 2})`} />
      </svg>
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40 * u}}>
        {T.logo && <Img src={staticFile(T.logo)} style={{width: Math.min(width, height) * 0.55, opacity: logo,
          transform: `translateY(${(1 - logo) * 40 * u}px) scale(${0.92 + 0.08 * logo})`}} />}
        <Txt text={url} at={14} size={64} weight={800} color={T.endCardText} />
        {cta && (
          <div style={{padding: `${22 * u}px ${54 * u}px`, borderRadius: 999, background: C.accent, color: C.secondary,
            fontFamily: FONT, fontWeight: 800, fontSize: 46 * u, textTransform: 'uppercase', letterSpacing: 1,
            transform: `scale(${0.6 + 0.4 * pill})`, opacity: Math.min(1, pill * 1.5)}}>{cta}</div>
        )}
      </div>
    </AbsoluteFill>
  );
};

/** Centered content area kept inside the platform-safe zone (9:16: top 8%, bottom 12%). */
export const Safe: React.FC<{children: React.ReactNode; justify?: 'center' | 'flex-start' | 'flex-end'; gap?: number}> = ({children, justify = 'center', gap = 40}) => {
  const {height, width} = useVideoConfig();
  const portrait = height > width;
  const u = useUnit();
  return (
    <AbsoluteFill style={{paddingTop: portrait ? height * 0.1 : height * 0.08, paddingBottom: portrait ? height * 0.14 : height * 0.08,
      paddingLeft: width * 0.07, paddingRight: width * 0.07, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: justify, gap: gap * u}}>
      {children}
    </AbsoluteFill>
  );
};

export {easeOut};

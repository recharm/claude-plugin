// Building blocks for ad scenes. Every colour, font and the logo come from theme.ts; every motion eases.
// Text presets match captions-and-timing.md: fadeRise, fadeDrop, scalePop, slideInSequence.
import React from 'react';
import {AbsoluteFill, Img, interpolate, random, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ShaderBg, SHADER_STYLES, ShaderStyle} from './shaders';
import {useInk} from './ink';
import {Video} from '@remotion/media';
import {C, FONT, BODY, INK, lumOf, T} from './theme';
import {cl, easeInOut, easeOut, out, ramp, sec, spr, SPRING} from './lib/anim';
import {brandProp} from './motifs';
import {ShapeEl} from './visuals';


/** Scale type off the short edge so 9:16 and 16:9 read the same. */
export const useUnit = () => {
  const {width, height} = useVideoConfig();
  return Math.min(width, height) / 1080;
};
const colorOf = (name?: string) => (name && (C as Record<string, string>)[name]) || name || C.text;

// ------------------------------------------------------------------ text

export type Preset = 'fade' | 'fadeRise' | 'fadeDrop' | 'scalePop' | 'slideInSequence'
  | 'slam' | 'perWord' | 'perChar' | 'scramble' | 'typewriter' | 'tracking' | 'blurIn' | 'marker' | 'strike' | 'mask';
/** Kinetic presets (after the HyperFrames registry's typography blocks, Apache-2.0 - ideas rewritten): */
export const KINETIC: Preset[] = ['slam', 'perWord', 'perChar', 'scramble', 'typewriter', 'tracking', 'blurIn', 'marker', 'strike', 'mask'];

const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&*+=?';

export const Txt: React.FC<{
  text: string; preset?: Preset; at?: number; exitAt?: number; size?: number; weight?: number;
  color?: string; align?: 'center' | 'left'; maxWidth?: number; strike?: string;
}> = ({text, preset = 'fadeRise', at = 0, exitAt, size = 96, weight = 800, color, align = 'center', maxWidth = 0.86, strike}) => {
  const f = useCurrentFrame();
  const u = useUnit();
  const {width} = useVideoConfig();
  const px = size * u;
  const col = colorOf(color);
  const ink = useInk();
  // Hook text snaps in (<300ms = 9 frames); supporting text eases a little slower.
  // `fade` is the hook's snap-in: 8 frames (<300ms), no movement. scalePop is kept for the one main claim.
  const len = preset === 'scalePop' || preset === 'fade' ? 8 : 12;
  const p = ramp(f, at, len);
  let y = 0, scale = 1, o = p, blur = 0, track = -0.01;
  if (preset === 'fadeRise') y = (1 - p) * px * 0.35;
  if (preset === 'fadeDrop') y = -(1 - p) * px * 0.35;
  if (preset === 'scalePop') { const s = spr(f, at, SPRING.pop); scale = 0.6 + 0.4 * s; o = Math.min(1, s * 1.6); }
  if (preset === 'slam') { const k = ramp(f, at, 6, easeOut); scale = 2.2 - 1.2 * k; o = f < at ? 0 : 1; }
  if (preset === 'tracking') { track = -0.01 + (1 - ramp(f, at, 18)) * 0.5; blur = (1 - ramp(f, at, 14)) * px * 0.08; }
  if (preset === 'blurIn') { blur = (1 - ramp(f, at, 14)) * px * 0.25; scale = 1.06 - 0.06 * ramp(f, at, 14); }
  if (exitAt !== undefined) { const q = 1 - out(f, exitAt, 8); o *= 1 - q; y += q * px * 0.25; }
  // the slam lands with a little shake
  const sh = preset === 'slam' && f >= at + 5 && f < at + 13 ? (8 - (f - at - 5)) * 1.6 : 0;
  const box: React.CSSProperties = {fontFamily: FONT, fontWeight: weight, fontSize: px, lineHeight: 1.08, color: col, textAlign: align, maxWidth: width * maxWidth,
    opacity: o, transform: `translate(${sh * ((f % 2) ? 1 : -1)}px, ${y}px) scale(${scale})`, letterSpacing: `${track}em`,
    filter: blur > 0.2 ? `blur(${blur}px)` : undefined, textWrap: 'balance' as React.CSSProperties['textWrap']};
  const words = text.split(/(\s+)/);

  if (preset === 'perWord' || preset === 'mask') {
    let k = -1;
    return (
      <div style={{...box, opacity: 1, transform: undefined}}>
        {words.map((w, i) => {
          if (/^\s+$/.test(w)) return w;
          k++;
          const q = ramp(f, at + k * 3, 12);
          return preset === 'mask'
            ? <span key={i} style={{display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom', paddingBottom: '0.08em'}}>
                <span style={{display: 'inline-block', transform: `translateY(${(1 - q) * 110}%)`}}>{w}</span></span>
            : <span key={i} style={{display: 'inline-block', opacity: q, transform: `translateY(${(1 - q) * px * 0.45}px) rotate(${(1 - q) * (k % 2 ? 4 : -4)}deg)`}}>{w}</span>;
        })}
      </div>
    );
  }
  if (preset === 'perChar') {
    let k = -1;
    return (
      <div style={{...box, opacity: 1, transform: undefined}}>
        {words.map((w, i) => (/^\s+$/.test(w) ? w : (
          <span key={i} style={{display: 'inline-block', whiteSpace: 'nowrap'}}>
            {[...w].map((ch, j) => { k++; const s = spr(f, at + k * 1.2, SPRING.pop);
              return <span key={j} style={{display: 'inline-block', opacity: Math.min(1, s * 1.5), transform: `translateY(${(1 - s) * -px * 0.6}px) scale(${0.5 + 0.5 * s})`}}>{ch}</span>; })}
          </span>
        )))}
      </div>
    );
  }
  if (preset === 'scramble' || preset === 'typewriter') {
    const chars = [...text], n = chars.length;
    const done = preset === 'typewriter' ? Math.floor(Math.max(0, f - at) / 1.4) : Math.floor(Math.max(0, f - at - 4) / 0.9);
    const shown = chars.map((ch, i) => {
      if (i < done || ch === ' ') return ch;
      if (preset === 'typewriter') return '';
      return i < done + 6 && f >= at ? GLYPHS[Math.floor(random(`sc${i}-${Math.floor(f / 2)}`) * GLYPHS.length)] : '';
    }).join('');
    const caret = preset === 'typewriter' && (done < n || Math.floor(f / 15) % 2 === 0);
    return <div style={{...box, opacity: f >= at ? 1 : 0, transform: undefined}}>{shown}{caret && <span style={{display: 'inline-block', width: '0.06em', height: '0.9em', marginLeft: '0.05em', background: col, verticalAlign: '-0.08em'}} />}</div>;
  }
  if (preset === 'marker') {
    const m = ramp(f, at + 8, 14, easeInOut);
    // on a dark ground: the bright accent, the words in dark ink over it; on a light ground: a translucent band of the brand colour
    const mk = ink.light ? `${ink.acc}55` : C.accent;
    // word by word, so a heading that wraps gets its band on every line (and each word turns dark only once it is covered)
    const ws = text.split(/\s+/).filter(Boolean), n = ws.length;
    return (
      <div style={{...box, position: 'relative'}}>
        {ws.map((w, i) => {
          const k = Math.max(0, Math.min(1, m * n - i));
          return (
            <span key={i} style={{position: 'relative', display: 'inline-block', margin: '0 0.12em'}}>
              <span style={{position: 'absolute', left: '-0.14em', right: '-0.14em', top: '0.5em', height: '0.5em', background: mk,
                transform: `scaleX(${k}) skewX(-8deg)`, transformOrigin: 'left', zIndex: 0, borderRadius: '0.06em'}} />
              <span style={{position: 'relative', zIndex: 1, color: !ink.light && k > 0.5 ? INK : undefined}}>{w}</span>
            </span>
          );
        })}
      </div>
    );
  }
  if (preset === 'strike' && strike) {
    const line = ramp(f, at + 6, 10, easeInOut), swap = f >= at + 22, q = ramp(f, at + 22, 12);
    return (
      <div style={{...box, position: 'relative', opacity: f >= at ? 1 : 0, transform: undefined}}>
        {!swap ? (
          <span style={{position: 'relative', opacity: 0.8}}>{strike}
            <span style={{position: 'absolute', left: '-0.05em', top: '52%', height: '0.12em', width: `${line * 104}%`, background: '#FF3B5C', borderRadius: '0.06em'}} /></span>
        ) : <span style={{display: 'inline-block', opacity: q, transform: `translateY(${(1 - q) * px * 0.3}px)`}}>{text}</span>}
      </div>
    );
  }
  return <div style={box}>{text}</div>;
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

export type BgStyle = 'glow' | 'gradient' | 'spotlight' | 'grid' | 'paper' | 'pattern' | 'blur-footage' | 'split' | ShaderStyle;
export const BG_STYLES: BgStyle[] = ['glow', 'gradient', 'spotlight', 'grid', 'paper', 'pattern', 'blur-footage', 'split', ...SHADER_STYLES];
const mixHex = (a: string, b: string, k: number) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');

/** The scene's backdrop: one of the brand's colours (tone) drawn in a style, so consecutive scenes don't share one look.
 *   glow         soft brand-colour glows drifting in opposite corners, a few floating dots (the original)
 *   gradient     a slow-turning two-tone sweep with a single glow
 *   spotlight    a dark stage: one soft beam from above lights the middle, the edges fall away
 *   grid         a fine grid drifting, fading out toward the edges (tech, clinical, data)
 *   paper        printed-paper grain that "boils" every few frames, with a soft vignette (natural, craft, premium)
 *   pattern      the brand's own object (motifs props) tiled and scrolling diagonally, faint
 *   blur-footage a library clip blurred and toned behind the graphics (clip: {src, trimBefore}) - the ad's world, not a slab
 *   split        two tones meeting on a diagonal that slides slowly
 * Dark tones keep white graphics; a light tone (ground, a cream secondary) switches the graphics to dark ink (ink.ts). */
export const Background: React.FC<{tone?: 'primary' | 'secondary' | 'ground' | 'dark'; seed?: number; style?: BgStyle; clip?: {src: string; trimBefore?: number}}> =
  ({tone = 'ground', seed = 1, style = 'glow', clip}) => {
    const f = useCurrentFrame();
    const {width, height} = useVideoConfig();
    const base = tone === 'primary' ? C.primary : tone === 'secondary' ? C.secondary : tone === 'dark' ? C.dark : C.ground;
    const light = lumOf(base) > 0.6;
    const glow = tone === 'ground' || light ? C.accent : C.primary;
    const shade = light ? `${C.accent}55` : 'rgba(0,0,0,0.38)'; // the second tone: deeper on dark, brand-tinted on light
    const fine = light ? `${INK}14` : 'rgba(255,255,255,0.07)';
    const drift = (f / 30) * 6;
    const W = Math.max(width, height);
    const dots = (n: number) => Array.from({length: n}, (_, i) => {
      const r = ((i * 9301 + seed * 49297) % 233280) / 233280;
      const r2 = ((i * 4271 + seed * 7919) % 99991) / 99991;
      return {x: r * width, y: ((r2 * height - f * (0.6 + r)) % height + height) % height, s: 6 + r2 * 14, o: 0.12 + r * 0.18};
    });
    const glowA = (x: number, y: number, size: number, a: string) => (
      <div style={{position: 'absolute', width: size, height: size, left: x - size / 2, top: y - size / 2, borderRadius: '50%', background: `radial-gradient(circle, ${glow}${a} 0%, transparent 65%)`}} />
    );
    let layer: React.ReactNode;
    if ((SHADER_STYLES as string[]).includes(style)) {
      // WebGL in the brand's colours: on a dark tone, the base, a second deep tone, the accent and a highlight;
      // on a light ground, soft tints of the accent - the graphics above switch to dark ink as usual
      const hx = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#222222');
      const b0 = hx(base), acc = hx(C.accent);
      const second = light ? mixHex(b0, acc, 0.35) : hx([C.primary, C.secondary, C.dark].find((c) => c && c !== base && lumOf(c) < 0.45) ?? mixHex(b0, '#000000', 0.45));
      const cols = light ? [b0, second, mixHex(acc, b0, 0.2), '#ffffff'] : [b0, second, acc, mixHex(acc, '#ffffff', 0.6)];
      return <AbsoluteFill style={{background: base, overflow: 'hidden'}}><ShaderBg style={style as ShaderStyle} colors={cols} seed={seed} /></AbsoluteFill>;
    }
    switch (clip || style !== 'blur-footage' ? style : 'gradient') {
      case 'gradient': {
        const ang = 160 + Math.sin(f / 90 + seed) * 25;
        layer = (
          <>
            <AbsoluteFill style={{background: `linear-gradient(${ang}deg, transparent 0%, ${shade} 100%)`}} />
            {glowA(width * (0.25 + 0.1 * Math.sin(f / 70)), height * 0.2, W * 0.9, '44')}
          </>
        );
        break;
      }
      case 'spotlight': {
        const sway = Math.sin(f / 60 + seed) * width * 0.04;
        layer = (
          <>
            <AbsoluteFill style={{background: light ? `${INK}10` : 'rgba(0,0,0,0.45)'}} />
            <div style={{position: 'absolute', left: width * 0.5 + sway - width * 0.55, top: -height * 0.05, width: width * 1.1, height: height * 1.05,
              clipPath: 'polygon(42% 0%, 58% 0%, 100% 100%, 0% 100%)', background: `linear-gradient(180deg, ${light ? '#ffffff' : glow}66 0%, ${light ? '#ffffff' : glow}10 75%, transparent 100%)`,
              filter: `blur(${W * 0.03}px)`, opacity: 0.85 + 0.15 * Math.sin(f / 23)}} />
            <div style={{position: 'absolute', left: width * 0.1, top: height * 0.55, width: width * 0.8, height: height * 0.3, borderRadius: '50%',
              background: `radial-gradient(ellipse, ${light ? '#ffffff' : glow}55 0%, transparent 70%)`}} />
            <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 55%, transparent 45%, ${light ? `${INK}22` : 'rgba(0,0,0,0.6)'} 100%)`}} />
          </>
        );
        break;
      }
      case 'grid': {
        const cell = W * 0.055, off = (f * 0.8) % cell;
        layer = (
          <>
            {glowA(width * 0.5, height * 0.45, W * 1.1, '33')}
            <AbsoluteFill style={{backgroundImage: `linear-gradient(${fine} 2px, transparent 2px), linear-gradient(90deg, ${fine} 2px, transparent 2px)`,
              backgroundSize: `${cell}px ${cell}px`, backgroundPosition: `${off}px ${off}px`,
              WebkitMaskImage: 'radial-gradient(ellipse at 50% 50%, #000 30%, transparent 80%)', maskImage: 'radial-gradient(ellipse at 50% 50%, #000 30%, transparent 80%)'}} />
          </>
        );
        break;
      }
      case 'paper': {
        const boil = Math.floor(f / 3) % 4;
        layer = (
          <>
            <svg width={width} height={height} style={{position: 'absolute', inset: 0, opacity: light ? 0.5 : 0.35, mixBlendMode: light ? 'multiply' : 'overlay'}}>
              <filter id={`grain-${seed}-${boil}`}><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={3} seed={seed * 7 + boil} stitchTiles="stitch" />
                <feColorMatrix type="saturate" values="0" /></filter>
              <rect width="100%" height="100%" filter={`url(#grain-${seed}-${boil})`} />
            </svg>
            <svg width={width} height={height} style={{position: 'absolute', inset: 0, opacity: light ? 0.18 : 0.12, mixBlendMode: light ? 'multiply' : 'screen'}}>
              <filter id={`fiber-${seed}`}><feTurbulence type="fractalNoise" baseFrequency="0.012 0.08" numOctaves={2} seed={seed} /><feColorMatrix type="saturate" values="0" /></filter>
              <rect width="100%" height="100%" filter={`url(#fiber-${seed})`} />
            </svg>
            <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 45%, transparent 55%, ${light ? `${INK}1c` : 'rgba(0,0,0,0.45)'} 100%)`}} />
          </>
        );
        break;
      }
      case 'pattern': {
        const prop = brandProp(), cell = W * 0.13, off = (f * 1.1) % (cell * 2);
        const cols = Math.ceil(width / cell) + 3, rows = Math.ceil(height / cell) + 3;
        layer = (
          <>
            {glowA(width * 0.5, height * 0.5, W, '30')}
            <AbsoluteFill style={{opacity: light ? 0.16 : 0.13}}>
              {Array.from({length: rows * cols}).map((_, i) => {
                const r = Math.floor(i / cols), c = i % cols;
                const x = (c - 1.5) * cell + (r % 2) * cell / 2 + off, y = (r - 1.5) * cell + off * 0.6;
                return <ShapeEl key={i} shape={prop.shape} image={prop.image} size={cell * 0.42} color={light ? INK : '#ffffff'} rot={(r * 37 + c * 53) % 360 + f * 0.3}
                  style={{left: x, top: y}} />;
              })}
            </AbsoluteFill>
          </>
        );
        break;
      }
      case 'blur-footage':
        layer = (
          <>
            <AbsoluteFill style={{transform: 'scale(1.25)', filter: 'blur(28px) saturate(1.3)'}}>
              <Video src={staticFile(clip!.src)} muted trimBefore={sec(clip!.trimBefore ?? 0)} objectFit="cover" style={{width: '100%', height: '100%'}} />
            </AbsoluteFill>
            <AbsoluteFill style={{background: base, opacity: light ? 0.72 : 0.62}} />
            <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 50%, transparent 40%, ${light ? `${INK}22` : 'rgba(0,0,0,0.5)'} 100%)`}} />
          </>
        );
        break;
      case 'split': {
        const k = 0.5 + Math.sin(f / 80 + seed) * 0.08;
        layer = (
          <>
            <AbsoluteFill style={{background: shade, clipPath: `polygon(${(k + 0.22) * 100}% 0%, 100% 0%, 100% 100%, ${(k - 0.22) * 100}% 100%)`}} />
            <div style={{position: 'absolute', inset: 0, background: `linear-gradient(${Math.atan2(height, width * 0.44) * 180 / Math.PI + 90}deg, transparent 49.6%, ${glow}aa 50%, transparent 50.4%)`, opacity: 0.6}} />
            {glowA(width * 0.15, height * 0.12, W * 0.7, '30')}
          </>
        );
        break;
      }
      default:
        layer = (
          <>
            <div style={{position: 'absolute', width: width * 1.2, height: width * 1.2, left: -width * 0.45 + drift, top: -width * 0.5,
              borderRadius: '50%', background: `radial-gradient(circle, ${glow}55 0%, transparent 65%)`}} />
            <div style={{position: 'absolute', width: width, height: width, right: -width * 0.4 - drift, bottom: -width * 0.35,
              borderRadius: '50%', background: `radial-gradient(circle, ${glow}40 0%, transparent 60%)`}} />
            {dots(14).map((d, i) => (
              <div key={i} style={{position: 'absolute', left: d.x, top: d.y, width: d.s, height: d.s, borderRadius: d.s,
                background: light ? C.primary : C.onPrimary, opacity: d.o}} />
            ))}
          </>
        );
    }
    return <AbsoluteFill style={{background: base, overflow: 'hidden'}}>{layer}</AbsoluteFill>;
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
  const K = useInk(); // readable on any ground: dark ink on light, white on the brand's dark colours
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 34 * u, width: width * 0.8}}>
      {bars.map((b, i) => {
        const p = ramp(f, at + i * 6, 26);
        return (
          <div key={i}>
            <div style={{fontFamily: BODY, fontWeight: 700, fontSize: 44 * u, color: K.fg, marginBottom: 10 * u, opacity: ramp(f, at + i * 6, 10)}}>{b.label}</div>
            <div style={{display: 'flex', alignItems: 'center', gap: 20 * u}}>
              <div style={{height: 64 * u, borderRadius: 64 * u, width: `${(b.value / max) * 78 * p}%`,
                background: b.highlight ? K.acc : K.a(0.3), boxShadow: b.highlight ? `0 0 24px ${K.acc}66` : undefined}} />
              <div style={{fontFamily: FONT, fontWeight: 800, fontSize: 52 * u, color: b.highlight ? K.acc : K.fg, opacity: p}}>
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
export type Camera = 'pushin' | 'pullback' | 'drift' | 'rack' | 'handheld' | 'punch' | 'static';
export const CAMERAS: Camera[] = ['pushin', 'pullback', 'drift', 'rack', 'handheld', 'punch', 'static'];
/** How the camera moves over a footage scene (after the registry's camera blocks) - one function, so the footage and
 * its cut-out move identically. Returns a CSS transform and an optional blur. */
export const cameraAt = (cam: Camera, f: number, dur: number): {transform: string; filter?: string} => {
  const e = interpolate(f, [0, dur], [0, 1], {...cl, easing: easeInOut});
  switch (cam) {
    case 'pullback': return {transform: `scale(${1.12 - 0.12 * e})`};
    case 'drift': return {transform: `scale(1.08) translateX(${(-2.5 + 5 * e).toFixed(3)}%)`};
    case 'rack': { const r = ramp(f, 2, 20, easeInOut); return {transform: `scale(${1.03 + 0.03 * e})`, filter: r < 0.98 ? `blur(${((1 - r) * 14).toFixed(2)}px)` : undefined}; }
    case 'handheld': { const t = f / 30; const x = Math.sin(t * 1.7) * 0.5 + Math.sin(t * 3.1 + 1) * 0.3, y = Math.cos(t * 1.3) * 0.4 + Math.sin(t * 2.7) * 0.25;
      return {transform: `scale(1.07) translate(${x.toFixed(3)}%, ${y.toFixed(3)}%) rotate(${(Math.sin(t * 0.9) * 0.4).toFixed(3)}deg)`}; }
    case 'punch': { const k = spr(f, 0, {damping: 14, stiffness: 160, mass: 0.6}); return {transform: `scale(${1.25 - 0.25 * k + 0.04 * e})`}; }
    case 'static': return {transform: 'none'};
    default: return {transform: `scale(${1 + 0.08 * e})`};
  }
};

export const Footage: React.FC<{src: string; trimBefore?: number; pushIn?: boolean; fit?: 'cover' | 'blurfill'; camera?: Camera}> = ({src, trimBefore = 0, pushIn = true, fit = 'cover', camera}) => {
  const f = useCurrentFrame();
  const {durationInFrames, fps} = useVideoConfig();
  const cam = cameraAt(camera ?? (pushIn ? 'pushin' : 'static'), f, durationInFrames);
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
        style={{position: 'absolute', width: '100%', height: '100%', transform: cam.transform, filter: cam.filter}} />
    </AbsoluteFill>
  );
};

/** The subject cut out of the footage (scripts/separate.mjs), drawn ABOVE the scene's graphics so they sit behind
 * the person / product. Matches <Footage> exactly: same crop (cover), same eased push-in, same clip time. */
/** The cut-out plays as a transparent WebM (<dir>/cutout.webm, written by separate.mjs) in a <video> slot, so HyperFrames
 * seeks it frame-exactly with the footage under it. `start` is where the separated stretch begins in the clip. */
export const Cutout: React.FC<{dir: string; trimBefore?: number; pushIn?: boolean; start?: number; frames?: number; camera?: Camera}> = ({dir, trimBefore = 0, pushIn = true, start = 0, frames = Infinity, camera}) => {
  const f = useCurrentFrame();
  const {durationInFrames, fps} = useVideoConfig();
  const idx = Math.round((trimBefore + f / fps - start) * fps);
  const cam = cameraAt(camera ?? (pushIn ? 'pushin' : 'static'), f, durationInFrames);
  return (
    <AbsoluteFill style={{overflow: 'hidden', opacity: idx < 0 || idx >= frames ? 0 : 1}}>
      <Video src={staticFile(`${dir}/cutout.webm`)} muted trimBefore={Math.round((trimBefore - start) * fps)} objectFit="cover"
        style={{position: 'absolute', width: '100%', height: '100%', transform: cam.transform, filter: cam.filter}} />
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
export const EndCard: React.FC<{url?: string; cta?: string; color?: string}> = ({url = T.url, cta, color}) => {
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
        <Txt text={url} at={14} size={64} weight={800} color={color ?? T.endCardText} />
        {cta && (
          <div style={{padding: `${22 * u}px ${54 * u}px`, borderRadius: 999, background: C.accent, color: INK,
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

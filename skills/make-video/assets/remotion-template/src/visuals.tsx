// The animation library: graphics that do the explaining, so no animated scene is only text.
// Every component draws inside a box (px) the scene runner gives it, takes its timing in SECONDS from the
// scene start, and falls back to the brand's motifs (motifs.ts) for shapes, colours and icons - so a pour is
// the brand's own cereal / pills / droplets, in the products' own colours, without naming them each time.
// Built from the bespoke Magic Spoon test (falling cubes, crash graph, gauge, 3D card, stamped badges).
import React from 'react';
import {AbsoluteFill, Img, interpolate, interpolateColors, random, staticFile, useCurrentFrame} from 'remotion';
import {Video} from '@remotion/media';
import {C, FONT, BODY} from './theme';
import {cl, easeIn, easeInOut, ramp, sec, spr, SPRING} from './lib/anim';
import {ICONS, IconName} from './lib/icons';
import {brandColors, brandProp, iconFor, MOTIFS, problemProp, STYLE} from './motifs';

export type Box = {x: number; y: number; w: number; h: number};
export type Shape = 'ring' | 'dot' | 'square' | 'cube' | 'star' | 'sparkle' | 'drop' | 'leaf' | 'heart' | 'bubble' | 'confetti' | 'pill' | 'image';
export const SHAPES: Shape[] = ['ring', 'dot', 'square', 'cube', 'star', 'sparkle', 'drop', 'leaf', 'heart', 'bubble', 'confetti', 'pill', 'image'];
export const BAD = '#FF3B5C';
const src = (s: string) => (/^https?:/.test(s) ? s : staticFile(s));
const m = (b: Box) => Math.min(b.w, b.h);
const Frame: React.FC<{box: Box; children: React.ReactNode; style?: React.CSSProperties}> = ({box, children, style}) => (
  <div style={{position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, ...style}}>{children}</div>
);
const shakeXY = (f: number, at: number, amp: number, len = 10) => {
  if (f < at || f > at + len) return {x: 0, y: 0};
  const k = amp * (1 - (f - at) / len);
  return {x: (random(`sx${f}`) - 0.5) * 2 * k, y: (random(`sy${f}`) - 0.5) * 2 * k};
};

// ------------------------------------------------------------------ primitives

/** One particle / object. `image` = a product cut-out from public/ used as the object itself. */
export const ShapeEl: React.FC<{shape: Shape; size: number; color?: string; image?: string; rot?: number; opacity?: number; style?: React.CSSProperties}> =
  ({shape, size, color = C.accent, image, rot = 0, opacity = 1, style}) => {
    const base: React.CSSProperties = {position: 'absolute', width: size, height: size, transform: `rotate(${rot}deg)`, opacity, ...style};
    const fill = (d: string) => (
      <svg style={base} viewBox="0 0 100 100"><path d={d} fill={color} /></svg>
    );
    switch (shape) {
      case 'image': return image ? <Img src={src(image)} style={{...base, objectFit: 'contain', filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.3))'}} /> : null;
      case 'ring': return <div style={{...base, borderRadius: '50%', border: `${size * 0.28}px solid ${color}`, boxSizing: 'border-box'}} />;
      case 'dot': return <div style={{...base, borderRadius: '50%', background: color}} />;
      case 'square': return <div style={{...base, borderRadius: size * 0.18, background: color}} />;
      case 'confetti': return <div style={{...base, height: size * 0.45, borderRadius: size * 0.08, background: color}} />;
      case 'pill': return <div style={{...base, height: size * 0.48, borderRadius: size, background: `linear-gradient(90deg, ${color} 50%, #ffffff 50%)`}} />;
      case 'bubble': return <div style={{...base, borderRadius: '50%', border: `${Math.max(2, size * 0.06)}px solid ${color}`,
        background: `radial-gradient(circle at 32% 30%, rgba(255,255,255,0.85) 0 12%, ${color}33 13% 100%)`, boxSizing: 'border-box'}} />;
      case 'cube': return <div style={{...base, borderRadius: size * 0.16,
        background: 'radial-gradient(rgba(160,150,190,0.55) 1px, transparent 1.6px) 0 0/7px 7px, linear-gradient(140deg, #ffffff 0%, #f2eff8 55%, #cbc3dc 100%)',
        boxShadow: `inset ${-size * 0.08}px ${-size * 0.1}px 0 rgba(110,90,150,0.28), 0 ${size * 0.18}px ${size * 0.3}px rgba(0,0,0,0.35)`}} />;
      case 'star': return fill(ICONS.star);
      case 'sparkle': return fill(ICONS.sparkle);
      case 'drop': return fill(ICONS.drop);
      case 'heart': return fill(ICONS.heart);
      case 'leaf': return fill('M20 80 C20 40 45 18 82 18 C82 55 60 80 20 80 Z');
      default: return null;
    }
  };

/** A stroke icon drawing itself on (p: 0..1), with an optional red slash for "free from" claims. */
export const Icon: React.FC<{name: IconName; size: number; p: number; color?: string; slash?: boolean; width?: number}> =
  ({name, size, p, color = '#fff', slash, width = 7}) => {
    const dash = (q: number) => ({pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - Math.max(0, Math.min(1, q))});
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" style={{overflow: 'visible'}}>
        <path d={ICONS[name] ?? ICONS.check} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" {...dash(p * 1.25)} />
        {slash && <path d="M16 16 L84 84" fill="none" stroke={BAD} strokeWidth={width * 1.3} strokeLinecap="round" {...dash((p - 0.55) / 0.45)} />}
      </svg>
    );
  };

// ------------------------------------------------------------------ particles

/** Ambient or one-shot particles in the brand's own object. mode: drift | fall | rise | burst | orbit. */
export const Particles: React.FC<{box: Box; shape?: Shape; image?: string; colors?: string[]; count?: number;
  mode?: 'drift' | 'fall' | 'rise' | 'burst' | 'orbit'; at?: number; origin?: {x: number; y: number}; size?: number}> =
  ({box, shape, image, colors, count, mode = 'drift', at = 0, origin = {x: 0.5, y: 0.5}, size}) => {
    const f = useCurrentFrame();
    const prop = brandProp();
    const sh = shape ?? prop.shape, img = image ?? prop.image;
    const cols = colors ?? brandColors();
    const n = Math.round((count ?? 22) * (mode === 'burst' ? 1 : STYLE.density));
    const A = sec(at), base = size ?? m(box) * 0.07;
    return (
      <Frame box={box} style={{overflow: mode === 'burst' ? 'visible' : 'hidden', pointerEvents: 'none'}}>
        {Array.from({length: n}).map((_, i) => {
          const z = random(`pz${i}`), s = base * (0.5 + z * 1.3);
          const blur = z > 0.8 ? (z - 0.8) * 20 : 0;
          let x = 0, y = 0, o = 0.4 + z * 0.55, rot = f * (1 + z * 2) + i * 40;
          if (mode === 'burst') {
            const t = (f - A) / 30;
            if (t < 0 || t > 1.2) return null;
            const ang = random(`pa${i}`) * Math.PI * 2, v = (0.4 + random(`pv${i}`) * 0.8) * m(box);
            x = origin.x * box.w + Math.cos(ang) * v * t; y = origin.y * box.h + Math.sin(ang) * v * t + 0.5 * m(box) * t * t;
            o = 1 - t / 1.2; rot = f * 12 + i * 30;
          } else if (mode === 'orbit') {
            const r = m(box) * (0.32 + z * 0.16), a = (i / n) * Math.PI * 2 + (f - A) / (40 + z * 30);
            x = origin.x * box.w + Math.cos(a) * r; y = origin.y * box.h + Math.sin(a) * r * 0.55;
            o *= ramp(f, A, 15);
          } else {
            const speed = mode === 'fall' ? 6 : mode === 'rise' ? -4 : -1.6;
            const span = box.h + 4 * s;
            x = random(`px${i}`) * box.w + (mode === 'drift' ? Math.sin(f / 40 + i) * 20 : 0);
            y = (((random(`py${i}`) * span + (f - A) * speed * (0.5 + z)) % span) + span) % span - 2 * s;
            o *= ramp(f, A, 12);
          }
          return <ShapeEl key={i} shape={sh} image={img} size={s} color={cols[i % cols.length]} rot={rot} opacity={o}
            style={{left: x - s / 2, top: y - s / 2, filter: blur ? `blur(${blur}px)` : undefined}} />;
        })}
      </Frame>
    );
  };

export const Sparkles: React.FC<{box: Box; count?: number; at?: number; colors?: string[]}> = ({box, count = 8, at = 0, colors}) => {
  const f = useCurrentFrame();
  const cols = colors ?? [C.accent, '#ffffff'];
  return (
    <Frame box={box} style={{pointerEvents: 'none'}}>
      {Array.from({length: count}).map((_, i) => {
        const t0 = sec(at) + i * 3, q = f < t0 ? 0 : Math.sin(Math.min(1, (f - t0) / 18) * Math.PI);
        const s = m(box) * (0.06 + random(`sz${i}`) * 0.06);
        return <ShapeEl key={i} shape="sparkle" size={s} color={cols[i % cols.length]} opacity={q} rot={f * 4}
          style={{left: random(`sx${i}`) * box.w - s / 2, top: random(`sy${i}`) * box.h - s / 2, transform: `scale(${0.4 + q * 0.6}) rotate(${f * 4}deg)`}} />;
      })}
    </Frame>
  );
};

export const Rays: React.FC<{box: Box; color?: string}> = ({box, color = 'rgba(255,255,255,0.08)'}) => {
  const f = useCurrentFrame();
  return (
    <Frame box={box} style={{overflow: 'hidden'}}>
      <AbsoluteFill style={{background: `repeating-conic-gradient(from 0deg at 50% 50%, ${color} 0deg 10deg, transparent 10deg 20deg)`,
        transform: `rotate(${f * 0.4}deg) scale(2.4)`}} />
    </Frame>
  );
};

// ------------------------------------------------------------------ pour: objects fall from a source into a container

/** Something pours the brand's object (or the problem object) into a container, bouncing and piling up.
 * source: a packshot path (tips over), 'box' (an unbranded box with sourceLabel - for the problem), or 'none' (rain). */
export const Pour: React.FC<{box: Box; shape?: Shape; image?: string; colors?: string[]; count?: number; at?: number;
  source?: string; sourceLabel?: string; container?: 'bowl' | 'cup' | 'jar' | 'none'; problem?: boolean}> =
  ({box, shape, image, colors, count = 40, at = 0, source = 'box', sourceLabel = '', container = 'bowl', problem}) => {
    const f = useCurrentFrame();
    const prop = problem ? problemProp() : brandProp();
    const sh = shape ?? prop.shape, img = image ?? prop.image;
    const cols = colors ?? brandColors();
    const A = sec(at), M = m(box);
    const cw = Math.min(box.w * 0.62, box.h * 0.75), cx = box.w / 2, cy = box.h * 0.8;
    const tip = interpolate(f, [A + 6, A + 24], [0, 120], {...cl, easing: easeInOut});
    const th = (-tip * Math.PI) / 180, SC = {x: cx + cw * 0.3, y: box.h * 0.3}, sh2 = box.h * 0.2, sw = Math.min(box.w * 0.28, sh2 * 1.4);
    const spout = source === 'none' ? {x: cx, y: -M * 0.1} : {x: SC.x + sh2 * Math.sin(th), y: SC.y - sh2 * Math.cos(th)};
    const drop = spr(f, A, STYLE.spring);
    const vessel = (part: 'back' | 'front') => {
      if (container === 'none') return null;
      const W = cw, top = cy - W * 0.12;
      const body = container === 'bowl' ? `M0 0 Q${W / 2} ${W * 0.2} ${W} 0 Q${W - W * 0.04} ${W * 0.42} ${W / 2} ${W * 0.45} Q${W * 0.04} ${W * 0.42} 0 0Z`
        : container === 'cup' ? `M0 0 L${W} 0 L${W * 0.86} ${W * 0.62} L${W * 0.14} ${W * 0.62} Z`
          : `M0 0 L${W} 0 L${W} ${W * 0.7} Q${W} ${W * 0.78} ${W * 0.9} ${W * 0.78} L${W * 0.1} ${W * 0.78} Q0 ${W * 0.78} 0 ${W * 0.7} Z`;
      return (
        <svg style={{position: 'absolute', left: cx - W / 2, top, overflow: 'visible'}} width={W} height={W}>
          <defs><linearGradient id="vsl" x1="0" x2="1"><stop offset="0" stopColor="#d9d4e6" /><stop offset="0.45" stopColor="#ffffff" /><stop offset="1" stopColor="#b9b0cf" /></linearGradient></defs>
          {part === 'back' ? <ellipse cx={W / 2} cy={0} rx={W / 2} ry={W * 0.1} fill="rgba(40,30,70,0.85)" />
            : <path d={body} fill="url(#vsl)" opacity={container === 'jar' ? 0.55 : 1} stroke="#fff" strokeWidth={4} />}
        </svg>
      );
    };
    return (
      <Frame box={box}>
        {vessel('back')}
        {Array.from({length: count}).map((_, i) => {
          const t0 = A + 18 + i * 1.8;
          if (f < t0) return null;
          const t = (f - t0) / 30;
          const landX = cx + (random(`lx${i}`) - 0.5) * cw * 0.75 * (1 - i / (count * 1.6));
          const landY = (container === 'none' ? box.h * 0.92 : cy) - Math.floor(i / 9) * M * 0.032 - random(`ly${i}`) * M * 0.02;
          const fall = 0.6 + random(`ft${i}`) * 0.12, k = Math.min(1, t / fall);
          let y = spout.y + (landY - spout.y) * k * k;
          const x = spout.x + (landX - spout.x) * k;
          if (t > fall) { const b = t - fall; y = landY - M * 0.06 * STYLE.bounce * Math.abs(Math.sin(b * 11)) * Math.exp(-b * 9); }
          const s = M * (0.05 + random(`s${i}`) * 0.025);
          return <ShapeEl key={i} shape={sh} image={img} size={s} color={cols[i % cols.length]} rot={random(`r${i}`) * 360 + (t < fall ? f * 9 : 0)}
            style={{left: x - s / 2, top: y - s / 2}} />;
        })}
        {vessel('front')}
        {source !== 'none' && (
          source === 'box'
            ? <div style={{position: 'absolute', left: SC.x - sw / 2, top: SC.y - sh2 - (1 - drop) * box.h, width: sw, height: sh2 * 2,
                transform: `rotate(${-tip}deg)`, borderRadius: 14, background: 'linear-gradient(120deg, #c9b98f, #9c8a5d)', boxShadow: '0 30px 60px rgba(0,0,0,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 10,
                fontFamily: FONT, fontWeight: 800, fontSize: M * 0.045, color: '#5a4a24'}}>{sourceLabel}</div>
            : <Img src={src(source)} style={{position: 'absolute', left: SC.x - sw, top: SC.y - sh2 - (1 - drop) * box.h, width: sw * 2, height: sh2 * 2,
                objectFit: 'contain', transform: `rotate(${-tip}deg)`, filter: 'drop-shadow(0 30px 40px rgba(0,0,0,0.4))'}} />
        )}
      </Frame>
    );
  };

// ------------------------------------------------------------------ shatter: the problem object gets destroyed

export const Shatter: React.FC<{box: Box; shape?: Shape; image?: string; count?: number; at?: number; popAt?: number; problem?: boolean}> =
  ({box, shape, image, count = 6, at = 0, popAt, problem = true}) => {
    const f = useCurrentFrame();
    const prop = problem ? problemProp() : brandProp();
    const sh = shape ?? prop.shape, img = image ?? prop.image;
    const A = sec(at), P = popAt !== undefined ? sec(popAt) : A + 8, M = m(box);
    const c = {x: box.w / 2, y: box.h / 2};
    return (
      <Frame box={box} style={{overflow: 'visible'}}>
        {Array.from({length: count}).map((_, i) => {
          const a = (i / count) * Math.PI * 2, R = M * 0.34;
          const home = {x: c.x + Math.cos(a) * R, y: c.y + Math.sin(a) * R};
          const from = {x: c.x + Math.cos(a) * M * 1.3, y: c.y + Math.sin(a) * M * 1.3};
          const k = ramp(f, A, 7), pop = P + i, s = M * 0.1;
          if (f < pop) return <ShapeEl key={i} shape={sh} image={img} size={s} color={brandColors()[i % 3]} rot={f * 10 + i * 50}
            style={{left: from.x + (home.x - from.x) * k - s / 2, top: from.y + (home.y - from.y) * k - s / 2}} />;
          const t = (f - pop) / 30;
          return (
            <React.Fragment key={i}>
              {t < 0.8 && Array.from({length: 10}).map((_, j) => {
                const g = random(`ga${i}${j}`) * Math.PI * 2, v = M * (0.5 + random(`gv${i}${j}`) * 0.7);
                return <div key={j} style={{position: 'absolute', left: home.x + Math.cos(g) * v * t, top: home.y + Math.sin(g) * v * t + M * t * t,
                  width: M * 0.018, height: M * 0.018, borderRadius: 3, background: '#fff', opacity: 1 - t / 0.8, transform: `rotate(${f * 20 + j * 30}deg)`}} />;
              })}
              {t < 0.4 && <div style={{position: 'absolute', left: home.x - M * 0.08 - t * M * 0.3, top: home.y - M * 0.08 - t * M * 0.3,
                width: M * 0.16 + t * M * 0.6, height: M * 0.16 + t * M * 0.6, borderRadius: '50%', border: `${10 * (1 - t / 0.4)}px solid ${C.accent}`, opacity: 1 - t / 0.4}} />}
            </React.Fragment>
          );
        })}
      </Frame>
    );
  };

// ------------------------------------------------------------------ chart: a line that tells the story

const catmull = (ys: number[], x: number) => {
  const n = ys.length - 1, pos = Math.max(0, Math.min(n, x * n)), i = Math.min(n - 1, Math.floor(pos)), t = pos - i;
  const p0 = ys[Math.max(0, i - 1)], p1 = ys[i], p2 = ys[i + 1], p3 = ys[Math.min(n, i + 2)];
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
};

/** A line drawing itself point by point (energy crash, results climbing, savings growing).
 * points: y 0..1 per x step. times: seconds when the tip reaches each point (sync to the VO). callouts pop at their point. */
export const Chart: React.FC<{box: Box; points: number[]; labels?: string[]; times?: number[]; at?: number; title?: string; meter?: boolean;
  tone?: 'good' | 'bad'; callouts?: {i: number; text: string; tone?: 'good' | 'bad' | 'neutral'; big?: boolean}[]}> =
  ({box, points, labels = [], times, at = 0, title, meter, tone = 'bad', callouts = []}) => {
    const f = useCurrentFrame();
    const n = points.length - 1, M = m(box);
    const T = (times ?? points.map((_, i) => at + i * 0.8)).map(sec);
    const tipX = interpolate(f, T, points.map((_, i) => i / n), {...cl, easing: easeInOut});
    const G = {x: box.w * 0.06, y: box.h * (title ? 0.2 : 0.06), w: box.w * 0.88, h: box.h * (title ? 0.62 : 0.76)};
    const px = (x: number) => G.x + x * G.w, py = (y: number) => G.y + (1 - y) * G.h;
    const pts: string[] = [];
    for (let x = 0; x <= tipX + 1e-6; x += 0.005) pts.push(`${px(x)},${py(catmull(points, Math.min(x, tipX)))}`);
    const tip = {x: px(tipX), y: py(catmull(points, tipX))};
    const big = callouts.find((c) => c.big);
    const sh = big ? shakeXY(f, T[big.i], M * 0.03, 14) : {x: 0, y: 0};
    const lvl = catmull(points, tipX);
    const toneCol = (t?: string) => (t === 'bad' ? BAD : t === 'good' ? C.primary : '#E0A400');
    return (
      <Frame box={box} style={{transform: `translate(${sh.x}px, ${sh.y}px)`}}>
        {title && (
          <div style={{position: 'absolute', top: 0, width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: M * 0.03}}>
            <div style={{fontFamily: FONT, fontWeight: 800, fontSize: M * 0.085, color: '#fff', letterSpacing: 4}}>{title}</div>
            {meter && (
              <div style={{width: M * 0.13, height: M * 0.065, border: `${M * 0.007}px solid #fff`, borderRadius: M * 0.014, padding: M * 0.006, position: 'relative'}}>
                <div style={{height: '100%', width: `${Math.max(6, lvl * 100)}%`, borderRadius: 6, background: interpolateColors(lvl, [0.1, 0.5, 0.9], [BAD, '#FFD45C', C.accent])}} />
              </div>
            )}
          </div>
        )}
        <svg width={box.w} height={box.h} style={{position: 'absolute', overflow: 'visible'}}>
          <defs>
            <linearGradient id="chl" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={C.accent} /><stop offset="0.55" stopColor={tone === 'bad' ? '#FFD45C' : C.onPrimary} /><stop offset="1" stopColor={tone === 'bad' ? BAD : C.accent} />
            </linearGradient>
            <linearGradient id="cha" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.22" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1={G.x} x2={G.x + G.w} y1={py(g)} y2={py(g)} stroke="#fff" strokeOpacity={0.08} strokeWidth={2} />)}
          {pts.length > 1 && <polygon points={`${px(0)},${py(0)} ${pts.join(' ')} ${tip.x},${py(0)}`} fill="url(#cha)" />}
          {pts.length > 1 && <polyline points={pts.join(' ')} fill="none" stroke="url(#chl)" strokeWidth={M * 0.016} strokeLinecap="round" strokeLinejoin="round"
            style={{filter: 'drop-shadow(0 0 16px rgba(255,255,255,0.45))'}} />}
          <circle cx={tip.x} cy={tip.y} r={M * (0.025 + 0.01 * (0.5 + 0.5 * Math.sin(f / 3)))} fill="#fff" opacity={0.25} />
          <circle cx={tip.x} cy={tip.y} r={M * 0.018} fill="#fff" />
          {labels.map((l, i) => {
            const on = ramp(f, T[Math.min(i, n)] - 4, 8);
            return <text key={i} x={px(i / Math.max(1, labels.length - 1))} y={G.y + G.h + M * 0.08} textAnchor="middle" fill="#fff" opacity={0.3 + 0.7 * on}
              style={{fontFamily: FONT, fontWeight: 800, fontSize: M * (0.045 + on * 0.01)}}>{l}</text>;
          })}
        </svg>
        {callouts.map((c, k) => {
          const a = T[c.i], s = spr(f, a, SPRING.pop);
          if (f < a) return null;
          const x = c.i / n, y = points[c.i];
          return (
            <div key={k} style={{position: 'absolute', left: px(Math.min(0.82, Math.max(0.12, x))), top: Math.max(G.y + M * 0.14, py(Math.min(1.05, y + (y > 0.6 ? 0.12 : 0.28)))),
              transform: `translate(-50%, -100%) scale(${c.big ? 2.4 - 1.4 * s : s})`, opacity: Math.min(1, s * 1.5), padding: `${M * 0.014}px ${M * 0.03}px`,
              borderRadius: M * 0.022, background: toneCol(c.tone), fontFamily: FONT, fontWeight: 800, fontSize: M * (c.big ? 0.08 : 0.05), color: '#fff',
              whiteSpace: 'nowrap', boxShadow: '0 14px 30px rgba(0,0,0,0.4)'}}>{c.text}</div>
          );
        })}
        {big && <AbsoluteFill style={{background: toneCol(big.tone), opacity: interpolate(f, [T[big.i], T[big.i] + 2, T[big.i] + 10], [0, 0.4, 0], cl), mixBlendMode: 'screen'}} />}
      </Frame>
    );
  };

// ------------------------------------------------------------------ gauge, counter, card

/** A ring filling to a value (protein, % natural, hours of energy). layout card = glass panel with label beside. */
export const Gauge: React.FC<{box: Box; value: string; fill?: number; label?: string; sub?: string; at?: number; layout?: 'card' | 'center'; rise?: boolean}> =
  ({box, value, fill = 0.86, label, sub, at = 0, layout = 'card', rise = true}) => {
    const f = useCurrentFrame();
    const A = sec(at), M = m(box), p = ramp(f, A, 34) * fill;
    const card = layout === 'card';
    const D = card ? Math.min(box.h * 0.8, box.w * 0.34) : M * 0.7, R = D * 0.42, circ = 2 * Math.PI * R;
    const end = -Math.PI / 2 + p * Math.PI * 2;
    const enter = spr(f, A - 6, STYLE.spring);
    const ring = (
      <div style={{position: 'relative', width: D, height: D, flexShrink: 0}}>
        <svg width={D} height={D} viewBox={`${-D / 2} ${-D / 2} ${D} ${D}`}>
          <defs><linearGradient id="gg"><stop offset="0" stopColor={C.accent} /><stop offset="1" stopColor="#ffffff" /></linearGradient></defs>
          <circle r={R} fill="none" stroke="#fff" strokeOpacity={0.15} strokeWidth={D * 0.085} />
          <circle r={R} fill="none" stroke="url(#gg)" strokeWidth={D * 0.085} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - p)} transform="rotate(-90)" />
          {p > 0.02 && <circle cx={Math.cos(end) * R} cy={Math.sin(end) * R} r={D * 0.06} fill="#fff" style={{filter: `drop-shadow(0 0 12px ${C.accent})`}} />}
        </svg>
        <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
          <div style={{fontFamily: FONT, fontWeight: 800, color: '#fff', fontSize: D * 0.2 * Math.min(1, 5 / Math.max(3, value.length)),
            transform: `scale(${0.4 + 0.6 * spr(f, A, SPRING.pop)})`, opacity: ramp(f, A, 6)}}>{value}</div>
        </AbsoluteFill>
      </div>
    );
    // In a card the words sit beside the ring, so size them off the ring (a short strip would make them tiny).
    const lab = card ? Math.min(D * 0.2, (box.w - D) * 0.11) : M * 0.07;
    const words = (
      <div style={{display: 'flex', flexDirection: 'column', gap: lab * 0.2, alignItems: card ? 'flex-start' : 'center'}}>
        {label && <div style={{fontFamily: FONT, fontWeight: 800, fontSize: lab, color: '#fff', lineHeight: 1.05, textAlign: card ? 'left' : 'center',
          opacity: ramp(f, A + 10, 10), transform: `translateX(${(1 - ramp(f, A + 10, 12)) * 50}px)`}}>{label}</div>}
        {sub && <div style={{fontFamily: BODY, fontWeight: 700, fontSize: lab * 0.68, color: C.accent, opacity: ramp(f, A + 30, 10)}}>{sub}</div>}
      </div>
    );
    return (
      <Frame box={box}>
        {rise && Array.from({length: 12}).map((_, i) => {
          const t = (f - A - i * 5) / 40;
          if (t < 0 || t > 1) return null;
          return <div key={i} style={{position: 'absolute', left: box.w * (0.15 + random(`gx${i}`) * 0.7), top: box.h * (card ? 0.1 : 0.7) - t * M * 0.5,
            fontFamily: FONT, fontWeight: 800, fontSize: M * (0.05 + random(`gz${i}`) * 0.04), color: C.accent, opacity: Math.sin(t * Math.PI)}}>+</div>;
        })}
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: card ? 'row' : 'column', alignItems: 'center', justifyContent: 'center',
          gap: M * 0.04, padding: card ? `0 ${M * 0.05}px` : 0, borderRadius: card ? M * 0.05 : 0, background: card ? `${C.secondary}dd` : 'transparent',
          boxShadow: card ? '0 30px 60px rgba(0,0,0,0.35)' : 'none', transform: `translateY(${(1 - enter) * box.h}px)`}}>
          {ring}{words}
        </div>
      </Frame>
    );
  };

/** Slot-machine digits rolling onto the value ("0g", "80,000+", "$29"). Ranges roll the first number. */
export const Counter: React.FC<{box: Box; value: string; label?: string; at?: number; color?: string}> = ({box, value, label, at = 0, color = '#fff'}) => {
  const f = useCurrentFrame();
  const A = sec(at), M = m(box);
  const mt = value.match(/^(\D*)(\d[\d,]*)(.*)$/);
  const pre = mt?.[1] ?? '', num = mt?.[2] ?? value, post = mt?.[3] ?? '';
  const len = num.replace(/,/g, '').length;
  const size = Math.min(M * 0.42, (box.w * 0.9) / Math.max(2, value.length * 0.62)), DH = size * 0.92;
  return (
    <Frame box={box} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
      <div style={{display: 'flex', alignItems: 'flex-end', opacity: ramp(f, A - 2, 6), transform: `scale(${0.8 + 0.2 * spr(f, A, SPRING.pop)})`}}>
        {pre && <span style={{fontFamily: FONT, fontWeight: 800, fontSize: size * 0.6, color, marginBottom: size * 0.12}}>{pre}</span>}
        {num.split('').map((d, i) => {
          if (!/\d/.test(d)) return <span key={i} style={{fontFamily: FONT, fontWeight: 800, fontSize: size, color, lineHeight: `${DH}px`}}>{d}</span>;
          const k = num.slice(0, i).replace(/,/g, '').length;
          const roll = spr(f, A + k * 3, {damping: 16, stiffness: 120, mass: 0.8});
          const spins = 9 + (len - k) * 2;
          const digits = Array.from({length: spins + 1}, (_, j) => (Number(d) - spins + j + 100) % 10);
          return (
            <div key={i} style={{height: DH, overflow: 'hidden'}}>
              <div style={{transform: `translateY(${-roll * spins * DH}px)`, filter: `blur(${(1 - roll) * 8}px)`}}>
                {digits.map((g, j) => <div key={j} style={{height: DH, lineHeight: `${DH}px`, fontFamily: FONT, fontWeight: 800, fontSize: size, color, textAlign: 'center'}}>{g}</div>)}
              </div>
            </div>
          );
        })}
        {post && <span style={{fontFamily: FONT, fontWeight: 800, fontSize: size * (post.length > 3 ? 0.4 : 0.55), color, marginBottom: size * 0.1,
          opacity: ramp(f, A + len * 3 + 6, 8)}}>{post}</span>}
      </div>
      {label && <div style={{marginTop: M * 0.03, padding: `${M * 0.015}px ${M * 0.05}px`, borderRadius: 999, background: C.accent,
        opacity: ramp(f, A + 10, 8), transform: `translateY(${(1 - ramp(f, A + 10, 10)) * 40}px)`,
        fontFamily: FONT, fontWeight: 800, fontSize: M * 0.08, color: C.secondary, letterSpacing: 4}}>{label}</div>}
    </Frame>
  );
};

/** A 3D card flipping up (nutrition label, spec sheet, ingredient list) with the key row highlighted and circled. */
export const InfoCard: React.FC<{box: Box; title: string; sub?: string; rows: {label: string; value: string; highlight?: boolean}[]; at?: number}> =
  ({box, title, sub, rows, at = 0}) => {
    const f = useCurrentFrame();
    const A = sec(at), M = m(box), flip = spr(f, A, {damping: 14, stiffness: 110, mass: 0.8});
    const fs = Math.min(M * 0.075, box.w * 0.065);
    return (
      <Frame box={box} style={{display: 'flex', alignItems: 'center', justifyContent: 'center', perspective: 1600}}>
        <div style={{width: box.w * 0.9, padding: `${fs * 0.6}px ${fs * 0.8}px ${fs * 0.7}px`, background: '#fff', borderRadius: fs * 0.4, boxShadow: '0 50px 90px rgba(0,0,0,0.5)',
          transform: `rotateX(${(1 - flip) * 80}deg) rotateY(${Math.sin(f / 26) * 5}deg) translateY(${(1 - flip) * 200}px)`, transformOrigin: '50% 100%'}}>
          <div style={{fontFamily: FONT, fontWeight: 800, fontSize: fs * 1.3, color: '#111', lineHeight: 1}}>{title}</div>
          {sub && <div style={{fontFamily: BODY, fontWeight: 700, fontSize: fs * 0.5, color: '#555', marginTop: 6}}>{sub}</div>}
          <div style={{height: fs * 0.28, background: '#111', marginTop: fs * 0.3, transform: `scaleX(${ramp(f, A + 6, 12)})`, transformOrigin: 'left'}} />
          {rows.map((r, i) => {
            const t0 = A + 10 + i * 5, p = ramp(f, t0, 10), hl = A + 18 + rows.length * 5;
            return (
              <div key={i} style={{position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${fs * 0.35}px 6px`,
                borderBottom: '4px solid #111', opacity: p, transform: `translateY(${(1 - p) * 26}px)`}}>
                {r.highlight && <div style={{position: 'absolute', left: -14, right: -14, top: 8, bottom: 8, background: C.accent, borderRadius: 10,
                  transform: `scaleX(${ramp(f, hl, 10)}) skewX(-6deg)`, transformOrigin: 'left'}} />}
                <span style={{position: 'relative', fontFamily: FONT, fontWeight: 800, fontSize: fs, color: '#111'}}>{r.label}</span>
                <span style={{position: 'relative', fontFamily: FONT, fontWeight: 800, fontSize: fs, color: r.highlight ? C.secondary : '#111', whiteSpace: 'nowrap', marginLeft: fs * 0.5}}>
                  {r.value}
                  {r.highlight && <svg style={{position: 'absolute', left: -fs * 0.6, top: -fs * 0.45, overflow: 'visible'}} width={fs * 3.8} height={fs * 2.2} viewBox="0 0 240 140" preserveAspectRatio="none">
                    <path d="M200 20 C120 -10 10 10 12 70 C14 130 210 140 228 70 C240 30 190 10 150 14" fill="none" stroke={BAD} strokeWidth={7} strokeLinecap="round"
                      pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ramp(f, hl + 8, 16)} vectorEffect="non-scaling-stroke" />
                  </svg>}
                </span>
              </div>
            );
          })}
        </div>
      </Frame>
    );
  };

// ------------------------------------------------------------------ badges, icons, steps, orbit

/** Badges stamping in on the beat, each with a self-drawing icon (from the item, else the brand's icon map). */
export const Badges: React.FC<{box: Box; items: {text: string; icon?: IconName; slash?: boolean; at?: number}[]; at?: number; stagger?: number}> =
  ({box, items, at = 0, stagger = 0.8}) => {
    const f = useCurrentFrame();
    const n = items.length, rowH = Math.min(box.h / n - 24, box.w * 0.3), M = m(box);
    const times = items.map((it, i) => sec(it.at ?? at + i * stagger));
    const sh = times.reduce((acc, t) => { const s = shakeXY(f, t + 3, M * 0.012, 7); return {x: acc.x + s.x, y: acc.y + s.y}; }, {x: 0, y: 0});
    return (
      <Frame box={box} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: rowH * 0.25, transform: `translate(${sh.x}px, ${sh.y}px)`}}>
        {items.map((it, i) => {
          const t = times[i], s = spr(f, t, {damping: 12, stiffness: 220, mass: 0.7});
          const mapped = iconFor(it.text);
          const icon = it.icon ?? mapped?.icon ?? 'check', slash = it.slash ?? mapped?.slash;
          const dust = ramp(f, t + 3, 14), rot = (i % 2 ? 3 : -3) + (1 - s) * (i % 2 ? 14 : -14);
          return (
            <div key={i} style={{position: 'relative'}}>
              {f > t + 3 && <div style={{position: 'absolute', inset: -20 - dust * 60, borderRadius: rowH, border: `6px solid ${C.accent}`, opacity: 1 - dust}} />}
              <div style={{width: Math.min(box.w * 0.9, rowH * 4.4), height: rowH, borderRadius: rowH / 2, background: '#fff', display: 'flex', alignItems: 'center', gap: rowH * 0.15,
                padding: `0 ${rowH * 0.2}px`, transform: `scale(${2.2 - 1.2 * s}) rotate(${rot}deg)`, opacity: f < t ? 0 : Math.min(1, s * 2), boxShadow: '0 24px 50px rgba(0,0,0,0.35)'}}>
                <div style={{width: rowH * 0.7, height: rowH * 0.7, borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>
                  <Icon name={icon} slash={slash} size={rowH * 0.6} p={ramp(f, t + 4, 16)} color={C.onPrimary} />
                </div>
                <div style={{fontFamily: FONT, fontWeight: 800, fontSize: Math.min(rowH * 0.32, (Math.min(box.w * 0.9, rowH * 4.4) * 0.66) / Math.max(6, it.text.length) * 1.7), color: C.secondary, lineHeight: 1.05}}>{it.text}</div>
              </div>
            </div>
          );
        })}
      </Frame>
    );
  };

/** One big icon drawing itself inside a disc, rings bursting outward, the brand's object scattering. */
export const IconBurst: React.FC<{box: Box; icon: IconName; slash?: boolean; at?: number; label?: string}> = ({box, icon, slash, at = 0, label}) => {
  const f = useCurrentFrame();
  const A = sec(at), M = m(box), D = M * 0.55, s = spr(f, A, STYLE.spring);
  return (
    <Frame box={box} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: M * 0.05}}>
      <div style={{position: 'relative', width: D, height: D}}>
        {[0, 8, 16].map((d) => { const q = ramp(f, A + d, 24); return (
          <div key={d} style={{position: 'absolute', inset: -q * D * 0.5, borderRadius: '50%', border: `${6 * (1 - q)}px solid ${C.accent}`, opacity: 1 - q}} />); })}
        <div style={{position: 'absolute', inset: 0, borderRadius: '50%', background: C.primary, transform: `scale(${s})`, boxShadow: '0 30px 60px rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <Icon name={icon} slash={slash} size={D * 0.62} p={ramp(f, A + 6, 20)} color={C.onPrimary} width={6} />
        </div>
      </div>
      {label && <div style={{fontFamily: FONT, fontWeight: 800, fontSize: M * 0.08, color: '#fff', opacity: ramp(f, A + 14, 10), textAlign: 'center'}}>{label}</div>}
      <Particles box={{x: -box.w * 0.1, y: -box.h * 0.1, w: box.w * 1.2, h: box.h * 1.2}} mode="burst" at={at + 0.25} count={16} />
    </Frame>
  );
};

/** Numbered path: a line draws through icon nodes, each step popping in (how it works, routine, delivery). */
export const Steps: React.FC<{box: Box; items: {text: string; icon?: IconName}[]; at?: number; stagger?: number}> = ({box, items, at = 0, stagger = 0.7}) => {
  const f = useCurrentFrame();
  const n = items.length, M = m(box), node = Math.min(box.h / n * 0.62, M * 0.22), gapY = box.h / n;
  const x0 = box.w * 0.08 + node / 2;
  const lineP = ramp(f, sec(at), sec(stagger * n), easeInOut);
  return (
    <Frame box={box}>
      <svg width={box.w} height={box.h} style={{position: 'absolute'}}>
        <line x1={x0} x2={x0} y1={gapY / 2} y2={gapY / 2 + (box.h - gapY) * lineP} stroke={C.accent} strokeWidth={node * 0.08} strokeLinecap="round" strokeDasharray={`${node * 0.18} ${node * 0.16}`} />
      </svg>
      {items.map((it, i) => {
        const t = sec(at + i * stagger), s = spr(f, t, STYLE.spring), y = gapY * (i + 0.5);
        const icon = it.icon ?? iconFor(it.text)?.icon ?? 'check';
        return (
          <div key={i} style={{position: 'absolute', left: x0 - node / 2, top: y - node / 2, display: 'flex', alignItems: 'center', gap: node * 0.3}}>
            <div style={{width: node, height: node, borderRadius: '50%', background: C.primary, border: `${node * 0.05}px solid ${C.accent}`, display: 'flex',
              alignItems: 'center', justifyContent: 'center', transform: `scale(${s})`, flexShrink: 0}}>
              <Icon name={icon} size={node * 0.6} p={ramp(f, t + 4, 16)} color={C.onPrimary} />
            </div>
            <div style={{fontFamily: FONT, fontWeight: 800, fontSize: node * 0.32, color: '#fff', maxWidth: box.w * 0.7, opacity: ramp(f, t + 4, 10),
              transform: `translateX(${(1 - ramp(f, t + 4, 12)) * 40}px)`}}>{it.text}</div>
          </div>
        );
      })}
    </Frame>
  );
};

/** Icons orbiting a product (or a big icon): benefits circling the thing that delivers them. */
export const Orbit: React.FC<{box: Box; icons: IconName[]; center?: string; at?: number}> = ({box, icons, center, at = 0}) => {
  const f = useCurrentFrame();
  const A = sec(at), M = m(box), R = M * 0.4, s = spr(f, A, STYLE.spring);
  const img = center ?? MOTIFS.packshots?.[0];
  return (
    <Frame box={box}>
      {img && <Img src={src(img)} style={{position: 'absolute', left: box.w / 2 - M * 0.3, top: box.h / 2 - M * 0.3, width: M * 0.6, height: M * 0.6, objectFit: 'contain',
        transform: `scale(${0.6 + 0.4 * s}) translateY(${Math.sin(f / 18) * 8}px)`, filter: 'drop-shadow(0 30px 40px rgba(0,0,0,0.4))'}} />}
      {icons.map((ic, i) => {
        const t = A + 6 + i * 4, q = spr(f, t, SPRING.pop), a = (i / icons.length) * Math.PI * 2 + (f - A) / 60 - Math.PI / 2;
        const x = box.w / 2 + Math.cos(a) * R * q, y = box.h / 2 + Math.sin(a) * R * 0.85 * q, D = M * 0.17;
        return (
          <div key={i} style={{position: 'absolute', left: x - D / 2, top: y - D / 2, width: D, height: D, borderRadius: '50%', background: '#fff', opacity: f < t ? 0 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 30px rgba(0,0,0,0.3)'}}>
            <Icon name={ic} size={D * 0.62} p={ramp(f, t + 2, 14)} color={C.primary} />
          </div>
        );
      })}
    </Frame>
  );
};

// ------------------------------------------------------------------ product and comparison

/** The website packshot swinging in in 3D, with a glow, optional rays and an idle float. */
export const Packshot: React.FC<{box: Box; src?: string; at?: number; rays?: boolean; swing?: 'y' | 'x' | 'none'}> = ({box, src: s0, at = 0, rays, swing = 'y'}) => {
  const f = useCurrentFrame();
  const A = sec(at), pack = spr(f, A, {damping: 15, stiffness: 90, mass: 1});
  const img = s0 ?? MOTIFS.packshots?.[0];
  if (!img) return null;
  const rot = swing === 'none' ? '' : `rotate${swing === 'y' ? 'Y' : 'X'}(${(1 - pack) * 70}deg)`;
  return (
    <Frame box={box} style={{display: 'flex', alignItems: 'center', justifyContent: 'center', perspective: 1800}}>
      {rays && <Rays box={{x: -box.w * 0.3, y: -box.h * 0.3, w: box.w * 1.6, h: box.h * 1.6}} />}
      <div style={{position: 'absolute', width: m(box) * 0.9, height: m(box) * 0.9, borderRadius: '50%', background: `radial-gradient(circle, ${C.accent}88 0%, transparent 65%)`,
        transform: `scale(${0.6 + 0.4 * pack})`}} />
      <Img src={src(img)} style={{maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', opacity: Math.min(1, pack * 1.6),
        transform: `${rot} translateY(${(1 - pack) * 300 + Math.sin(f / 18) * 10}px) scale(${0.7 + 0.3 * pack})`, filter: 'drop-shadow(0 40px 50px rgba(0,0,0,0.45))'}} />
    </Frame>
  );
};

type Panel = {image?: string; footage?: string; trimBefore?: number; icon?: IconName; label?: string; tone?: 'bad' | 'good'};
/** Two panels with a wiping divider: the old way vs the brand, before vs after. Never name a competitor. */
export const Split: React.FC<{box: Box; a: Panel; b: Panel; at?: number}> = ({box, a, b, at = 0}) => {
  const f = useCurrentFrame();
  const A = sec(at), portrait = box.h > box.w, wipe = ramp(f, A, 18, easeInOut), M = m(box);
  const panel = (p: Panel, second: boolean) => {
    const show = second ? ramp(f, A + 14, 14) : 1;
    const style: React.CSSProperties = portrait
      ? {position: 'absolute', left: 0, width: box.w, top: second ? box.h / 2 : 0, height: box.h / 2}
      : {position: 'absolute', top: 0, height: box.h, left: second ? box.w / 2 : 0, width: box.w / 2};
    const bad = p.tone === 'bad';
    const mark = bad ? 'cross' : p.tone === 'good' ? 'check' : undefined;
    const q = spr(f, A + (second ? 26 : 12), SPRING.pop);
    return (
      <div style={{...style, overflow: 'hidden', clipPath: second ? (portrait ? `inset(${(1 - show) * 100}% 0 0 0)` : `inset(0 0 0 ${(1 - show) * 100}%)`) : undefined,
        background: bad ? '#2a1a22' : C.primary}}>
        {p.footage && <Video src={src(p.footage)} muted trimBefore={sec(p.trimBefore ?? 0)} objectFit="cover"
          style={{position: 'absolute', width: '100%', height: '100%', filter: bad ? 'grayscale(0.85) brightness(0.7)' : 'none'}} />}
        {p.image && <Img src={src(p.image)} style={{position: 'absolute', inset: '12%', width: '76%', height: '76%', objectFit: 'contain', filter: bad ? 'grayscale(0.9)' : 'drop-shadow(0 20px 30px rgba(0,0,0,0.4))'}} />}
        {p.icon && !p.image && !p.footage && <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <Icon name={p.icon} size={M * 0.3} p={ramp(f, A + (second ? 18 : 4), 18)} color="#fff" /></div>}
        {bad && <AbsoluteFill style={{background: `${BAD}22`}} />}
        {p.label && <div style={{position: 'absolute', left: M * 0.04, top: M * 0.04, padding: `${M * 0.012}px ${M * 0.03}px`, borderRadius: 999,
          background: bad ? BAD : C.accent, color: bad ? '#fff' : C.secondary, fontFamily: FONT, fontWeight: 800, fontSize: M * 0.05}}>{p.label}</div>}
        {mark && <div style={{position: 'absolute', right: M * 0.04, bottom: M * 0.04, width: M * 0.16, height: M * 0.16, borderRadius: '50%', background: bad ? BAD : C.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${q})`}}>
          <Icon name={mark} size={M * 0.11} p={ramp(f, A + (second ? 28 : 14), 10)} color={bad ? '#fff' : C.secondary} width={11} /></div>}
      </div>
    );
  };
  return (
    <Frame box={box} style={{borderRadius: M * 0.04, overflow: 'hidden'}}>
      {panel(a, false)}{panel(b, true)}
      <div style={{position: 'absolute', background: '#fff', boxShadow: '0 0 30px rgba(255,255,255,0.8)',
        ...(portrait ? {left: 0, top: box.h / 2 - 4, height: 8, width: box.w * wipe} : {top: 0, left: box.w / 2 - 4, width: 8, height: box.h * wipe})}} />
    </Frame>
  );
};

/** The product in the middle, leader lines drawing out to labelled features (each with its icon). */
export const Callouts: React.FC<{box: Box; items: {text: string; icon?: IconName}[]; src?: string; at?: number; stagger?: number}> =
  ({box, items, src: s0, at = 0, stagger = 0.45}) => {
    const f = useCurrentFrame();
    const A = sec(at), M = m(box), img = s0 ?? MOTIFS.cutouts?.[0] ?? MOTIFS.packshots?.[0];
    const c = {x: box.w / 2, y: box.h / 2}, P = M * 0.52, pack = spr(f, A, STYLE.spring);
    const n = items.length;
    // Labels sit on an ellipse around the product, spread evenly, starting top-left.
    const spot = (i: number) => {
      const a = -Math.PI * 0.75 + (i / n) * Math.PI * 2;
      return {x: c.x + Math.cos(a) * box.w * 0.36, y: c.y + Math.sin(a) * box.h * 0.42};
    };
    return (
      <Frame box={box}>
        {img && <Img src={src(img)} style={{position: 'absolute', left: c.x - P / 2, top: c.y - P / 2, width: P, height: P, objectFit: 'contain',
          opacity: Math.min(1, pack * 1.5), transform: `scale(${0.7 + 0.3 * pack}) translateY(${Math.sin(f / 20) * 6}px)`, filter: 'drop-shadow(0 30px 40px rgba(0,0,0,0.4))'}} />}
        <svg width={box.w} height={box.h} style={{position: 'absolute', overflow: 'visible'}}>
          {items.map((_, i) => {
            const t = A + 8 + sec(i * stagger), s = spot(i);
            const ang = Math.atan2(s.y - c.y, s.x - c.x), e = {x: c.x + Math.cos(ang) * P * 0.36, y: c.y + Math.sin(ang) * P * 0.36};
            const p = ramp(f, t, 12);
            return (
              <g key={i}>
                <line x1={e.x} y1={e.y} x2={e.x + (s.x - e.x) * p} y2={e.y + (s.y - e.y) * p} stroke={C.accent} strokeWidth={M * 0.008} strokeLinecap="round" />
                <circle cx={e.x} cy={e.y} r={M * 0.014 * Math.min(1, p * 3)} fill={C.accent} />
              </g>
            );
          })}
        </svg>
        {items.map((it, i) => {
          const t = A + 18 + sec(i * stagger), s = spot(i), q = spr(f, t, SPRING.pop);
          const icon = it.icon ?? iconFor(it.text)?.icon ?? 'check', slash = iconFor(it.text)?.slash;
          const D = M * 0.17;
          return (
            <div key={i} style={{position: 'absolute', left: s.x, top: s.y, transform: `translate(-50%, -50%) scale(${q})`, opacity: f < t ? 0 : 1,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: M * 0.012, maxWidth: box.w * 0.4}}>
              <div style={{width: D, height: D, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 24px rgba(0,0,0,0.3)'}}>
                <Icon name={icon} slash={slash} size={D * 0.66} p={ramp(f, t + 2, 14)} color={C.primary} />
              </div>
              <div style={{fontFamily: FONT, fontWeight: 800, fontSize: M * 0.065, color: '#fff', textAlign: 'center', lineHeight: 1.05, textShadow: '0 4px 14px rgba(0,0,0,0.45)'}}>{it.text}</div>
            </div>
          );
        })}
      </Frame>
    );
  };

/** A unit chart: a grid of icons (or the brand's object) filling one by one, the highlighted ones in the accent. */
export const Grid: React.FC<{box: Box; total?: number; highlight: number; icon?: IconName; shape?: Shape; label?: string; at?: number}> =
  ({box, total = 10, highlight, icon = 'smile', shape, label, at = 0}) => {
    const f = useCurrentFrame();
    const A = sec(at), M = m(box), cols = total <= 10 ? 5 : 10, rows = Math.ceil(total / cols);
    const cell = Math.min((box.w * 0.9) / cols, (box.h * (label ? 0.66 : 0.86)) / rows);
    const per = Math.max(1, Math.round(sec(1.2) / total));
    return (
      <Frame box={box} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: M * 0.05}}>
        <div style={{display: 'grid', gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gap: 0}}>
          {Array.from({length: total}).map((_, i) => {
            const t = A + i * per, s = spr(f, t, SPRING.pop), on = i < highlight;
            const col = on ? C.accent : 'rgba(255,255,255,0.28)';
            return (
              <div key={i} style={{width: cell, height: cell, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${s})`, opacity: f < t ? 0 : 1}}>
                {shape ? <div style={{position: 'relative', width: cell * 0.7, height: cell * 0.7}}><ShapeEl shape={shape} size={cell * 0.7} color={col} /></div>
                  : <Icon name={icon} size={cell * 0.72} p={ramp(f, t, 10)} color={col} width={8} />}
              </div>
            );
          })}
        </div>
        {label && <div style={{fontFamily: FONT, fontWeight: 800, fontSize: M * 0.07, color: '#fff', textAlign: 'center', opacity: ramp(f, A + total * per, 10)}}>{label}</div>}
      </Frame>
    );
  };

// ------------------------------------------------------------------ hand-drawn marks

/** A marker stroke over or around something: underline, strike, circle, arrow. Decoration - pair it with a real visual. */
export const Scribble: React.FC<{box: Box; style: 'underline' | 'strike' | 'circle' | 'arrow'; at?: number; color?: string}> = ({box, style, at = 0, color}) => {
  const f = useCurrentFrame();
  const d = {underline: 'M2 80 Q30 66 50 76 T98 72', strike: 'M2 60 L20 44 L36 62 L54 42 L72 60 L98 40',
    circle: 'M80 10 C50 -4 4 8 5 50 C6 92 90 98 96 50 C99 22 76 8 58 10', arrow: 'M4 80 Q40 20 90 30 M74 16 L92 30 L76 46'}[style];
  return (
    <Frame box={box}>
      <svg width={box.w} height={box.h} viewBox="0 0 100 100" preserveAspectRatio="none" style={{overflow: 'visible'}}>
        <path d={d} fill="none" stroke={color ?? (style === 'strike' ? BAD : '#FFD45C')} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round"
          vectorEffect="non-scaling-stroke" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ramp(f, sec(at), 12, easeIn)} />
      </svg>
    </Frame>
  );
};

// ------------------------------------------------------------------ the registry the scene runner uses

export type Visual =
  | ({kind: 'particles'} & Omit<React.ComponentProps<typeof Particles>, 'box'>)
  | ({kind: 'pour'} & Omit<React.ComponentProps<typeof Pour>, 'box'>)
  | ({kind: 'shatter'} & Omit<React.ComponentProps<typeof Shatter>, 'box'>)
  | ({kind: 'chart'} & Omit<React.ComponentProps<typeof Chart>, 'box'>)
  | ({kind: 'gauge'} & Omit<React.ComponentProps<typeof Gauge>, 'box'>)
  | ({kind: 'counter'} & Omit<React.ComponentProps<typeof Counter>, 'box'>)
  | ({kind: 'card'} & Omit<React.ComponentProps<typeof InfoCard>, 'box'>)
  | ({kind: 'badges'} & Omit<React.ComponentProps<typeof Badges>, 'box'>)
  | ({kind: 'icon'} & Omit<React.ComponentProps<typeof IconBurst>, 'box'>)
  | ({kind: 'steps'} & Omit<React.ComponentProps<typeof Steps>, 'box'>)
  | ({kind: 'orbit'} & Omit<React.ComponentProps<typeof Orbit>, 'box'>)
  | ({kind: 'packshot'} & Omit<React.ComponentProps<typeof Packshot>, 'box'>)
  | ({kind: 'split'} & Omit<React.ComponentProps<typeof Split>, 'box'>)
  | ({kind: 'scribble'} & Omit<React.ComponentProps<typeof Scribble>, 'box'>)
  | ({kind: 'sparkles'} & Omit<React.ComponentProps<typeof Sparkles>, 'box'>)
  | ({kind: 'rays'} & Omit<React.ComponentProps<typeof Rays>, 'box'>)
  | ({kind: 'callouts'} & Omit<React.ComponentProps<typeof Callouts>, 'box'>)
  | ({kind: 'grid'} & Omit<React.ComponentProps<typeof Grid>, 'box'>);
export type VisualOf = Visual & {box?: {x: number; y: number; w: number; h: number}; layer?: 'back' | 'main' | 'front'};

/** Decoration only - a scene whose only non-text layers are these still counts as text-only. */
export const DECORATIVE = ['scribble', 'sparkles', 'rays'];
/** Animated type (rolling digits) - still text. A counter needs a real visual beside it. */
export const TEXTLIKE = ['counter'];
/** A visual that, on its own, makes a scene more than text. */
export const isRealVisual = (k: string) => !DECORATIVE.includes(k) && !TEXTLIKE.includes(k);
export const KINDS = ['particles', 'pour', 'shatter', 'chart', 'gauge', 'counter', 'card', 'badges', 'icon', 'steps', 'orbit', 'packshot', 'split', 'callouts', 'grid', ...DECORATIVE];
export const defaultLayer = (k: string) => (k === 'particles' || k === 'rays' ? 'back' : k === 'scribble' || k === 'sparkles' ? 'front' : 'main');

export const VisualView: React.FC<{v: VisualOf; box: Box}> = ({v, box}) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {kind, box: _b, layer: _l, ...p} = v as VisualOf & Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const P = p as any;
  switch (kind) {
    case 'particles': return <Particles box={box} {...P} />;
    case 'pour': return <Pour box={box} {...P} />;
    case 'shatter': return <Shatter box={box} {...P} />;
    case 'chart': return <Chart box={box} {...P} />;
    case 'gauge': return <Gauge box={box} {...P} />;
    case 'counter': return <Counter box={box} {...P} />;
    case 'card': return <InfoCard box={box} {...P} />;
    case 'badges': return <Badges box={box} {...P} />;
    case 'icon': return <IconBurst box={box} {...P} />;
    case 'steps': return <Steps box={box} {...P} />;
    case 'orbit': return <Orbit box={box} {...P} />;
    case 'packshot': return <Packshot box={box} {...P} />;
    case 'split': return <Split box={box} {...P} />;
    case 'scribble': return <Scribble box={box} {...P} />;
    case 'sparkles': return <Sparkles box={box} {...P} />;
    case 'rays': return <Rays box={box} {...P} />;
    case 'callouts': return <Callouts box={box} {...P} />;
    case 'grid': return <Grid box={box} {...P} />;
    default: throw new Error(`unknown visual kind "${kind}" - see animation-library.md`);
  }
};

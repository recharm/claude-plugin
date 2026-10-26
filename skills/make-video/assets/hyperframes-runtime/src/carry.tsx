// Shape-carried transitions: "a shape carries the eye across every transition" - the join is an OBJECT, not a
// frame move. Idea after Barty-Bart/motion-graphics "explainer-high-energy" (MIT); built for this template.
//   dot     - a dot of brand colour grows from a point to fill the frame; the next scene opens out of it
//   ring    - a ring expands from the point; the next scene is seen through its hole
//   flood   - a wave of brand colour rises and carries the next scene up behind it
//   bar     - a diagonal band sweeps across; the next scene is laid down in its wake
//   object  - the brand's own object (motifs props: a cereal loop, a capsule, a leaf...) flies up and fills the frame;
//             a ring-shaped object becomes a zoom THROUGH its hole
// The shape is drawn only on the scene's "base" layer, so a layered export (export_ae) doesn't stack copies of it.
import React, {createContext, useContext} from 'react';
import {AbsoluteFill, interpolate, useVideoConfig} from 'remotion';
import type {TransitionPresentation, TransitionPresentationComponentProps} from '@remotion/transitions';
import {C} from './theme';
import {easeInOut} from './lib/anim';
import {brandProp} from './motifs';
import {ShapeEl} from './visuals';

/** Which layer is rendering (export_ae / export_nle render parts separately); undefined = the whole frame. */
export const PartCtx = createContext<string | undefined>(undefined);

/** Does a layer filter show this part? The filter is a part name ("base", "v2", "text"), a comma list of them
 * ("text,list"), or an exclusion list ("!base,!text" = everything else). "visuals" stands for every v<k>. */
export const partShows = (only: string | undefined, p: string) => {
  if (!only) return true;
  const toks = only.split(',').map((t) => t.trim()).filter(Boolean);
  const hit = (t: string) => t === p || (t === 'visuals' && /^vd+$/.test(p));
  const neg = toks.filter((t) => t.startsWith('!')).map((t) => t.slice(1)), pos = toks.filter((t) => !t.startsWith('!'));
  if (neg.some(hit)) return false;
  return pos.length ? pos.some(hit) : true;
};

export type CarryVariant = 'dot' | 'ring' | 'flood' | 'bar' | 'object';
type CarryProps = {variant: CarryVariant; x: number; y: number; color: string};

const cl01 = (v: number) => Math.max(0, Math.min(1, v));

const CarryView: React.FC<TransitionPresentationComponentProps<CarryProps>> = ({children, presentationDirection, presentationProgress: p, passedProps}) => {
  const {width: W, height: H} = useVideoConfig();
  const part = useContext(PartCtx);
  const drawShape = partShows(part, 'base');
  // The outgoing scene stays put; the incoming one draws the shape over it and opens out of it.
  if (presentationDirection === 'exiting') return <AbsoluteFill>{children}</AbsoluteFill>;
  const {variant, x, y, color} = passedProps;
  const cx = x * W, cy = y * H;
  const far = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) * 1.04;
  const a = easeInOut(cl01(p / 0.58)); // the shape arrives and covers
  const b = easeInOut(cl01((p - 0.42) / 0.58)); // the next scene opens out of it
  const reveal = (clip: string) => <AbsoluteFill style={{clipPath: clip, WebkitClipPath: clip}}>{children}</AbsoluteFill>;

  if (variant === 'ring') {
    const t = Math.min(W, H) * 0.16;
    const R = interpolate(p, [0, 1], [0, far + t], {easing: easeInOut});
    return (
      <AbsoluteFill>
        {reveal(`circle(${Math.max(0, R - t)}px at ${cx}px ${cy}px)`)}
        {drawShape && R > 0 && <div style={{position: 'absolute', left: cx - R, top: cy - R, width: 2 * R, height: 2 * R, borderRadius: '50%',
          border: `${Math.min(t, R)}px solid ${color}`, boxSizing: 'border-box'}} />}
      </AbsoluteFill>
    );
  }
  if (variant === 'flood') {
    // a wave rises past the top (a), then the next scene rises in behind a second wave (b)
    const wave = (level: number, phase: number) => {
      const pts: string[] = [];
      const yTop = H - level * (H * 1.15);
      for (let i = 0; i <= 24; i++) {
        const xx = (i / 24) * W;
        pts.push(`${xx.toFixed(1)}px ${(yTop + Math.sin(i / 24 * Math.PI * 3 + phase) * H * 0.025).toFixed(1)}px`);
      }
      return `polygon(${pts.join(', ')}, ${W}px ${H}px, 0px ${H}px)`;
    };
    return (
      <AbsoluteFill>
        {drawShape && <AbsoluteFill style={{background: color, clipPath: wave(a, p * 6)}} />}
        {reveal(wave(b, p * 6 + 1.3))}
      </AbsoluteFill>
    );
  }
  if (variant === 'bar') {
    const bw = W * 0.42, skew = H * 0.28;
    const lead = interpolate(p, [0, 1], [-bw * 0.2, W + bw + skew], {easing: easeInOut});
    const trail = lead - bw;
    const band = `polygon(${trail + skew}px 0px, ${lead + skew}px 0px, ${lead - skew}px ${H}px, ${trail - skew}px ${H}px)`;
    const behind = `polygon(-${skew * 2}px 0px, ${trail + skew}px 0px, ${trail - skew}px ${H}px, -${skew * 2}px ${H}px)`;
    return (
      <AbsoluteFill>
        {reveal(behind)}
        {drawShape && <AbsoluteFill style={{background: color, clipPath: band}} />}
      </AbsoluteFill>
    );
  }
  if (variant === 'object') {
    const prop = brandProp();
    const size = interpolate(a, [0, 1], [Math.min(W, H) * 0.12, Math.max(W, H) * 2.9]);
    const rot = interpolate(p, [0, 1], [-40, 25]);
    const ringHole = prop.shape === 'ring';
    // a ring-shaped object: the next scene appears inside its hole as it flies at the camera
    const clip = ringHole ? `circle(${size * 0.22}px at ${cx}px ${cy}px)` : `circle(${b * far}px at ${cx}px ${cy}px)`;
    return (
      <AbsoluteFill>
        {!ringHole && reveal(clip)}
        {drawShape && <ShapeEl shape={prop.shape} image={prop.image} size={size} color={color} rot={rot}
          style={{left: cx - size / 2, top: cy - size / 2, opacity: ringHole ? 1 : 1 - b}} />}
        {ringHole && reveal(clip)}
      </AbsoluteFill>
    );
  }
  // dot
  return (
    <AbsoluteFill>
      {drawShape && <div style={{position: 'absolute', left: cx - a * far, top: cy - a * far, width: 2 * a * far, height: 2 * a * far, borderRadius: '50%', background: color}} />}
      {reveal(`circle(${b * far}px at ${cx}px ${cy}px)`)}
    </AbsoluteFill>
  );
};

const colorOf = (c?: string) => (!c || c === 'accent' ? C.accent : c === 'primary' ? C.primary : c === 'secondary' ? C.secondary : c);

export const carry = (t: {variant?: CarryVariant; at?: {x: number; y: number}; color?: string}): TransitionPresentation<CarryProps> => ({
  component: CarryView,
  props: {variant: t.variant ?? 'dot', x: t.at?.x ?? 0.5, y: t.at?.y ?? 0.55, color: colorOf(t.color)},
});

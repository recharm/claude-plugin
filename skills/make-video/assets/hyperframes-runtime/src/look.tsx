// The ad's "look": one finishing layer over every scene (hf_build mounts it above them, for the whole ad), after the
// HyperFrames registry's texture / overlay blocks (grain, vignette, light sweep, halftone; Apache-2.0, ideas rewritten).
//   film   - moving grain, a soft vignette, a faint warm lift
//   paper  - printed-paper grain and fibres, multiplied in
//   print  - a fine halftone screen and a hint of colour misregistration at the edges
//   sweep  - a soft light band sweeps across every few seconds, like a sheen on packaging
// "clean" (or none) adds nothing. The brand's motifs.json "look" sets it; a scene list can override with "look".
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {C} from './theme';

export type Look = 'clean' | 'film' | 'paper' | 'print' | 'sweep';
export const LOOKS: Look[] = ['clean', 'film', 'paper', 'print', 'sweep'];

export const LookLayer: React.FC<{look: Look}> = ({look}) => {
  const f = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  if (look === 'film') {
    const seed = f % 8; // grain changes every frame, cycling 8 patterns
    return (
      <AbsoluteFill style={{pointerEvents: 'none'}}>
        <svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity: 0.16, mixBlendMode: 'overlay'}}>
          <filter id={`lk-film-${seed}`}><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={seed + 3} stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter>
          <rect width="100%" height="100%" filter={`url(#lk-film-${seed})`} />
        </svg>
        <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,0.42) 100%)'}} />
        <AbsoluteFill style={{background: 'rgba(255,170,90,0.05)'}} />
      </AbsoluteFill>
    );
  }
  if (look === 'paper') {
    return (
      <AbsoluteFill style={{pointerEvents: 'none'}}>
        <svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity: 0.22, mixBlendMode: 'multiply'}}>
          <filter id="lk-paper"><feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves={3} seed={11} /><feColorMatrix type="saturate" values="0" /></filter>
          <rect width="100%" height="100%" filter="url(#lk-paper)" />
        </svg>
        <svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity: 0.1, mixBlendMode: 'multiply'}}>
          <filter id="lk-fibre"><feTurbulence type="fractalNoise" baseFrequency="0.008 0.09" numOctaves={2} seed={4} /><feColorMatrix type="saturate" values="0" /></filter>
          <rect width="100%" height="100%" filter="url(#lk-fibre)" />
        </svg>
      </AbsoluteFill>
    );
  }
  if (look === 'print') {
    const cell = Math.round(Math.min(W, H) / 220);
    return (
      <AbsoluteFill style={{pointerEvents: 'none'}}>
        <AbsoluteFill style={{opacity: 0.13, mixBlendMode: 'multiply', backgroundImage: `radial-gradient(circle, #000 ${cell * 0.32}px, transparent ${cell * 0.4}px)`, backgroundSize: `${cell}px ${cell}px`}} />
        <AbsoluteFill style={{boxShadow: `inset 4px 0 0 ${C.accent}22, inset -4px 0 0 ${C.primary}22`}} />
      </AbsoluteFill>
    );
  }
  if (look === 'sweep') {
    const period = 150, k = (f % period) / period; // a pass every 5 seconds, taking about 1.3s
    const x = -0.4 + k * 4;
    return (
      <AbsoluteFill style={{pointerEvents: 'none'}}>
        {x < 1.4 && <AbsoluteFill style={{background: `linear-gradient(110deg, transparent ${(x - 0.25) * 100}%, rgba(255,255,255,0.16) ${x * 100}%, transparent ${(x + 0.25) * 100}%)`}} />}
        <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 45%, transparent 60%, rgba(0,0,0,0.25) 100%)'}} />
      </AbsoluteFill>
    );
  }
  return null;
};

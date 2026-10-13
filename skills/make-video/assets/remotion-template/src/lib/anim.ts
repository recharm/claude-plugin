// Animation helpers. Adapted from MotionCraft (MIT, ahmdd4vd) - see CREDITS.md.
// Every animated property eases: ease-out entering, ease-in leaving, ease-in-out for camera moves,
// springs for tactile things. Linear only for ambient loops.
import {Easing, interpolate, spring} from 'remotion';

export const FPS = 30;
export const cl = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const easeOut = Easing.bezier(0.22, 1, 0.36, 1);
export const easeIn = Easing.in(Easing.quad);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

export type SpringCfg = {damping: number; stiffness: number; mass: number};
export const SPRING = {
  soft: {damping: 200, stiffness: 120, mass: 1},
  tactile: {damping: 13, stiffness: 150, mass: 0.6},
  pop: {damping: 11, stiffness: 180, mass: 0.6},
} satisfies Record<string, SpringCfg>;

/** Spring sampled at 60fps internally so 30fps renders stay smooth. `at` is the start frame. */
export const spr = (f: number, at: number, c: SpringCfg = SPRING.tactile) =>
  spring({frame: (f - at) * (60 / FPS), fps: 60, config: c});

/** 0 -> 1 over `len` frames from `at`, eased. */
export const ramp = (f: number, at: number, len: number, e = easeOut) =>
  interpolate(f, [at, at + len], [0, 1], {...cl, easing: e});

/** 1 -> 0 over `len` frames from `at` (for exits). */
export const out = (f: number, at: number, len: number) => 1 - ramp(f, at, len, easeIn);

export const sec = (s: number) => Math.round(s * FPS);

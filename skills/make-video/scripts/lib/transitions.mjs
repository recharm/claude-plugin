// Transition types and their default lengths (seconds) - the runtime's Ad.tsx / transitions-plus.tsx hold the same
// table. Used wherever scene timing is computed outside the runtime: hf_build, export_ae, mg_plan, mg_check.
export const BASE_TYPES = ['fade', 'slide', 'wipe', 'whip', 'zoom', 'iris', 'carry'];
export const PLUS_SECONDS = {lightleak: 0.7, ink: 0.7, torn: 0.6, halftone: 0.6, glitch: 0.35, ripple: 0.6, chromatic: 0.45, vortex: 0.6, warp: 0.6, collage: 0.8, burn: 0.7, flash: 0.3, pixel: 0.6};
export const TRANSITION_TYPES = [...BASE_TYPES, ...Object.keys(PLUS_SECONDS)];
export const defaultSeconds = (type) => (type === 'carry' ? 0.6 : PLUS_SECONDS[type] ?? 0.4);
/** Frames a transition overlaps the two scenes it joins (0 for a hard cut). */
export const transitionFrames = (t, fps = 30) => (t ? Math.round((t.seconds ?? defaultSeconds(t.type)) * fps) : 0);

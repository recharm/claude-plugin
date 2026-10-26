// The names an ad JSON may use, in one place - mg_check validates against them, review.mjs offers them in its menus.
// Keep in step with the runtime: components.tsx (Preset, BgStyle, Camera), look.tsx (LOOKS), carry.tsx (CarryVariant).
export {TRANSITION_TYPES} from './transitions.mjs';
export const BG_STYLES = ['glow', 'gradient', 'spotlight', 'grid', 'paper', 'pattern', 'blur-footage', 'split', 'mesh', 'aurora', 'marble', 'liquid', 'godrays', 'blobs', 'voronoi', 'smoke'];
export const PRESETS = ['fade', 'fadeRise', 'fadeDrop', 'scalePop', 'slideInSequence', 'slam', 'perWord', 'perChar', 'scramble', 'typewriter', 'tracking', 'blurIn', 'marker', 'strike', 'mask'];
export const CAMERAS = ['pushin', 'pullback', 'drift', 'rack', 'handheld', 'punch', 'static'];
export const LOOKS = ['clean', 'film', 'paper', 'print', 'sweep'];
export const BG_TONES = ['primary', 'secondary', 'dark', 'ground'];
export const CARRY_VARIANTS = ['dot', 'ring', 'flood', 'bar', 'object'];

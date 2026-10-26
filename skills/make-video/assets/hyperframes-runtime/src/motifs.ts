// The brand's motifs: what its animations are made of. mg_init.mjs copies the brand cache's motifs.json
// (written by brand_motifs.mjs from the website and the Recharm library) into the project.
// Components fall back to these when a scene doesn't name a shape, colour or icon, so even a minimal
// scene animates with the brand's own objects (cereal loops, droplets, pills...) and product colours.
import {motifs} from '../shim/globals';
import {C} from './theme';
import type {IconName} from './lib/icons';
import type {Shape} from './visuals';

type Prop = {shape: Shape; image?: string; why?: string};
type M = {
  brand: string; category: string; style: 'playful' | 'premium' | 'clinical' | 'bold' | string; confirmed?: boolean;
  props: Prop[]; problemObjects: Prop[]; productColors: string[]; packshots: string[]; cutouts?: string[];
  icons: Record<string, {icon: IconName; slash?: boolean}>;
};
export const MOTIFS = motifs as unknown as M;

/** The brand's main particle object - what fills the frame when a scene doesn't say. */
export const brandProp = (): Prop => MOTIFS.props?.[0] ?? {shape: 'dot'};
/** The "problem" object the brand is the answer to (sugar cubes, pimples, plastic...) - for problem beats. */
export const problemProp = (): Prop => MOTIFS.problemObjects?.[0] ?? {shape: 'cube'};
/** Particle colours: the products' own colours first, then the palette. */
export const brandColors = (): string[] => {
  const pc = (MOTIFS.productColors ?? []).slice(0, 5);
  return [...pc, C.accent, C.onPrimary, C.primary].filter((v, i, a) => v && a.indexOf(v) === i);
};
/** Springs and densities follow the brand's style: playful bounces, premium glides. */
export const STYLE = (() => {
  switch (MOTIFS.style) {
    case 'playful': return {bounce: 1, density: 1.2, spring: {damping: 10, stiffness: 170, mass: 0.6}};
    case 'premium': return {bounce: 0.25, density: 0.6, spring: {damping: 26, stiffness: 110, mass: 1}};
    case 'clinical': return {bounce: 0.3, density: 0.7, spring: {damping: 22, stiffness: 140, mass: 0.8}};
    default: return {bounce: 0.7, density: 1, spring: {damping: 13, stiffness: 160, mass: 0.7}};
  }
})();
/** Look up a claim word ("gluten free", "vegan") in the brand's icon map. */
export const iconFor = (text: string): {icon: IconName; slash?: boolean} | undefined => {
  const t = text.toLowerCase();
  const hit = Object.keys(MOTIFS.icons ?? {}).sort((a, b) => b.length - a.length).find((k) => t.includes(k.toLowerCase()));
  return hit ? MOTIFS.icons[hit] : undefined;
};

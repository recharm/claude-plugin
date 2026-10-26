// The brand theme. mg_init.mjs writes theme.json from the brand cache's brand.json; components read
// colours, fonts and the logo only from here, so one template serves every brand.
import {theme as projectTheme} from '../shim/globals';

export type Theme = {aspect: string; url: string; logo?: string; endCardText?: string; color: Record<string, string> & {primary: string; secondary: string; accent: string; ground: string; text: string; onPrimary: string; dark: string};
  font: {heading: string; body: string; files: {family: string; file: string; weight: number}[]}};
const theme = projectTheme as Theme;
export const T = theme;

export const C = theme.color;
export const FONT = `"${theme.font.heading}", "Poppins", sans-serif`;
export const BODY = `"${theme.font.body}", "Poppins", sans-serif`;

// The brand's deepest colour, by real brightness - for text on white / accent pills and for dark panels.
// (Brands differ: one's "secondary" is a deep green, another's is cream.)
const lum = (h: string) => (/^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).reduce((a, c, k) => a + c * [0.2126, 0.7152, 0.0722][k], 0) : 1);
/** Relative luminance 0..1 of a #rrggbb colour (1 for anything else). */
export const lumOf = (h?: string) => (h && /^#[0-9a-f]{6}$/i.test(h) ? lum(h) : 0);
export const DEEP = [C.primary, C.secondary, C.dark].filter(Boolean).sort((a, b) => lum(a) - lum(b))[0];
export const INK = lum(C.secondary) < 0.35 ? C.secondary : lum(C.primary) < 0.35 ? C.primary : DEEP;

// Fonts: hf_build.mjs declares the brand's font files with @font-face in every scene (assets/fonts/).

// The brand theme. mg_init.mjs writes theme.json from the brand cache's brand.json; components read
// colours, fonts and the logo only from here, so one template serves every brand.
import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';
import theme from '../theme.json';

export type Theme = typeof theme;
export const T = theme;

export const C = theme.color;
export const FONT = `"${theme.font.heading}", "Poppins", sans-serif`;
export const BODY = `"${theme.font.body}", "Poppins", sans-serif`;

// Local font files copied into public/fonts by mg_init.mjs. loadFont delays the render until each is ready.
for (const f of theme.font.files) {
  loadFont({family: f.family, url: staticFile(`fonts/${f.file}`), weight: String(f.weight)});
}

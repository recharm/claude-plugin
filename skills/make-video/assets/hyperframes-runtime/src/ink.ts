// The foreground "ink" the animation library draws with. On the brand's dark colours that is white; on a light
// ground (cream, white) it is the brand's darkest colour, so any visual works on either. The scene runner sets it
// per scene from the background's real brightness (not its name).
import {createContext, useContext} from 'react';
import {C, INK, lumOf} from './theme';

export const InkCtx = createContext(false); // true = a light background
const hex2 = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0');

// the accent as a foreground: brand accents are often pale (mint, cream) and vanish on a light ground
const ACC_ON_LIGHT = lumOf(C.accent) > 0.55 ? (lumOf(C.primary) < 0.45 ? C.primary : INK) : C.accent;
/** White ink - for a visual that brings its own dark panel (a gauge card), whatever the scene's ground. */
export const DARK_INK = {light: false, fg: '#ffffff', acc: C.accent, a: (x: number) => `rgba(255,255,255,${x})`};
const LIGHT_INK = {light: true, fg: INK, acc: ACC_ON_LIGHT, a: (x: number) => `${INK}${hex2(x)}`};

export const useInk = () => (useContext(InkCtx) ? LIGHT_INK : DARK_INK);

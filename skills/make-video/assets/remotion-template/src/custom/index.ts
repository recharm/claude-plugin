// Bespoke scene components for one ad (a scene type "custom" with "component": "<Name>").
// Build them FROM visuals.tsx pieces (Pour, Chart, Shatter...) plus the brand's motifs - and each one must
// draw something besides text: the scene JSON has to say what in "draws", and mg_check.mjs refuses it otherwise.
// Register each component here, e.g.  import {SugarRain} from './SugarRain';  export const CUSTOM = {SugarRain};
import type React from 'react';

export const CUSTOM: Record<string, React.FC<{duration: number}>> = {};

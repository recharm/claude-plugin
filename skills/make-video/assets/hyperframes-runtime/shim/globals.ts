// theme.json / motifs.json come from the project: hf_build.mjs writes them as window.MV_THEME / window.MV_MOTIFS
// in index.html before this runtime loads, so one built runtime serves every brand.
const w = window as unknown as {MV_THEME?: unknown; MV_MOTIFS?: unknown};
export const theme = w.MV_THEME;
export const motifs = w.MV_MOTIFS ?? {props: [], problemObjects: [], productColors: [], packshots: [], icons: {}};

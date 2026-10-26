#!/usr/bin/env node
/**
 * export_premiere.mjs - kept so older instructions still work: the Premiere hand-off is now export_nle.mjs, which also
 * serves DaVinci Resolve and takes motion-graphics segments apart into plates, graphics and text layers.
 *
 *   node export_premiere.mjs edl.json [--out <folder>] [...]   ==   node export_nle.mjs edl.json [--out <folder>] [...]
 */
await import('./export_nle.mjs');

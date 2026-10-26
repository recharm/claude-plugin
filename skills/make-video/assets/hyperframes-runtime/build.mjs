#!/usr/bin/env node
/**
 * build.mjs - bundle the animation library (src/) into dist/mv-runtime.js, the one script every HyperFrames scene loads.
 *
 *   node build.mjs            (needs: npm install in this folder once - esbuild + preact, pinned in package.json)
 *
 * The library is written against Remotion's API; shim/ maps that API onto Preact, rendered frame by frame by
 * src/runner.tsx inside HyperFrames. Rebuild after editing anything in src/ (a custom component included) and
 * re-run hf_init.mjs so brand projects pick up the new runtime.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const shim = (f) => path.join(HERE, 'shim', f);
await build({
  entryPoints: [path.join(HERE, 'src', 'runner.tsx')],
  outfile: path.join(HERE, 'dist', 'mv-runtime.js'),
  bundle: true, format: 'iife', target: 'chrome110', minify: true, legalComments: 'inline',
  jsx: 'automatic', jsxImportSource: 'preact',
  alias: {
    react: 'preact/compat', 'react-dom': 'preact/compat', 'react/jsx-runtime': 'preact/jsx-runtime',
    remotion: shim('remotion.tsx'), '@remotion/transitions': shim('transitions.tsx'),
    '@remotion/transitions/fade': shim('transitions.tsx'), '@remotion/transitions/slide': shim('transitions.tsx'), '@remotion/transitions/wipe': shim('transitions.tsx'),
    '@remotion/media': shim('media.ts'), '@remotion/fonts': shim('fonts.ts'), '@remotion/motion-blur': shim('motion-blur.tsx'),
  },
  banner: {js: '/* make-video runtime for HyperFrames - the animation library on Preact (MIT). See CREDITS.md. */'},
  logLevel: 'warning',
});
console.log('  built', path.join(HERE, 'dist', 'mv-runtime.js'));

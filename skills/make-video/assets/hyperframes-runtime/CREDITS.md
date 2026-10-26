# Credits

This runtime and project are written for make-video (HyperFrames edition). Parts are adapted from MIT-licensed work:

- **MotionCraft** by Ahmad David (ahmdd4vd) - https://github.com/ahmdd4vd/MotionCraft (MIT).
  The animation helpers in `src/lib/anim.ts` (clamped ramps, bezier ease curves, springs sampled at 60fps
  so 30fps renders stay smooth) and the idea of driving every visual number from one style file.
- **remotion-motion-graphics-skill** by Fernando Karakanian Melo -
  https://github.com/fernandokaraka/remotion-motion-graphics-skill (MIT).
  The enter/exit and stagger patterns, lower-third structure, and transparent ProRes 4444 overlays.

- **motion-graphics** by Barty-Bart - https://github.com/Barty-Bart/motion-graphics (MIT).
  The ideas behind `src/carry.tsx` (a shape carries the eye across every transition) and `scripts/separate.mjs`
  (SAM 2.1 through transformers, frames in chunks of 60 seeded with the last mask). Both are rewritten for this template.
- **SAM 2.1** by Meta AI - https://github.com/facebookresearch/sam2 (Apache-2.0). Downloaded at run time from
  Hugging Face (`facebook/sam2.1-hiera-*`); not bundled.

MIT License text (applies to the adapted portions):

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
> associated documentation files (the "Software"), to deal in the Software without restriction, including
> without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
> following conditions: The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
> KIND, EXPRESS OR IMPLIED.

Copyright (c) 2026 Ahmad David (ahmdd4vd) · Copyright (c) 2026 Fernando Karakanian Melo · Copyright (c) Barty-Bart


- **HyperFrames registry** (heygen-com/hyperframes, Apache-2.0) - the transition and caption blocks. The ideas and
  techniques of light-leak, ink-bleed, torn-paper, halftone-dissolve, glitch, ripple, cross-warp, chromatic split,
  swirl, paper-collage, ridged-burn, flash-through-white and grid-pixelate transitions, and of the pill-karaoke,
  highlight, kinetic-slam, gradient-fill and neon caption styles, of the background shaders (mesh gradient, aurora,
  marble, liquid, god rays, blobs, Voronoi, smoke), the typography presets, the grain / vignette / light-sweep /
  halftone looks, the camera moves and the star-rating, donut and bar-race data blocks, are rewritten for this runtime
  in src/transitions-plus.tsx, src/captions.tsx, src/shaders.tsx, src/look.tsx, src/components.tsx and
  src/visuals.tsx. No registry files are included.

Engine and libraries (used, not modified; installed from npm at the pinned versions):
- **HyperFrames** 0.8.185 by HeyGen - https://github.com/heygen-com/hyperframes (Apache-2.0). Renders the scenes.
- **GSAP** 3.14.2 by GreenSock / Webflow - https://gsap.com (GSAP's standard no-charge licence). Drives each
  scene's timeline. Installed by hf_init.mjs, not bundled with the skill.
- **lottie-web** 5.12.2 by Airbnb - https://github.com/airbnb/lottie-web (MIT). Bundled into mv-runtime.js; plays
  Lottie brand props.
- **Preact** 10.27.2 - https://preactjs.com (MIT). Bundled into assets/vendor/mv-runtime.js; the library's
  components render on it through a small Remotion-compatible layer (assets/hyperframes-runtime/shim), written
  for this skill - no Remotion code is included.

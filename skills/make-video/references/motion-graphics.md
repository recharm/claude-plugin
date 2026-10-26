# Motion graphics with HyperFrames

For motion-graphics ads (any subject), animated scenes inside a footage ad, end cards, and graphics laid
over footage. Built at the chosen ratio: 1080x1920 (9:16) or 1920x1080 (16:9), 30fps.

**How it is built.** HyperFrames (HeyGen, Apache-2.0) renders HTML to video by seeking a paused timeline frame by
frame. This skill does not hand-write that HTML for every ad: the ad is a scene list (JSON), and `hf_build.mjs`
compiles it into a HyperFrames project - one sub-composition per scene - in which the skill's animation library
(`assets/hyperframes-runtime`, bundled as `mv-runtime.js`) draws every frame. So the planner, the checker, the brand
motifs and every visual in `animation-library.md` work exactly as specified there; you write JSON, not HTML.

**Two sources of truth, no overlap:**
- **What the ad should do** - this file, `animation-library.md`, and `captions-and-timing.md` for the four text presets.
- **How HyperFrames works** - only needed for a hand-written scene (`custom` with `html`, below): its own skill ships
  inside the pinned install, `<cache>/tools/hyperframes/node_modules/hyperframes/dist/skills/hyperframes/SKILL.md`,
  plus `npx hyperframes docs gsap` / `docs compositions`. Its advice to stop at a Studio preview doesn't apply: this
  skill renders after plan approval.

## 1. Set up the brand's project (once per brand, seconds after that)

```bash
node scripts/brand_motifs.mjs --brand <slug> --write       # what the animations are made of - confirm it (animation-library.md)
node scripts/hf_init.mjs --brand <slug> --aspect 9:16      # or 16:9
```

`brand_motifs` reads the website and the library and writes `motifs.json`: the brand's own particle object,
its problem object, product colours, packshot cut-outs, claim icons, a visual for every claim, and the library's
actions to match-cut into. `hf_init` copies it into the project at `<cache>/brands/<slug>/hyperframes/` and writes
`theme.json` from `brand.json`: palette (primary, secondary, accent, ground, text, and a readable colour on
primary), fonts (the brand's licensed files from the cache's `fonts/`, otherwise the bundled Poppins), the
**logo copied exactly as published**, product packshots into `assets/products/`, and the URL. It also refreshes the
runtime (`assets/vendor/mv-runtime.js`) and GSAP. The first run installs the pinned HyperFrames + GSAP once for every
brand (`<cache>/tools/hyperframes`); the first render downloads a headless Chrome. Never edit brand colours in
`theme.json` - fix `brand.json` and re-run.

Library clips a scene uses go in `assets/clips/` (`fetch_clips.mjs` downloads them; copy them there). `hf_build`
re-encodes the stretch each scene uses with a keyframe every second - HyperFrames freezes on sparse keyframes.

Brand guidelines from the user (interview question 6) go into `brand.json` and the cache's `fonts/` first,
then `hf_init`. Push for them on a strictly motion-graphics ad - the design *is* the ad.

## 2. Describe the ad as scenes, each with a visual (no new code for common beats)

**Default: generate it** with `mg_plan.mjs` from the beats (`animation-library.md` §2). It picks a different, fitting
animation per beat, remembers the brand's last ads, and writes the scene list. Then edit it as needed.
By hand, write `ads/<name>.json` in the project as a top-level `{"scenes": [...]}`. The template's own `ad.json` nests
its example under `"ad"`; yours doesn't. **Every scene draws something besides text.** The visuals, their
fields and how to pick them for this brand are in **`animation-library.md`**. Read it before writing the scene
list.

```json
{"scenes": [
  {"type": "scene", "duration": 3.2, "bg": "dark", "text": "<hook: the problem>", "preset": "fade",
   "visuals": [{"kind": "pour", "problem": true, "source": "box", "sourceLabel": "<the usual thing>"}]},
  {"type": "scene", "duration": 3.0, "bg": "dark", "transition": {"type": "whip", "direction": "from-bottom", "seconds": 0.27},
   "visuals": [{"kind": "chart", "title": "<WHAT DROPS>", "points": [0.45, 0.95, 0.1, 0.05], "times": [0, 0.5, 1.4, 2.4],
                "callouts": [{"i": 2, "text": "<CRASH>", "tone": "bad", "big": true}]}]},
  {"type": "footage", "duration": 3.0, "src": "<clip downloadUrl or clips/<file>>", "trimBefore": 0.8,
   "visuals": [{"kind": "gauge", "value": "<12-14g>", "label": "<from the site>", "at": 0.3}],
   "transition": {"type": "slide", "direction": "from-bottom", "seconds": 0.4, "timing": "spring"}},
  {"type": "scene", "duration": 3.0, "bg": "primary", "transition": {"type": "zoom", "seconds": 0.4},
   "visuals": [{"kind": "badges", "items": [{"text": "<claim>"}, {"text": "<claim>"}, {"text": "<claim>"}], "at": 0.3}]},
  {"type": "endcard", "duration": 2.6, "bg": "secondary", "url": "<brand.com>", "cta": "<Shop now>",
   "visuals": [{"kind": "particles", "mode": "fall"}], "transition": {"type": "iris", "seconds": 0.45}}
]}
```

| Scene `type` | Draws | Counts as a visual by itself? |
|---|---|---|
| `scene` | Animated brand background, plus `visuals` and optional `text` / `sub` | Only with a real visual |
| `footage` | A library clip, muted, eased push-in; `fit: "blurfill"` for an opposite-orientation clip; `visuals` over it | Yes |
| `product` | A website packshot floating up (`src`: `products/<file>`) | Yes |
| `endcard` | Logo (as published), URL, CTA pill, a ring drawing on | Yes |
| `compare` | Bars growing, highlighted winner, `note` for the source | Yes |
| `list` | `marker: "icon"` draws icon steps (icons from motifs); other markers are text | Only with `marker: "icon"` or a visual |
| `title`, `stat` | Text (a rule line; a counting number) | **No** - attach a visual |
| `custom` | A hand-written HyperFrames composition (`html`, `draws`) - see section 3 | Yes, if `draws` says what |

Every scene also takes:
- `bg`: `ground`, `primary`, `secondary` or `dark`.
- `ring: {x, y, r}`.
- `glitch: true`.
- `shake: [seconds]`.

The scene list can set a top-level `"look"` (`film`, `paper`, `print`, `sweep`, `clean`) - one finish over the whole ad. Footage
scenes take `"camera"` (`pushin`, `pullback`, `drift`, `rack`, `handheld`, `punch`, `static`); headings take kinetic `"preset"`s
(`captions-and-timing.md`), with `"strike"` for the strike preset.

Every scene also takes `bgStyle` (`glow`, `gradient`, `spotlight`, `grid`, `paper`, `pattern`, `blur-footage` + `bgClip`, `split`, and the
shader styles `mesh`, `aurora`, `marble`, `liquid`, `godrays`, `blobs`, `voronoi`, `smoke`) - vary it so
the ad is not one slab of colour; a light `bg` switches the graphics to dark ink (`animation-library.md`).

Text on `primary`, `secondary`, `dark` and footage is automatically the readable colour. **Transitions** go on
the scene they lead into:

- **Types:** `fade`, `slide`, `wipe`, `whip`, `zoom`, `iris`, `carry` (a shape carries the eye), and `lightleak`, `ink`, `torn`,
  `halftone`, `glitch`, `ripple`, `warp`, `chromatic`, `vortex`, `collage`, `burn`, `flash`, `pixel` (`animation-library.md`).
- **Options:** `direction`, `seconds`, and `timing` (`linear` or `spring`); `carry` takes `variant` (`dot`, `ring`, `flood`,
  `bar`, `object`), `at` `{x, y}` and `color`.

A footage scene can put its graphics **behind the subject**: cut the person / product out of the clip with
`node scripts/separate.mjs <project>/assets/clips/<CLIP>.mp4 --from <trimBefore> --dur <duration + 0.3> --points "x,y;x,y" --out <project>/assets/cutouts/<name>`
(points as fractions of the first frame, read off the sprite) and set `"cutout": "cutouts/<name>"` on the scene. It
writes `cutout.webm` (the subject on transparency), which plays frame-locked to the footage under it. Give `mg_plan`
the same as `footage.cutout` in beats.json and it favours the shot.

Runtime = sum of durations - sum of transitions; `hf_build` computes it (each scene's host starts where the previous
scene's transition begins, so the two overlap like a cross-dissolve of any shape).

## 3. Check, then render

```bash
node scripts/mg_check.mjs <cache>/brands/<slug>/hyperframes/ads/<name>.json                 # must PASS
node scripts/hf_build.mjs <cache>/brands/<slug>/hyperframes/ads/<name>.json --draft          # review: out/<name>.mp4, full size, fast
node scripts/hf_build.mjs <cache>/brands/<slug>/hyperframes/ads/<name>.json --blur           # final: high quality + light motion blur
# add --incremental to either: one cached window per scene, so after an edit only the changed scenes render again
# (the review page, review.md, always renders this way)
```

Drafts are full 1080x1920 and render in about 1.5x real time, so there is no half-scale preview step. `--blur`
renders at 60fps and blends each pair of frames down to 30 (about 2.5x the render time): pops, stamps and whips lose
their strobe. It is lighter than a multi-sample camera blur - fast whips still show two images, briefly. `--lint`
prints HyperFrames' own checks of the generated project; the project stays in `<project>/build/<name>/`, where
`npx hyperframes preview` opens it in HyperFrames' Studio for a look (edit the ad JSON, not the generated HTML -
the next build overwrites it).

`mg_check` blocks text-only scenes, unknown kinds, shapes and icons, missing files, and numbers that aren't on
the site. It warns when motifs aren't confirmed, when scenes ignore the brand's own material, and when a device
repeats. The runtime refuses a text-only scene too.

Render **silent** and pass it to `build_ad.mjs` as a `file` segment (add `"motion": "<project>/ads/<name>.json"` to that
segment, so `export_ae.mjs` can rebuild it as layers - `handoff.md`), so the VO, music, SFX, captions and the
gate run over the whole ad in one place.

**Graphics over footage** (a stat callout or lower third on a testimonial) - render an overlay with alpha (ProRes
4444) and lay it on in the EDL:

```bash
node scripts/hf_build.mjs <cache>/brands/<slug>/hyperframes/ads/<name>-overlay.json --overlay      # -> out/<name>-overlay.mov
```

```json
{"duration": 3.3, "items": [
  {"type": "lowerThird", "start": 0, "duration": 3.3, "y": 0.15, "text": "<claim from the site>", "sub": "<context>", "icon": "dumbbell"},
  {"type": "visual", "start": 1.0, "duration": 2.3, "y": 0.7, "visual": {"kind": "gauge", "value": "<12-14g>", "label": "<from the site>"}}
]}
```

Every overlay item needs an `icon` (drawn on above it) or a `visual`. A text-only overlay refuses to render.
Overlay item types are `lowerThird`, `title`, `stat`, `list` and `visual`. `y` (0 = top, 1 = bottom) places it - read the face
and product positions off the sprite and use the gap. In the EDL: `"overlays": [{"file": "<path>.mov", "at": 12.86}]`
(`at` is output seconds). Overlays sit under the captions. In a testimonial, an overlay is a supporting graphic -
use one only to reinforce a spoken claim.

**A hand-written scene** - when no visual in the library fits: write a HyperFrames composition (HTML + GSAP, its
skill's rules: a `<template>`, `#root` sized with `inset: 0`, one paused timeline registered as
`window.__timelines["<id>"]`, no `Date.now()` or unseeded randomness) in `assets/custom/<file>.html`, give its root
`data-composition-id` a unique id, and add the scene as `{"type": "custom", "html": "<file>.html", "draws": "<what it
draws>", "duration": ...}`. It plays as written (brand colours: read `window.MV_THEME.color`); transitions into and
out of it are hard cuts, and the After Effects export carries it as one layer.

## Rules for motion-graphics ads

### Transitions follow the story beat

**The same effect repeated between every scene is the tell that a template built the ad.**

| What is happening | Join |
|---|---|
| A shape or motion in scene A continues into scene B | **Match cut** - end A on a shape, open B from the same shape (e.g. the ring) |
| A fast beat change - new idea, new energy | **Slide / wipe**, quick (`linear`, 0.25-0.35s) |
| Moving on calmly, or into the solution | **Slide** with `spring`, 0.45-0.55s |
| Staying inside one idea | No cut - a push-in or the scene's own motion |
| Landing on a beat or a sound hit, deliberately | **A hard cut** (no `transition`), timed to the hit |

Never a bare hard cut between motion scenes unless it lands on a beat - it reads as a slide advancing.

### Easing on every animated property

The template eases everything: ease-out entering, ease-in leaving, ease-in-out for camera moves, springs for
tactile elements (badges, pills, product reveals). Linear motion only for ambient loops (particles, idle drift).
A hand-written scene follows the same rule in GSAP (`power2.out` in, `power2.in` out, `back.out` for pops).

### Text with intent

The presets (`captions-and-timing.md`): `fade` for the hook's snap-in (the default on scene 1), `fadeRise` standard, `fadeDrop` only for dismissal, `scalePop` for
one keyword, `slideInSequence` (the `list` scene) for ordered items. Hook text snaps in under 300ms; supporting
text eases slightly slower. No text before the beat it describes.

### No animated segment is just text

Every scene and every overlay item draws something that explains the beat: the brand's object pouring or
shattering, a chart, a gauge, a card, badges, icon steps, an orbit, a packshot, a split, or footage. Some things
don't count on their own:
- A rule line, the animated background, a counter (rolling digits are still type) and scribbles, sparkles or
  rays (decoration).

The runtime and `mg_check` both refuse a text-only scene. Keep it to one main visual plus at most one or two
supporting marks per scene. Build visuals from the brand's motifs, not generic shapes. `animation-library.md` §3
covers how.

| Scene idea | Build it with |
|---|---|
| Hook | The problem made visible: `pour` of the problem object, or a `chart` crashing; heading snaps in under 300ms |
| How it works | `steps` (or `list` with `marker: "icon"`), one line per step in the site's wording |
| Proof | The claim's `claimVisuals` entry: `gauge`, `shatter` + `counter`, `card`, `badges`; `compare` for the site's own figures |
| Product reveal | `packshot` (3D swing, rays) or `orbit` with benefit icons, or `footage` with a visual over it |
| Social proof | `counter` of the review count + `particles` of stars, or `badges` with the rating exactly as the site shows it |
| CTA | `endcard` with the confirmed URL and offer, with brand-object `particles` falling |

### Brand

Colours, fonts and the logo come only from `theme.json` (from `brand.json`). One accent per ad. The logo is never
retyped, recoloured or redrawn - if the published colour doesn't read, change the background (`bg: "primary"` for
a white logo). Assets follow `brand-assets.md`; claims and numbers only from the site or the user - `gate.mjs`
checks every number in the captions, and `mg_check.mjs` every number inside the graphics.

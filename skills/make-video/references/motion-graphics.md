# Motion graphics with Remotion

For motion-graphics ads (any subject), animated scenes inside a footage ad, end cards, and graphics laid
over footage. Built at the chosen ratio: 1080x1920 (9:16) or 1920x1080 (16:9), 30fps.

**Two sources of truth, no overlap:**
- **How to write Remotion code** - Remotion's official skills. **Load `remotion-best-practices` before
  writing any Remotion code** (timing, springs, sequencing, `TransitionSeries`, fonts, video, rendering).
  Its advice to open a preview instead of rendering doesn't apply: this skill renders after plan approval.
- **What the ad should do** - this file, plus `captions-and-timing.md` for the four text presets.

## 1. Set up the brand's project (once per brand, seconds after that)

```bash
node scripts/brand_motifs.mjs --brand <slug> --write       # what the animations are made of - confirm it (animation-library.md)
node scripts/mg_init.mjs --brand <slug> --aspect 9:16      # or 16:9
```

`brand_motifs` reads the website and the library and writes `motifs.json`: the brand's own particle object,
its problem object, product colours, packshot cut-outs, claim icons, a visual for every claim, and the library's
actions to match-cut into. `mg_init` copies it into the project. It also refreshes the template from `assets/remotion-template/` into `<cache>/brands/<slug>/remotion/` and writes
`theme.json` from `brand.json`: palette (primary, secondary, accent, ground, text, and a readable colour on
primary), fonts (the brand's licensed files from the cache's `fonts/`, otherwise the bundled Poppins), the
**logo copied exactly as published**, product packshots into `public/products/`, and the URL. It runs
`npm install` only the first time. Never edit brand colours in `theme.json` - fix `brand.json` and re-run.

Brand guidelines from the user (interview question 6) go into `brand.json` and the cache's `fonts/` first,
then `mg_init`. Push for them on a strictly motion-graphics ad - the design *is* the ad.

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
| `custom` | A bespoke component from `src/custom/` (`component`, `draws`) | Yes, if `draws` says what |

Every scene also takes:
- `bg`: `ground`, `primary`, `secondary` or `dark`.
- `ring: {x, y, r}`.
- `glitch: true`.
- `shake: [seconds]`.

Text on `primary`, `secondary`, `dark` and footage is automatically the readable colour. **Transitions** go on
the scene they lead into:
- **Types:** `fade`, `slide`, `wipe`, `whip`, `zoom` or `iris`.
- **Options:** `direction`, `seconds`, and `timing` (`linear` or `spring`).

Runtime = sum of durations - sum of transitions; the composition computes it.

## 3. Check, then render

```bash
node scripts/mg_check.mjs <cache>/brands/<slug>/remotion/ads/<name>.json     # must PASS
cd <cache>/brands/<slug>/remotion
npx remotion render src/index.ts Ad out/<name>.mp4 --props=ads/<name>.json --scale=0.5 --crf=24   # preview: one frame per scene
npx remotion render src/index.ts Ad out/<name>.mp4 --props=ads/<name>.json --crf=16
```

`mg_check` blocks text-only scenes, unknown kinds, shapes and icons, missing files, and numbers that aren't on
the site. It warns when motifs aren't confirmed, when scenes ignore the brand's own material, and when a device
repeats. The renderer refuses a text-only scene too.

Render **silent** and pass it to `build_ad.mjs` as a `file` segment, so the VO, music, SFX, captions and the
gate run over the whole ad in one place.

**Graphics over footage** (a stat callout or lower third on a testimonial) - render the `Overlay` composition
with alpha and lay it on in the EDL:

```bash
npx remotion render src/index.ts Overlay out/<name>-overlay.mov --props=ads/<name>-overlay.json \
  --image-format=png --pixel-format=yuva444p10le --codec=prores --prores-profile=4444
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
New components follow the same rule - use `src/lib/anim.ts` (`ramp`, `out`, `spr`, `SPRING`).

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

The renderer and `mg_check` both refuse a text-only scene. Keep it to one main visual plus at most one or two
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

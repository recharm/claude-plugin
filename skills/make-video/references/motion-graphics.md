# Motion graphics with Remotion

For motion-graphics ads (any subject), custom ads that call for animation, and animated segments or end cards inside a footage ad. Build natively at the chosen ratio: 1080x1920 (9:16) or 1920x1080 (16:9).

Remotion renders React to video. You write components, it gives you an MP4 at the exact
dimensions and frame rate you ask for - which is why it beats hand-built ffmpeg filter chains
for anything with type, timing, or layout.

## Before you start: get the brand assets

Interview question 6 exists for this. Ask for guidelines first - the design *is* the ad. If they
give none, **source from the brand's website**, harvested into the per-brand cache
(`brand.json` + `images/website/`, see `references/brand-assets.md`). Say in the plan that branding
came from the site.

Read `brand.json` and make the graphics read as *this* brand, not a template:

- **Colour**: the primary brand colour carries headings, buttons and key shapes; the secondary or
  neutral is the ground; allow one accent per ad for a keyword, star row or highlight circle. Sample
  exact hex values from the site CSS or logo - never eyeball.
- **Motif**: lift one repeating shape from the logo or packaging (a ring, a leaf, a stripe, a corner
  radius) and use it as the animation motif - drawing on, filling, orbiting.
- **Type**: the site's heading and body faces from `brand.json -> fonts`. Load them from
  `staticFile()` (copy the cache's `fonts/` into `public/`). If a face is not licensable for embedding,
  fall back to the bundled Poppins and say so. The wordmark is an image: use the logo file, never retype it.
- **Mood**: match the site's energy (calm and airy vs loud and kinetic). Match motion speed to it.
- **Claims**: only numbers and claims that appear in `website-brand.json` or came from the user.

**Library clips composite well under type** (`<OffthreadVideo>`) *when they are clean footage*:
product-in-use close-ups, pours, demos, lifestyle b-roll. If the library is mostly finished ads (burned-in
captions, offers) or has no usable clips, build the whole ad from website assets and native graphics -
packshots, logo, palette, icons, type - and say so in the plan. Check orientation in the clip probe - native in the matching ratio; otherwise
tile two or float one over a blurred copy. Website packshots are the cleanest product layer for cards.

## Setup

```bash
npx create-video@latest --blank <brand>-mg
cd <brand>-mg
npm install
```

Set the composition to the aspect ratio the user chose in interview question A, in `src/Root.tsx`:

```tsx
// 9:16 - TikTok, Reels, Shorts
<Composition id="Ad" component={Ad} durationInFrames={17 * 30} fps={30}
  width={1080} height={1920} />

// 16:9 - YouTube, CTV, pre-roll, display
<Composition id="Ad" component={Ad} durationInFrames={17 * 30} fps={30}
  width={1920} height={1080} />
```

Either at 30fps matches the builder's output frame exactly, so a Remotion segment drops into an
ffmpeg cut with no rescaling or frame-rate conversion.

**Read the frame from Remotion rather than hardcoding it**, so one composition can serve both and a
layout can never be silently authored for the wrong shape:

```tsx
const { width, height } = useVideoConfig();
const landscape = width > height;
```

**A 16:9 composition is a re-layout, not a re-export.** The vertical instinct is to stack — headline
over product over stat — and stacked content in a landscape frame leaves two empty thirds and type
that has shrunk to fit the height. Put the same beats side by side instead: product on one side, the
text block on the other, stat callouts in a row rather than a column. The beats and their timing
carry over unchanged; only the arrangement moves.

Render:

```bash
npx remotion render Ad out/mg.mp4 --codec=h264
```

Preview while iterating:

```bash
npx remotion studio
```

## Composition patterns

### Timing

Drive everything from `useCurrentFrame()`. At 30fps, one second is 30 frames - write timings
in seconds and multiply, so they stay readable against the beat tables in `ad-formats.md`.

```tsx
const frame = useCurrentFrame();
const { fps } = useVideoConfig();
const s = (sec: number) => sec * fps;
```

### Entrances

`spring()` for anything that should feel physical - a product sliding in, a card settling.
`interpolate()` for fades and linear moves.

```tsx
const entry = spring({ frame: frame - s(2), fps, config: { damping: 200 } });
const opacity = interpolate(frame, [s(2), s(2.4)], [0, 1], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});
```

Always clamp. Without `extrapolateLeft`/`extrapolateRight`, values run past their range and
elements drift off-screen or invert.

### Sequences

Use `<Sequence>` for beats rather than conditionals on frame number. It keeps each beat's
timing local to the component that owns it, so changing one beat's length does not require
recalculating every later beat by hand.

```tsx
<Sequence from={s(0)} durationInFrames={s(2)}><Hook /></Sequence>
<Sequence from={s(2)} durationInFrames={s(4)}><Benefit n={1} /></Sequence>
```

### Type

Load brand fonts with `@remotion/google-fonts` or `staticFile()` for licensed files. Falling
back to a system stack is a visible downgrade on a brand piece.

Video type is bigger than feels natural on a desktop preview. Both frames share a 1080px short edge,
so the same sizes hold in either: minimum ~60px, headlines 96-144px. Check at the real playback size
before rendering - a phone-sized preview for 9:16, and from across the room for 16:9, which is often
watched on a TV.

### Safe areas

These differ by frame, because what intrudes differs:

- **9:16** - platform UI (captions, handles, buttons) covers the top ~14% and bottom ~20%. Keep
  everything meaningful between roughly **y=270 and y=1545**.
- **16:9** - no platform chrome to dodge, but overscan and player controls are real. Keep type
  inside a **5% margin on all sides** (x=96 to x=1824, y=54 to y=1026), and keep the bottom ~12%
  clear of anything critical, since that is where a YouTube control bar and progress scrubber sit.

### Live footage inside a composition

`<OffthreadVideo>` plays a library clip inside a Remotion scene - useful for animating over a
`Product Shot` rather than cutting to it.

```tsx
<OffthreadVideo src={clipDownloadUrl} startFrom={s(1.5)} muted />
```

Use `muted` - clip audio is wrong here for the same reasons it is wrong in the ffmpeg path.

## Moving between scenes: one continuous space

The most common motion-graphics mistake is building slides. Five cards that cut to each other is
a deck, not an ad. Build one space and move a camera through it.

**The pattern:** lay scenes out on an axis, then translate the whole world rather than swapping
children. The viewer reads it as a camera move, which is why it feels like film rather than
PowerPoint.

```tsx
const SCENES = 4;
const SCENE = 1080;               // one screen width
const HOLD = 3.2;                 // seconds parked on each scene
const MOVE = 0.8;                 // seconds travelling

// Which scene are we on, and how far through the move?
const t = frame / fps;
const idx = Math.min(SCENES - 1, Math.floor(t / HOLD));
const local = t - idx * HOLD;

const travel = interpolate(local, [HOLD - MOVE, HOLD], [0, SCENE], {
  easing: Easing.inOut(Easing.cubic),   // camera moves ease BOTH ends
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});

const x = -(idx * SCENE) - travel;

return (
  <AbsoluteFill style={{ background: BRAND.white }}>
    <div style={{ display: 'flex', width: SCENE * SCENES, transform: `translateX(${x}px)` }}>
      {scenes.map((s, i) => <Scene key={i} {...s} />)}
    </div>
  </AbsoluteFill>
);
```

### Pick the transition from the story beat, not from habit

**The same effect repeated between every scene is the tell that a template built the ad.** Choose
each join from what the two scenes are doing:

| What is happening | Join |
|---|---|
| A shape or motion in scene A continues into scene B | **Match cut** - end A with a circle at frame centre, open B from the same circle. The eye carries across and the join disappears. |
| A fast beat change - new idea, new energy | **Whip pan or swipe wipe.** A whip pan is a fast translate plus directional blur; Remotion can do this, the ffmpeg path cannot. |
| Staying inside one scene, but it must not sit still | **Simulated camera move** - push in, pull back, or parallax drift. No cut at all. |
| Landing on a beat or a sound hit, deliberately | **A hard cut**, timed to the hit. |

**Never use a hard cut with no transition unless it is landing on a beat or sound hit
intentionally.** An untimed hard cut between motion-graphics scenes is the "five cards in a deck"
failure - it reads as a slide advancing, because nothing carried across.

Variations worth using:

- **Sweep vertically** instead of horizontally for a "layers of the formula" idea.
- **Parallax** - move a background layer at 0.3x the foreground speed. One line, and it does more
  for depth than any other single trick.
- **Push in, not cut** - scale the world 1.0 to 1.08 across a scene with `Easing.inOut`. Static
  framing for three seconds is dead air in vertical video.

## Easing: every animated property, no exceptions

Linear motion is the single clearest signal that something was generated rather than designed, and
it is the difference between motion graphics and a PowerPoint transition. So:

**Apply easing to every animated property.** The only exception is a continuous ambient loop -
background particles, an idle drift, a slow gradient rotation - where constant velocity is the
point and easing would make it pulse.

| What the property is doing | Easing |
|---|---|
| Entering the frame | `Easing.out(Easing.cubic)` - fast then settling |
| Leaving the frame | `Easing.in(Easing.quad)` - slow then away |
| A camera-style move across a scene | `Easing.inOut(Easing.cubic)` - eased both ends |
| Anything meant to feel tactile or bouncy - buttons, callouts, product reveals | `spring()` |
| A continuous ambient loop | Linear is correct here |

```tsx
import { interpolate, Easing, spring } from 'remotion';

// Arriving - ease out
const y = interpolate(frame, [s(2), s(2.5)], [60, 0], {
  easing: Easing.out(Easing.cubic),
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});

// Tactile settle - product reveals, cards landing
const entry = spring({ frame: frame - s(2), fps, config: { damping: 14, mass: 0.7 } });
```

**Always clamp both ends.** Without `extrapolateLeft` and `extrapolateRight`, values run past
their range and elements drift off-screen or invert.

## Text animation: intent, and speed matched to importance

Animate text to do a job, not to be animated:

| Job | Animation |
|---|---|
| Standard entrance | **Fade and rise** |
| Something being dismissed or de-emphasised | **Fade and drop** - only for this; it reads as retreat |
| Emphasis on a single keyword | **Scale-pop** |
| Items to be read as an ordered list | **Slide in sequence**, staggered 0.15-0.20s apart |

**Match each animation's speed to its importance.** Hook text snaps in - **under 300ms** - because
it is competing with a thumb already moving. Supporting text can ease in slightly slower, 350-500ms,
because by then you have the viewer. Uniform timing across a piece flattens the hierarchy you are
trying to build.

## Graphic elements, not just the packshot

**Every scene needs at least one non-product graphic element supporting the beat** - an icon, a
stat callout, a comparison bar, a background or texture, a lighting element, or a motion accent
like particles, a light leak or a gradient sweep.

**A scene with only a static image and text is incomplete.** A photo on a flat ground, four
times over, is not motion graphics - it is a slideshow with a pan move on it. Each scene needs
something of its own that carries the idea.

What tends to work, mapped to the brand's own material (swap in real labels, claims and assets):

| Scene idea | Elements |
|---|---|
| Hook | Oversized pain-point or result line snapping in (<300ms) over the most relevant clip, an accent strike-through or underline drawing across it |
| How it works | A diagram of the mechanism (bar, dial, steps) with an indicator gliding on a spring; one-line label per step from the site's wording; any required disclaimer in small type |
| Proof | Comparison bars growing (ease-out) using only the site's figures and their source note |
| Feature / benefit | The product floating up on a spring while the thing it replaces drops with ease-in; a line icon in a soft circle |
| Variants | Colour or flavour swatches sliding in sequence, each dropping onto the product clip |
| Social proof | Star row popping in one at a time, the rating exactly as the site shows it, a creator still in a rounded card |
| CTA end card | Brand ground colour, logo fade+rise, URL in the heading face, a pill with the confirmed offer, the logo motif drawing on around the mark |

Cheap and effective without any asset at all: **oversized type as the graphic**, **gradient sweeps**
between scenes, **line icons in soft pastel circles** (echoing the logo ring), stars and sparkles as
particle accents, and **rule lines** drawing on with `Easing.out`.

Keep the element count per scene to one product plus one or two supporting marks. Three ideas in
one scene held for three seconds is unreadable.

## Sourcing the assets you need

**Work down this ladder in order and stop at the first hit.** Assets the brand already owns are
always on-brand and cleared; everything below trades away one of those.

**1. Assets the user provided, or that already exist on the product/brand website.** The user's
uploads; the harvested site assets in the brand cache (`images/website/`, `images/products/`: logos,
packshots, lifestyle); and the Recharm library footage. See
`references/brand-assets.md`.

**2. Assets generated natively in the composition.** Icons, shapes, backgrounds, rule lines,
gradients, particles, simple illustrations — build them directly as CSS/SVG in Remotion. Sharper,
animatable, recolourable, no licensing question. For an abstract raster element (a texture, a
stylised ingredient) the ElevenLabs creative connector's `creative_generate_image` belongs here
too — name the palette and ask for a transparent background.

**3. Web-sourced stock — only when 1 and 2 cannot cover the need.** Only from sources actually
licensable for commercial ad use, and **flag every such asset in your final summary** (what, where
from, what the licence permits) so it can be swapped before final render.

**Never fabricate a source, and never use an asset without confirming it is clear for commercial
use.** If you can't establish the licence, you don't have the asset — drop the element.

Further cautions:

- **Never generate "their" product, packaging, customers or pets.** A generated product or person passes
  itself off as the real thing in use. Real product and people come from the library, the site images or
  the user's uploads; generated imagery is for abstract texture only.
- **Never generate or redraw the logo**, and never use third-party marks (competitor brands
  visible in footage) as graphics.
- **Never put a number or claim on screen that isn't on the site or from the user** — review counts,
  ratings, "x times" figures, prices, offers. Health-monitoring graphics carry the site's disclaimer.

## Reusing one system across benefit cards

For a benefits explainer, build one card component and feed it three sets of content. Same entry, same
layout, same timing. Repetition reads as design; three differently-animated cards read as
three unrelated slides.

```tsx
const BENEFITS = [
  { icon: 'protein', label: '13g complete protein' },
  { icon: 'sugar',   label: '0g sugar' },
  { icon: 'star',    label: 'Tastes like childhood' },
];
```

## Handing off to the ffmpeg cut

For a mixed ad, render the graphics to `.mp4` and reference the file as a segment:

```json
{ "url": "out/mg-open.mp4", "in": 0, "out": 3.0 }
```

`build_ad.mjs` treats local paths and remote URLs the same. Because Remotion already rendered
at the ad's own frame and 30fps, normalization is a no-op and the segment passes through cleanly.

Render Remotion segments **silent** and let `build_ad.mjs` lay the VO and music across the
whole ad - otherwise you get two independent beds fighting at the join.

## Common problems

- **Element flies off screen.** Missing `extrapolate` clamp on an `interpolate`.
- **Animation stutters at a `Sequence` boundary.** `useCurrentFrame()` inside a `Sequence` is
  relative to that sequence's start, not the composition's. Subtracting `from` again
  double-counts.
- **Fonts render as fallback in the output but look right in studio.** The font did not load
  before the render frame was captured - use `delayRender()` / `continueRender()` around font
  loading.
- **Render is very slow.** Drop `--concurrency`, or check for a full-frame CSS filter or
  backdrop blur, which are disproportionately expensive per frame.

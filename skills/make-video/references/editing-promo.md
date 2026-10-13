# Editing a promotional, Problem/Solution or custom footage ad

Read this for Product Promotional, Problem/Solution, Comparison, Before/After, Tutorial, Urgent CTA,
VO/VSL cuts and custom footage ads. Captions, text animation, split edits and timing are in
`captions-and-timing.md`; motion-graphics ads are in `motion-graphics.md`.

The rule under all of it: **a transition should serve the beat, never announce itself.**

## Swipes are the connective tissue

Use **swipe transitions - directional wipes and pushes - as the default join**. They read as
intentional and polished without drawing attention to themselves.

```json
{ "transition": { "type": "smoothleft", "duration": 0.45 } }
{ "transition": { "type": "swipeleft",  "duration": 0.30 } }
```

`smoothleft`/`smoothright` are the best default: directional with a soft, eased edge. `swipeleft` gives
a harder, more graphic edge.

## Direction should mean something

| Content relationship | Direction |
|---|---|
| Before to after, step 1 to step 2, problem to solution | Left to right (`smoothright` / `swiperight`) |
| Back to the problem, a contradiction, "but here's the catch" | Right to left |
| Stacking benefits as a list | Up (`smoothup`), consistently within the stack |
| Dropping to a CTA or a price | Down |

Avoid **the same direction every time regardless of meaning** - that is what makes a cut feel like a
slideshow template.

## Match the transition style to the half of the ad

- **Problem section - harder, quicker cuts and swipes.** `swipeleft`/`swiperight` at **0.2-0.3s**, or a
  hard cut where the beat wants a jolt. Friction should feel slightly uncomfortable; this is where
  tension builds.
- **Solution section - slower, smoother swipes or simulated camera moves.** `smoothleft`/`smoothright`
  at **0.45-0.55s**, or hold a shot and add a `move` (`pushin`, `glideright`) so the frame breathes. The
  visual language relaxes once the product resolves the problem.

**A Problem/Solution ad that moves identically through both halves loses the contrast that makes the
format work.**

## Spend the match cut on the pivot

**Reserve match cuts for the problem -> solution pivot** - same framing or action continuing across the
cut - because it visually reinforces the transformation. Don't spend the technique elsewhere.

If no genuine match exists at the pivot (or the pivot is graphic -> footage), use a soft opening move
that reads as relief - `circleopen` or `radial` at 0.55-0.65s, or a clean hard cut - with every other
join kept quieter than it.

## Text and supporting graphics

Text animation only to **name the problem in the viewer's words** as it is shown, **label the solution**
the instant it appears, or **reinforce a stat, price or claim**. Small graphics (icons, arrows,
comparison bars, highlight circles) only where they clarify something the footage can't show -
pointing at a feature, quantifying a benefit, contrasting before and after. If the footage already
communicates the beat, leave it graphic-free. Presets and timing: `captions-and-timing.md`.

When a beat does get an animated insert or overlay, it **draws something, not just words**: a `gauge` over the
spoon shot, a `card` over the pour, `badges` stamping on the claims, the brand's object bursting on the bite -
from the animation library, made of the brand's motifs (`animation-library.md`). An animated title on its own is
a caption, not a graphic.

In a left-swiping section, `slideleft` captions travel with the picture.

## Transitions available in `build_ad.mjs`

All are ffmpeg `xfade` transitions.

| Group | Types | Use |
|---|---|---|
| **Cut** | `cut` | Default when `transition` is omitted |
| **Swipe** | `swipeleft`, `swiperight`, `swipeup`, `swipedown` | Hard-edged. The problem half |
| **Smooth** | `smoothleft`, `smoothright`, `smoothup`, `smoothdown` | Soft edge. **Best default.** The solution half |
| **Soft** | `fade`, `dissolve`, `fadeblack`, `fadewhite` | Time passing or a section break. `fadeblack` at most once |
| **Wipe / reveal** | `wipeleft/right/up/down`, `revealleft/right`, `coverleft/right/up/down` | `cover*` slides the new clip over the old; `reveal*` slides the old away |
| **Shape** | `circleopen`, `circleclose`, `radial`, `zoomin`, `squeezeh`, `squeezev` | Draws attention. The pivot or a product reveal only |
| **Texture** | `pixelize`, `hblur` | Rarely right; `hblur` can work into a product hero |

There is **no whip pan in the ffmpeg path** (it needs motion blur `xfade` can't produce). Build whip
pans in Remotion, or use a fast `swipeleft` at 0.2s.

## Simulated camera moves within one clip

| `move` | Motion | Use |
|---|---|---|
| `pushin` | Scales up across the clip | The solution beat; settling onto the product |
| `pullback` | Scales down, revealing context | An end card, or opening out from a detail |
| `glideleft`, `glideright` | Sideways drift | A held product shot that would otherwise be static |
| `glideup`, `glidedown` | Vertical drift | Travelling up a stack, or down into a pan |

`moveAmount` defaults to `0.10`; **keep it under ~0.15** or it reads as a zoom effect. The builder
oversamples before zooming, so a push-in stays sharp.

## Easing in the ffmpeg path

Easing is mostly a choice of transition: `smooth*` is perceptually eased; `swipe*` and `wipe*` are
linear. If a swipe feels mechanical, switch to `smooth*` at the same duration rather than lengthening it.

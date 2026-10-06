# Motion: how clips join, how text arrives, how things move

How clips join is part of the format, not decoration applied afterwards. The right join for a
testimonial is the wrong one for a promo, and getting this backwards is the most recognisable way
an ad looks assembled rather than edited.

The rule under all of it: **a transition should serve the beat, never announce itself.** Every
choice below follows from asking what this particular cut is doing.

## Contents

- [Testimonial: jump cuts are the grammar](#testimonial-jump-cuts-are-the-grammar)
- [Promotional, Problem/Solution and custom: swipes as connective tissue](#promotional-problemsolution-and-custom-swipes-as-connective-tissue)
- [Motion graphics](#motion-graphics)
- [Split edits: letting sound and picture cross over](#split-edits-letting-sound-and-picture-cross-over)
- [Captions: the burned-in text question comes first](#captions-the-burned-in-text-question-comes-first)
- [Supporting graphics: three jobs, no decoration](#supporting-graphics-three-jobs-no-decoration)
- [The vocabulary](#the-vocabulary)
- [Timing](#timing)

---

## Testimonial: jump cuts are the grammar

Cut testimonial and UGC footage **primarily with jump cuts.** They are the expected grammar of the
format and they reinforce authenticity: a testimonial that is transition-heavy reads as scripted
and corporate, which undercuts exactly the trust the format exists to build. Polish is not a
neutral addition here - it is a cost.

**Use a jump cut whenever you are trimming** a pause, a filler word, or a restart within a single
take. That is most of the work in a testimonial edit. In this library it means either trimming
inside one clip, or cutting between two clips sharing a `rawVideoPublicId` - same creator, same
framing, a different moment (check the brand cache's `raw-videos.json`):

```json
{ "clipSymbol": "<clip A>", "in": 2.0, "out": 5.0 },
{ "clipSymbol": "<clip B, same rawVideoPublicId>", "in": 1.5, "out": 4.5 }
```

Leave `transition` off entirely, or set `"cut"`.

**Use a match cut only when moving between two different takes or setups where an action, gesture,
or gaze direction genuinely lines up.** A hand lifting a lid cutting to a hand setting down a plate;
a look off-frame left cutting to a look arriving from frame right. Find these by inspecting
posters, not by hoping.

**Do not force a match cut just to add polish.** If no natural match exists between two clips, a
clean jump cut or a hard cut is more honest than an invented one - and an invented match reads as a
mistake, because the eye notices the near-miss. When you do land a real one, say so in the summary:
it is the most skilled thing in the edit.

**Keep transitions invisible relative to the talent.** Never let a transition effect upstage the
person talking. **No swipes, wipes, or camera-move transitions between testimonial clips** - that
vocabulary belongs to the product and demo cutaways, not to the talking-head footage itself. A
swipe between two shots of the same woman explaining her results draws the eye to the swipe.

A `move` (push-in, glide) inside a single testimonial clip is a different question from a
transition between two, and is usually still wrong: it implies a camera operator, which contradicts
the phone-propped-on-a-shelf read. Reserve it for a product cutaway inside a testimonial.

---

## Promotional, Problem/Solution and custom: swipes as connective tissue

Use **swipe transitions - directional wipes and push transitions - as the default connective
tissue** between clips. They read as intentional and polished without drawing attention to
themselves, which is what a produced promo wants and a testimonial does not.

```json
{ "transition": { "type": "smoothleft", "duration": 0.45 } }
{ "transition": { "type": "swipeleft",  "duration": 0.30 } }
```

`smoothleft` and `smoothright` are the best default - directional like a swipe but with a soft
blended edge, so they read as eased rather than mechanical. `swipeleft` gives a harder, more
graphic edge.

### Vary direction to match content logic

**Direction should mean something.** Swipe left-to-right for before-to-after, for sequential steps,
for anything the viewer reads as forward progress. Reverse it when the content reverses.

What to avoid is not variety - it is **the same direction every time regardless of meaning**, which
is what makes a cut feel like a slideshow template. Pick each direction from what the two clips are
doing:

| Content relationship | Direction |
|---|---|
| Before to after, step 1 to step 2, problem to solution | Left to right (`smoothright` / `swiperight`) |
| Back to the problem, a contradiction, "but here is the catch" | Right to left |
| Stacking benefits as a list | Up (`smoothup`), consistently within the stack |
| Dropping to a CTA or a price | Down |

### Match the transition style to which half of the ad you are in

This is what makes Problem/Solution work, and it is the thing most often missed.

**Problem section - harder, quicker cuts and swipes.** Friction should feel slightly
uncomfortable, not smooth. `swipeleft` or `swiperight` at **0.2-0.3s**, or a straight hard cut
where the beat wants a jolt. This is where tension builds, and smoothness undercuts it.

**Solution section - slower, smoother swipes, or simulated camera moves.** `smoothleft` or
`smoothright` at **0.45-0.55s**, or no cut at all: hold a shot and put a `move` on it
(`"move": "pushin"`, `"move": "glideright"`) so the frame breathes instead of jumping. The visual
language should relax once the product resolves the problem.

**A Problem/Solution ad that moves identically throughout both halves loses the contrast that makes
the format work.** The pacing change is part of the argument, as much as the script is.

### Spend your match cut on the pivot

**Reserve match cuts for the pivot moment specifically.** The single cut from problem to solution is
the best place in the whole ad for one - same framing or same action continuing across the cut -
because it visually reinforces the transformation the ad is claiming.

Do not spend the technique elsewhere. If you have used three match cuts by the time you reach the
pivot, the pivot is just another cut.

When no genuine match exists at the pivot, the alternative is a soft opening move that reads as
relief - `circleopen` or `radial` at 0.55-0.65s - with every other join kept quieter than it.

---

## Motion graphics

Handled in Remotion, not xfade. See `motion-graphics.md` for scene-to-scene transitions, the easing
rules, and the per-scene graphic-element requirement. The short version: vary the transition to the
story beat rather than repeating one effect, ease every animated property, and never hard-cut with
no transition unless you are landing on a beat or a sound hit deliberately.

---

## Split edits: letting sound and picture cross over

Everything above is about where the *picture* cuts. A split edit is about the other half: whether
the **sound** cuts at the same moment. In a straight cut it does, and that is exactly why a cut
between a talking head and a cutaway can feel like two slides rather than one thought.

- **L-cut** — the outgoing clip's audio keeps running after its picture has gone.
  `"audioTail": 1.0` on the segment that is leaving.
- **J-cut** — the incoming clip's audio starts before its picture arrives.
  `"audioLead": 0.8` on the segment that is arriving.

Both require `"keepClipAudio": true`, because what they move is the clips' own sound.

### When to reach for one

The case they exist for is an ad that **mixes `Actor A-roll`, `Actor B-roll` and `No Actor`
material** - most brand libraries support that mix: creators' `Actor A-roll` testimonials, people
using the product as `Actor B-roll`, and `No Actor` product and environment shots.
**Use J- and L-cuts by default on every change of material in a mixed ad.** Hold the creator's
sentence over the product-in-use cutaway with `audioTail`; bring their next line in under the tail
of the next cutaway with `audioLead`. Pick cutaways labelled `Audio Type: Background Sound`, not
`Voice...`, so the only voice you are moving is the one you mean to.

A variant worth knowing: a clip's own **sound** can lead a cut too - a pour, a click, a zip, a pet's
noise arriving 0.5s before the thing is seen is a strong hook in a sound-on
placement - but only in an ad with no voiceover over that moment.

**On VO-led and motion-graphics ads** there is no clip audio to move (it is muted, or there is no
footage), so apply the same idea one layer up: overlap the **voiceover** (or a music/SFX hit) across
the cut rather than landing each line inside its own shot. Start a line under the outgoing shot and
cut on the second word (a J in effect), or hold a line over the incoming shot or scene (an L). There
is no EDL/Remotion field for it - you do it by writing the VO to the cut points the builder prints,
or by offsetting the `<Audio>` start against the `<Sequence>` in Remotion. It is the difference
between an ad that flows and one that reads as five captioned slides.

Without split edits, every change of material announces itself:

| Moment | Use | Why |
|---|---|---|
| Talking head → product cutaway | **L-cut** on the talking head | The b-roll becomes an illustration of the sentence still being spoken, not an interruption of it |
| Cutaway → back to a face | **J-cut** on the face | You hear them take the next line under the tail of the b-roll, so the return is motivated |
| Problem section → solution section | **J-cut** on the solution | Hearing the relief arrive slightly before seeing it makes the pivot land early, which is the one place in the ad you want that |
| Motion-graphics beat → live footage | Either | Start the next bed or VO line under the outgoing animation so the two halves read as one piece |

**Where a split edit is wrong:** between two takes of the same person in a testimonial. That join
is a jump cut and a jump cut is *meant* to be visible — smearing the audio across it just makes
two takes sound like one badly recorded one.

Also resist putting one on every join. A split edit is a way of saying "these two shots belong to
the same thought". If every cut says that, none of them do.

### Lengths

**0.4–1.2 seconds** is the working range. Under about 0.3s nobody registers it, so you have taken
on a complication for nothing. Past about 1.5s the viewer starts actively wondering why they are
hearing someone who is not on screen — which is attention spent on the edit rather than the ad.

Land the lead or tail on a **speech boundary**, not a stopwatch value: a tail that cuts the
speaker off mid-word is worse than no tail at all. Check the actual words before choosing the
number, and expect to adjust it once you hear the cut.

The builder clamps a lead or tail to however much source exists either side of your in/out points
and warns when it has to. Heed that warning — a silently shortened lead is just a plain cut again,
and it is invisible until someone watches the render.

## Captions: the burned-in text question comes first

**Before writing a single caption, check whether the clip already has one burned in.**

- **If the clip has burned-in captions, do not add your own.** Two layers of text is unreadable, and
  the clip's own words will contradict your script. This is a hard stop, not a preference. Either
  work with what the clip already says, or pick a different clip.
- **Otherwise, add captions.**

**If the brand has a `Captions` label category** (`Captions` / `No Captions`) - use it. For a clean cut that you
will caption yourself, filter `{"Captions": ["No Captions"]}`; clips labelled `Captions` (and the
`Edited Clips` Scene Type / Asset Type, and `Online Content`) are finished social posts with text
baked in. Labels are not on every clip and were applied by hand, so still pull
`get_clip_sprite_image(clipSymbol)` for every clip in the plan - a label cannot tell you where on the
frame the text sits, and an unlabelled clip is "unknown", not "clean".

Do this **once, for the whole plan, before writing any caption timings** - not clip by clip as you
build. A mixed cut where three clips have burned-in text and four do not is worse than either choice
made consistently: the viewer sees captions appear and disappear for no reason. If most of your
picks are captioned, either lean in and caption nothing yourself, or swap the captioned clips out.

The ones to watch on this brand: creator UGC (many creators deliver with TikTok-style captions
burned in), anything labelled `Captions`/`Edited Clips`/`Online Content`, and any footage the user
uploads. Treat those as "has captions" until a sprite proves otherwise. If a testimonial you want
already carries its own captions, keep them and add none - don't stack a second layer.

### When you are captioning

**Caption every spoken line by default.** Most of this audience watches muted, so an uncaptioned
spoken claim is a claim that was not made.

- **Short bursts synced to speech**, not one caption held across a paragraph. The caption should
  arrive as the words are said - **never fade up before the words start**, which reads as a
  teleprompter.
- **No more than 4-5 words visible at once.** Break a longer line into two captions rather than
  shrinking the type.
- **Fade-and-rise on entrance** (`"anim": "fadeup"`), **quick fade or a cut-out on exit**. Use
  `"exit": "cut"` when the next beat starts immediately - a fade that outlives its shot is the
  commonest way burned-in text looks amateur.
- **Use `band`** to dodge anything already in the frame and to stay clear of platform UI.

### Text animation with intent

Animate to do a job, not to be animated:

| Job | `anim` |
|---|---|
| Standard entrance - most captions | `fadeup` (fade and rise) |
| Emphasis on a single keyword | `pop`, or `punch` for the one claim of the ad |
| An ordered list of benefits, read in sequence | `slideleft` with `lines` + `stagger` |
| Something being dismissed or de-emphasised | `fadedown` (fade and drop) |
| A legal or dosage line that should not draw the eye | `none` |

For a list, pass `lines` instead of `text` and the builder gives each line its own staggered
entrance, so they read as a list rather than as a paragraph:

```json
{ "start": 8.2, "end": 12.0, "band": "middle", "anim": "slideleft", "stagger": 0.18,
  "lines": ["High protein", "Low carb", "Tastes like childhood"] }
```

(Illustrative wording only - every real number comes from the user; there is no website to read it from.)

**Pair the text motion with the cut motion.** In a left-swiping section, `slideleft` captions travel
with the picture; in a hard-cut testimonial, sliding text fights the jump cuts, so `fadeup` plus one
`punch` is enough.

**One `punch` per ad.** It marks the claim. Two mark nothing.

**No text should appear before the visual beat it refers to.** Name the problem when the problem is
on screen. Label the solution the instant it is introduced, not two seconds early because the
caption timing was easier that way.

---

## Supporting graphics: three jobs, no decoration

A graphic earns its place by doing a job. In a **testimonial**, add one only when it is:

- **reinforcing a specific claim being spoken** - a stat callout, a before/after, a price
- **cutting away from a lull or a stumble** in the footage, where a jump cut would be jarring
- **showing the product being used** at the moment it is mentioned

If none of those apply, leave the frame as clean talking-head footage. **A testimonial
over-decorated with graphics reads as an ad pretending to be UGC, which is worse than plain UGC** -
you lose the authenticity without buying production value.

In **promotional and Problem/Solution** ads, small supporting graphics - icons, arrows, comparison
bars, highlight circles - earn their place where they **clarify something the raw footage cannot
show on its own**: pointing at a feature, quantifying a benefit, contrasting before and after.

If the footage alone already communicates the beat clearly, leave it graphic-free. Do not decorate a
clip that does not need it.

---

## The vocabulary

### Transitions

`build_ad.mjs` accepts these as `transition.type`. All are ffmpeg `xfade` transitions, verified
present in a full ffmpeg build.

| Group | Types | Use |
|---|---|---|
| **Cut** | `cut` | Testimonials. The default when `transition` is omitted. |
| **Swipe** | `swipeleft`, `swiperight`, `swipeup`, `swipedown` | Hard-edged directional. The problem half. |
| **Smooth** | `smoothleft`, `smoothright`, `smoothup`, `smoothdown` | Directional, soft edge. **Best default.** The solution half. |
| **Soft** | `fade`, `dissolve`, `fadeblack`, `fadewhite` | Time passing, or a section break. `fadeblack` is a full stop - once at most. |
| **Wipe / reveal** | `wipeleft/right/up/down`, `revealleft`, `revealright`, `coverleft/right/up/down` | `cover*` slides the new clip over the old; `reveal*` slides the old away. |
| **Shape** | `circleopen`, `circleclose`, `radial`, `zoomin`, `squeezeh`, `squeezev` | Draws attention to itself. Reserve for the pivot or a product reveal. |
| **Texture** | `pixelize`, `hblur` | Rarely right. `hblur` can work into a product hero. |

There is **no whip-pan transition in the ffmpeg path** - a real whip pan needs directional motion
blur that `xfade` cannot produce, and faking one with a very fast swipe reads as a glitch. Build
whip pans in Remotion, or use a fast `swipeleft` at 0.2s and call it what it is.

Transitions **shorten the timeline**: output equals the sum of clip durations minus the sum of
transition durations. The builder prints the real per-segment output timeline, and captions must be
timed against that. A transition longer than 60% of either neighbour is capped automatically.

### Simulated camera moves, within one clip

Set `move` on a segment to add motion without cutting. This is how the solution half slows down
while still moving, and how you rescue a clip composed slightly too wide.

| `move` | Motion | Use |
|---|---|---|
| `pushin` | Scales up across the clip | The solution beat; settling onto a product or a face |
| `pullback` | Scales down, revealing context | An end card, or opening out from a detail |
| `glideleft`, `glideright` | Drifts sideways at a constant crop | A held product shot that would otherwise be static |
| `glideup`, `glidedown` | Drifts vertically | Travelling up a stacked set, or down into a pan |

```json
{ "clipSymbol": "XWH", "in": 2.0, "out": 5.5, "move": "pushin", "moveAmount": 0.10 }
```

`moveAmount` is the extra scale travelled and defaults to `0.10` (a 10% push). **Keep it under
about 0.15** - past that it reads as a zoom effect rather than as camera language. The builder
oversamples the source before zooming, so a push-in stays sharp instead of becoming an upscale.

### Easing

Everything that moves should accelerate and decelerate. Linear motion is the clearest signal that
something was generated rather than designed.

**In the ffmpeg path**, easing is mostly a choice of transition: the `smooth*` family is
perceptually eased, the `swipe*` and `wipe*` families are linear. If a swipe feels mechanical,
switch to `smooth*` at the same duration rather than lengthening it. Caption `pop` and `punch`
overshoot and settle rather than scaling linearly.

**In Remotion**, ease every animated property - see the Easing section of `motion-graphics.md`.

---

## Timing

| | Duration |
|---|---|
| Problem-section swipe | **0.2-0.3s** - quick, slightly uncomfortable |
| Solution-section swipe | **0.45-0.55s** - slower, smoother |
| The pivot | 0.55-0.65s - deliberately slower than every other join in the ad |
| Generic transition | 0.3-0.5s. Under 0.25s reads as a glitch; over 0.7s stalls a 15s ad |
| Caption in / out fade | 0.15-0.25s, or `exit: "cut"` |
| Caption line stagger | 0.15-0.20s |
| Text on screen | at least 1.2s, or it cannot be read |
| Motion-graphics scene move | 0.6-1.0s, eased |
| Hook text entrance | under 300ms - it should snap in |

**Transitions eat runtime.** Four clips with three 0.5s joins lose 1.5s - on a 15s ad that is a
whole beat. Budget it when you plan the scene list, then check the builder's reported output
duration against the target rather than assuming.

## What goes wrong

- **A swipe between two talking-head testimonial clips.** Hard cut instead.
- **A forced match cut** where nothing actually matches. Jump cut instead.
- **Match cuts spent early**, leaving the pivot with nothing.
- **One swipe direction for the whole ad regardless of meaning**, or direction changing at random.
  Both read as templated; direction should follow content.
- **Identical pacing across both halves** of a Problem/Solution ad.
- **Your caption stacked on a clip's burned-in subtitles.** Filter `Captions: ["No captions"]`, and
  still sprite-check the whole plan up front - the label is not on every clip.
- **A caption fading up before the line is spoken.**
- **Static captions.** Every caption takes an `anim`; the default `fadeup` beats nothing.
- **More than one `punch`.**
- **Graphics decorating a testimonial** that was working as plain footage.
- **Captions timed against raw clip lengths** after transitions shortened the cut.
- **Picture and sound cutting together on every join** in an ad that mixes A-roll, b-roll and
  product shots. That is what makes a cut feel like a slideshow - hold the speaker across the
  cutaway with `audioTail`, bring the next line in early with `audioLead`.
- **A split edit that cuts a word in half.** Land the lead or tail on a speech boundary; check the
  words, do not pick a round number.
- **A split edit on a testimonial jump cut.** The jump is the point; do not smooth it.

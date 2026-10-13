# Captions, text animation, split edits and timing

Shared by every format. Read it before writing caption timings or J/L-cuts.

## Burned-in captions come first

**Before writing a single caption, check whether the clips already have captions burned in.**

- **If a clip has burned-in captions, add none of your own.** Two layers of text is unreadable, and the
  clip's words will contradict your script. Either work with what it says, or pick a different clip.
- **Otherwise, add captions.**

If the brand has a `Captions` label category, filter `{"Captions": ["No captions"]}` for footage you will
caption yourself (use the exact casing `list_labels` returns). Labels are applied by hand and not on
every clip, so still sprite-check every clip in the plan - an unlabelled clip is "unknown", not "clean".

Decide this **once for the whole plan**, before any caption timings. Captions appearing on some clips
and not others, for no reason, is worse than either choice made consistently. Treat creator UGC, edited
clips and user uploads as "has captions" until a sprite proves otherwise.

## When you are captioning

**Caption every spoken line by default** - most viewing is muted.

- **Short bursts synced to speech.** The caption arrives as the words are said - **never fade up
  before the words start**.
- **No more than 4-5 words visible at once.** Split a longer line rather than shrinking the type.
- **Fade+rise on entrance, quick fade or cut-out on exit** (`"exit": "cut"` when the next beat starts
  immediately).
- **Place each caption where the frame is empty.** `band` gives three fixed heights (`upper` 0.27,
  `middle` 0.50, `lower` 0.73 of the frame). When a band would sit on a face or the product, set `y`
  instead (0 = top, 1 = bottom, kept between 0.08 and 0.88): read the face and product positions off the
  sprite and put the text in the gap - for a creator holding a box at chest height that is often just
  under the chin (~0.42) or below the product. Platform UI covers the top 8% and bottom 12%.

## Text animation: one vocabulary for both renderers

Animate to do a job. The same four presets exist in the ffmpeg captions and (from Stage 3) the Remotion
template - use these names in plans:

| Rule | Job | ffmpeg caption `anim` | Remotion preset |
|---|---|---|---|
| **fade+rise** | Standard entrance - most text | `fadeup` | `fadeRise` |
| **fade+drop** | Something dismissed or de-emphasised | `fadedown` | `fadeDrop` |
| **scale-pop** | Emphasis on one keyword | `pop` (`punch` for the one main claim) | `scalePop` |
| **slide-in-sequence** | An ordered list of benefits | `slideleft` + `lines` + `stagger` | `slideInSequence` |
| fade (snap) | The hook line: in under 300ms, no movement | `fade` | `fade` (default on scene 1) |
| none | A legal or dosage line that shouldn't draw the eye | `none` | - |

```json
{ "start": 8.2, "end": 12.0, "band": "middle", "anim": "slideleft", "stagger": 0.18,
  "lines": ["<Benefit one>", "<Benefit two>", "<Benefit three>"] }
```

- **One `punch` per ad.** It marks the claim; two mark nothing.
- **No text appears before the visual beat it refers to.** Name the problem when the problem is on
  screen; label the solution the instant it appears.
- **Hook text snaps in under 300ms**; supporting text can ease in slightly slower. The hook's snap is
  an *entrance speed*, not emphasis: give a hook line `fade` (250ms, no movement) or `fadeup`, and keep
  the ad's single scale-pop / `punch` for its main claim. Use `pop` on the hook only when the hook *is*
  the claim (one keyword or number).
- **Pair text motion with cut motion**: `slideleft` in a left-swiping section; `fadeup` in hard-cut
  testimonials.

## Split edits: J-cuts and L-cuts

- **L-cut** - the outgoing clip's audio keeps running after its picture has gone: `"audioTail": 1.0`
  on the segment that is leaving.
- **J-cut** - the incoming clip's audio starts before its picture arrives: `"audioLead": 0.8` on the
  segment that is arriving.

Both need `"keepClipAudio": true`. **Use them on every change of material in an ad that mixes Actor
A-roll, Actor B-roll and No Actor clips**, and pick cutaways labelled `Audio Type: Background Sound` so
the only voice you move is the one you mean to.

| Moment | Use | Why |
|---|---|---|
| Talking head -> product cutaway | **L-cut** on the talking head | The cutaway illustrates the sentence still being spoken |
| Cutaway -> back to a face | **J-cut** on the face | You hear the next line first, so the return is motivated |
| Problem -> solution | **J-cut** on the solution | Hearing the relief slightly early makes the pivot land |
| Motion-graphics beat -> footage | Either | Start the next VO line under the outgoing animation |

**On VO-led and motion-graphics ads** there is no clip audio to move, so do it one layer up: start a VO
line under the outgoing shot (a J in effect) or hold it over the incoming one (an L). Write the VO to
the cut points the builder prints, or offset the `<Audio>` start against the `<Sequence>` in Remotion.

**Where a split edit is wrong:** across a testimonial jump cut. And not on every join - a split edit
says "these two shots are one thought"; if every cut says it, none do.

**Lengths:** 0.4-1.2s. Under ~0.3s nobody registers it; past ~1.5s the viewer wonders whose voice it is.
Land the lead or tail on a **speech boundary**, never mid-word. The builder clamps a lead or tail to the
source that exists and warns - heed the warning, because a silently shortened lead is just a plain cut.

## Timing

| | Duration |
|---|---|
| Problem-section swipe | **0.2-0.3s** |
| Solution-section swipe | **0.45-0.55s** |
| The pivot | 0.55-0.65s - slower than every other join |
| Generic transition | 0.3-0.5s. Under 0.25s reads as a glitch; over 0.7s stalls a 15s ad |
| Caption in/out fade | 0.15-0.25s, or `exit: "cut"` |
| Caption line stagger | 0.15-0.20s |
| Graphic text on screen (titles, callouts, end cards) | at least 1.2s |
| Spoken captions | follow the speech; aim for 0.8s+ by merging short bursts, never by running ahead of the words |
| Motion-graphics scene move | 0.6-1.0s, eased |
| Hook text entrance | under 300ms |
| J/L-cut | 0.4-1.2s |

**Transitions eat runtime**: output = sum of clips - sum of transitions. Four clips with three 0.5s joins
lose 1.5s - a whole beat on a 15s ad. Time captions against the timeline the builder prints.

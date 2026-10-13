# QC checklist

Read at QC (Step 6), and give it to anyone reviewing the cut. Each item is a rule from the skill that
is easy to break; check the plan before rendering and the render before delivering.

## Brand and library
- Guessing the brand, or using a slug the user didn't confirm; clips or claims from another brand.
- Filtering on an untested, dead or "(do not use)" label and concluding the footage doesn't exist -
  dead-ness is per brand (`Hook`/`CTA`/`Problem` are live in some libraries, dead in others).
- Stacking 3+ filter categories; trusting an empty label list as "no labels"; a stale cache trusted over
  a live `list_labels`.
- Two clips from one shoot (`rawVideoPublicId`) as separate beats - except jump cuts inside one take.

## Voice and talent
- A VO over a creator who is visibly talking; `keepClipAudio: true` on a VO cut.
- A testimonial or mashup promised before verifying the creator actually speaks on the clips.
- Two voices in one testimonial arc; a creator presented as the founder, staff or an expert.
- Additional voiceover on a mashup.

## Product and claims
- The wrong product or variant on screen; a product without a live website page advertised as current.
- A claim or number not on the site and not from the user; invented review counts; expired offers in
  old promo clips; regulated claims without the site's disclaimer.
- Readable competitor packaging on screen, or a competitor named without the user's say-so.

## Picture and edit
- A swipe, wipe or camera-move transition between two talking-head testimonial clips.
- A forced match cut where nothing lines up; match cuts spent before the pivot.
- One swipe direction for the whole ad regardless of meaning, or direction changing at random.
- Identical pacing across both halves of a Problem/Solution ad.
- A graphic decorating a testimonial that was working as plain footage.
- A portrait UGC clip `cover`-cropped into 16:9; trusting plain ffprobe width/height (rotation flag).
- Motion graphics: **any animated scene, insert or overlay whose only animation is text** (a counter, rule line,
  scribble or sparkles alone still counts as text); a visual made of generic shapes when the brand has motifs
  (its own object, product colours, packshots); the same animation leading two scenes in a row or more than two scenes (`mg_check` blocks it), an ad that
  opens or runs like the brand's last one; linear motion outside
  ambient loops; a bare hard cut that isn't landing on a beat. `mg_check.mjs` must PASS.

## Text and captions
- Captions stacked on a clip's burned-in text; captions on some clips and not others for no reason.
- A caption fading up before the line is spoken; more than 4-5 words visible at once.
- Text appearing before the visual beat it refers to; static (unanimated) captions.
- More than one `punch` / scale-pop keyword (a hook line that only snaps in with `fade` doesn't count).
- A caption sitting on a face or on the product - move it with `y`.
- Captions timed against raw clip lengths after transitions shortened the cut.
- Screenshots or finished social posts used as b-roll.

## Audio
- `music.gainDb` set in the EDL - it disables the measured -4 dB music-under-voice rule.
- Picture and sound cutting together on every join in a mixed A-roll / B-roll / No Actor ad.
- A J/L-cut that cuts a word in half, or one placed across a testimonial jump cut.
- A line of dialogue that stops abruptly: its last word clipped at a cut or at the end of a segment (`out` must sit
  0.3-0.5s after the last word's end).
- A silent music bed shipped because generation failed, instead of saying so.

## Timing and delivery
- Output duration more than 0.5s off the target; transitions forgotten in the runtime maths.
- A script that overruns the picture at ~2.6 words/s.
- A runtime over 2 minutes chosen without asking the user.
- Resolution that doesn't match the chosen ratio (1080x1920 or 1920x1080).
- No CTA on the last beat.

## Variety (so ads and variants don't all look templated)
- The same transition type and direction three joins in a row, or every scene the same length.
- Every caption with the same animation, or every scene on the same background.
- A/B variants whose hooks open on the same first clip, the same first two words, or the same graphic -
  change the hook's *mechanism* (question vs result vs problem shown), not just its wording.
- Two ads for one brand in a row with the same structure and the same shots - say so and offer another
  structure from `script-structures.md`.

## Assets
- A retyped, redrawn or generated logo; generated product, packaging or customers.
- An unlicensed or unflagged stock asset.

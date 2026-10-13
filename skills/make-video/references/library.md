# Working a Recharm library (any brand)

Read before your first search. The method follows Recharm's **brief-creator** (labels once -> section
-> literal queries + label filters -> dedupe -> save_brief), extended with looking at every pick,
because you are cutting a real ad. Brand specifics (which labels exist, which are dead, who the
creators are) come from the brand cache: `~/.claude/make-video/brands/<slug>/catalog/`.

## 1. What labels can and can't do

- Filters **AND across categories and OR within one**. Use 1-2 categories per search; three or more
  usually returns nothing. Put the rest of the idea in the query text.
- **Labels are applied by hand and are incomplete.** A filter finds *labelled* clips; an unfiltered
  query finds everything. Filters give precision, an unfiltered literal query is the backstop.
- **Only top hits return `categoriesAndLabels`.** A hit with no labels is *unknown*, not unlabelled -
  sprite-check it.
- **Labels describe intent, not measurement.** Many clips labelled `Background Sound` are digitally
  silent; some `Actor B-roll` clips have the person speaking to camera. Your eyes and ffprobe decide.
- **Dead labels**: `list_labels` can return values that retrieve nothing in search. Which ones is a
  per-brand fact - Scene Type names such as `Hook`, `CTA`, `Demo`, `Problem` are dead in some libraries
  and live (25+ hits) in others. **Never assume; test each with one filtered search and record the
  result** (`catalog_tool.mjs dead`). An empty result on a dead label means "no such footage", not "bad
  query". Find those beats by *content* (what is in the shot) plus Actor/Audio/Creator filters. A search
  response that is only `{"cursor":0,"hasNext":false}` with no hits means zero results. `node scripts/check_filters.mjs --brand <slug> '<json>'`
  warns before you search.
- **"(do not use)" values** are tagged by the library owners as unusable. Never filter on them or pick
  clips that carry them; `check_filters.mjs` errors on them.
- **Thin labels** (1-9 hits, often one shoot): a beat built on one has one or two real options.
- **Variants live in their own category.** `Product` may only hold coarse types (Cereal, Treats...) while
  the SKU or flavour sits in `Flavor`, `Variant`, `Size`, `Colour`... Filter on the category that actually
  names what the user asked for (see `products.json -> categories`).
- Admin categories (`Batch`, `Usage Rights`, `Recharm`) are not creative filters. Filters cannot
  exclude, so screen out unwanted shoots on the picks instead.

Map each ad beat to a *live* label using the brand's `filters.json` / `scene-types.json`, e.g.
Problem beat -> a Problems/Competitor category; Proof -> Experiment/Demo/Benefit; Product -> `Product`
+ Product Actions; People -> `Creator` + `Actor Type`; Clean vs captioned -> `Captions`.

## 2. Searching

The search method is Step 4 in `SKILL.md`. If a scene comes back empty or weak: drop one filter
category, then try the unfiltered query, then a synonym. Only then call it a gap, and say so plainly.

## 3. Screening picks

**Measure the shortlist first** (downloads each clip once; it is cached for the render):

```bash
node scripts/clip_tag.mjs <clip urls or files> --out tags.json
```

Per clip: real length and orientation, cuts inside the clip (never set an in/out across one), frozen and black
stretches, brightness, motion energy (low / medium / high), audio and whether it is speech-level, the usable
windows, and a 1-5 usability score. Use it to:

- **choose in/out points** inside a usable window, not across an internal cut or a frozen stretch;
- **match energy to the beat** - high-motion clips for hooks and problem beats, low/medium for the solution,
  testimonial A-roll and the CTA;
- **drop weak picks** - usability 1-2 needs a strong reason; between two equal picks, take the higher score.

`clip_tag` cannot see burned-in text, offers, logos or which product is shown - so it ranks, the sprite decides.
**Check the window you'll use, not just the clip**: a clip whose first half has someone talking can still be a clean
B-roll pick after its internal cut, but say so in the plan and check its `Actor Type`/speech for that window.
Then score what the numbers can't see, from the sprite, 1-5 each: **subject clarity** (is the product or person
obvious at phone size), **framing** (subject inside the crop for this ratio), **on-brand** (right product and
variant, no competitor), **cleanliness** (no burned-in text, offers, watermarks). A pick needs 4+ on all four, or
its weakness named in the plan.

Every clip that reaches the plan: `get_clip_sprite_image` (frames across the clip; the poster alone
misses things). Check:

- **burned-in text** (offers, bubbles, captions). If a clip is captioned, either use its text
  deliberately or drop it; never stack your captions on it. With a `Captions` label category, filter
  `No captions` for footage you will caption yourself, and still sprite-check.
- **mouth movement** on any clip going under a VO;
- **competitor branding** readable on screen;
- **wrong product or variant** (flavour, colour, size);
- subject position across the clip (for 9:16 crops of landscape clips), dead frames, exposure;
- mislabels, including a competitor's or a different SKU's package inside a clip labelled with the user's
  product: reject it, or use it deliberately as the "old way" only if no rival brand is readable.
- **finished ads**: some libraries are mostly finished, captioned ads with offers burned in. Those are
  not b-roll; treat them as unusable footage (see "Small or unusable libraries").

Probe the **real duration**, orientation and audio of every pick - the `durationMs` in search results can
run a few frames longer than the file, so set every `out` point from the probe, not from search:
`ffprobe -v error -show_entries format=duration:stream=width,height,r_frame_rate:stream_side_data=rotation -of json <url>`.
A portrait clip is often stored landscape with a +/-90 degree rotation flag; plain width/height lies.
`build_ad.mjs` reads the rotation.

## 4. The talking-head reality

Before promising a creator-led format (testimonial, mashup, mixed), count the live creators and the
clips with **verified** speech - `Audio Type`, a loudness probe, and a sprite showing the mouth moving -
from `actor-types.json` and `creators.json`, and tell the user the numbers. If a testimonial creator has
no verified speech, offer a VO-read testimonial-style cut over their b-roll (and say it is narration) or
ask for uploads. Which footage each voice source allows is the table in `SKILL.md`.

**When the voice rule empties a beat.** If a beat's only clips are `Actor A-roll` + `Voice` (common for
Problem/Hook beats) and the ad is voiceover-led, do not un-mute them. Options, in order: (1) a different
live label for the same idea (B-roll, lifestyle, product without a person); (2) a trimmed non-speaking
moment of the A-roll clip, verified frame by frame (Video-Use), muted; (3) a motion-graphic beat; (4)
switch that beat to the creator's own voice and J/L-cut into the VO. Name the compromise in the plan.

**Unlabelled hits.** Many hits return `categoriesAndLabels: []` - unknown, not wrong. Do not spend search
budget per-label to classify them; sprite-check only the shortlist that reaches the plan.

**Search cost.** `search_clips_visually` has no result limit and returns ~20-40 full hits per call
(roughly 8-10k tokens) - it is the biggest cost in the skill. Write **2 queries per scene**, use narrow
filters you have already validated, and run the searches in subagents that return only a short pick
list (see `SKILL.md` Step 4), so raw results never enter the main conversation.

**Small or unusable libraries.** If the library has under ~30 clips, an unfiltered query returns almost all
of it and the "lowest cosineDistance" rule stops meaning anything: enumerate once, **sprite-check every clip - not a
sample** (one clean clip among twenty finished ads is exactly what a sample misses), and choose by eye. `clip_tag`
measures cuts, motion and speech; it cannot see burned-in text, offers or which product is on screen, so it narrows
the list but never replaces the sprite. If what is there is finished ads with burned-in captions or offers, or nothing fits the
brief, say so and offer the no-footage route: a motion-graphics ad built from the website's logo,
packshots and palette (`motion-graphics.md`), instead of forcing weak clips into the plan.

## 5. Coverage

Count distinct shoots and usable seconds; want ~1.5x the runtime. A weak scene is a gap (motion-graphic
beat, website image, or custom shoot), said out loud, not padded.

## 6. Refreshing

If `list_labels` shows new categories or values, a search returns labels the cache does not know, or a
dead value starts returning hits, the library was re-labelled: re-validate those values (one filtered
search each), update the catalogs (`catalog_tool.mjs labels|dead`) and tell the user what changed.

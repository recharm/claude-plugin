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

1. **`list_labels(slug)` once per job**; use only values it returns (compare with the cache; trust the
   live call).
2. **Section the ad into ordered scenes** (~2-5s each, max 18): heading, 1-2 sentence description,
   narrative role (hook / problem / agitation / pivot / solution / proof / CTA).
3. **Per scene, 2-4 queries**: a literal visual phrase under ~8 words ("hand pouring powder into
   glass", not "morning energy") plus 0-2 filter categories with 1-3 live values. Always `Product`
   (when the brand has it) on product-showing searches, and the voice filter the format needs
   (`SKILL.md` -> "The voice decides the footage").
4. **Validate** the filter map with `check_filters.mjs` (write it to a file and pass `--file` on
   PowerShell).
5. **Search**: `search_clips_visually` once per query, first page only. Take the 1-3 lowest
   `cosineDistance` hits, aim for 3-5 candidates per scene, dedupe by `clipSymbol`, **max one clip per
   `rawVideoPublicId` per scene**, and across the ad avoid two clips from one shoot as separate beats
   (a jump cut inside one take, or a before/after in one location, is fine). Record each pick's
   `searchString` and `filters` - they go into the brief.
6. **Empty or weak?** Drop one filter category, then the unfiltered query, then a synonym. Only then
   call it a gap; say so plainly.

## 3. Screening picks

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

Probe orientation and audio of every pick:
`ffprobe -v error -show_entries stream=width,height,r_frame_rate:stream_side_data=rotation -of json <url>`.
A portrait clip is often stored landscape with a +/-90 degree rotation flag; plain width/height lies.
`build_ad.mjs` reads the rotation.

## 4. The talking-head reality

Decide what the library can carry before you promise a format. From the brand's `actor-types.json`
and `creators.json`:

| Format | Needs |
|---|---|
| VO-led, VSL, promo, problem-solution, comparison, tutorial, day-in-the-life, motion graphics | Actor B-roll + No Actor footage, muted. Usually deep |
| Mashup (A-roll only, no VO) | Several distinct creators with verified speech. Count them before promising |
| Testimonial (one creator's own words) | One creator whose clips contain speech that carries hook -> story -> CTA. Verify (`Audio Type`, volumedetect, sprite for mouth). If not, offer a VO-read testimonial-style cut over their b-roll (and say it is narration) or ask for uploads |
| Mixed A-roll + B-roll + No Actor | J/L-cuts; A-roll from verified speaking creators |

Say how many live creators and how many speaking clips you found before the user commits to a
creator-led format.

**When the voice rule empties a beat.** If a beat's only clips are `Actor A-roll` + `Voice` (common for
Problem/Hook beats) and the ad is voiceover-led, do not un-mute them. Options, in order: (1) a different
live label for the same idea (B-roll, lifestyle, product without a person); (2) a trimmed non-speaking
moment of the A-roll clip, verified frame by frame (Video-Use), muted; (3) a motion-graphic beat; (4)
switch that beat to the creator's own voice and J/L-cut into the VO. Name the compromise in the plan.

**Unlabelled hits.** Many hits return `categoriesAndLabels: []` - unknown, not wrong. Do not spend search
budget per-label to classify them; sprite-check only the shortlist that reaches the plan.

**Search cost.** `search_clips_visually` has no result limit and returns ~20-40 full hits per call
(roughly 8-10k tokens). Use narrow filters, keep queries few and purposeful, and for catalog sweeps hand
batches to subagents (one label group each) that write findings to the cache and return a summary.

**Small or unusable libraries.** If the library has under ~30 clips, an unfiltered query returns almost all
of it and the "lowest cosineDistance" rule stops meaning anything: enumerate once, sprite-check everything,
and choose by eye. If what is there is finished ads with burned-in captions or offers, or nothing fits the
brief, say so and offer the no-footage route: a motion-graphics ad built from the website's logo,
packshots and palette (`motion-graphics.md`), instead of forcing weak clips into the plan.

## 5. Coverage

Count distinct shoots and usable seconds; want ~1.5x the runtime. A weak scene is a gap (motion-graphic
beat, website image, or custom shoot), said out loud, not padded.

## 6. Refreshing

If `list_labels` shows new categories or values, a search returns labels the cache does not know, or a
dead value starts returning hits, the library was re-labelled: re-validate those values (one filtered
search each), update the catalogs (`catalog_tool.mjs labels|dead`) and tell the user what changed.

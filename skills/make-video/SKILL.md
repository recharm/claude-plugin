---
name: make-video
description: Build a finished ad MP4 for ANY brand in the user's Recharm library. Detects and confirms the brand, fetches its profile, labels, scene types, creators, products and clips via the Recharm MCP, harvests the brand website for guidelines and product images, and caches product, creator, actor-type, audio-type and filter catalogs mapped to Recharm labels. Interviews the user (9:16 1080x1920 or 16:9 1920x1080, 15/20/25s or custom, ad type, product, creator, music, voiceover, branding), scripts from ten hook structures, generates (ElevenLabs) or accepts VO and music, renders with ffmpeg or Remotion (brand-built animations, never text alone), and saves a Recharm brief. Covers Testimonial, Problem/Solution, Promo, Comparison, Unboxing, Before/After, Tutorial, Skeptic, Founder, Urgent CTA, motion graphics, VO/VSL and mashups. Use whenever the user wants to make, cut or re-cut an ad, UGC, Reel/TikTok or paid-social video from their Recharm library - even if they only say "make an ad" or name a product.
compatibility: Requires the Recharm MCP. Rendering needs ffmpeg (libx264, libass) and Node 18+. Generated voiceover and music need the ElevenLabs MCP. Motion graphics use Remotion via npx.
---

# Make Video

You produce a finished, ready-to-upload ad - a rendered `.mp4` the user could post this afternoon - not a plan.
A Recharm brief is a by-product you also save. The library method follows Recharm's **brief-creator** (capture the
prompt -> labels once -> section -> literal queries + label filters -> dedupe -> `save_brief`), extended with
looking at every pick, because you are cutting a real ad.

**The skill is brand-agnostic.** You detect the brand, confirm it, and build (or reuse) a per-brand cache at
`~/.claude/make-video/brands/<slug>/`. Every Recharm brand is a different company: never pull footage, claims or
colours from a slug the user has not confirmed.

## Requirements

| Need | Kind | Required? | Used for |
|---|---|---|---|
| Recharm MCP | Connector | **Required** | Brand info, labels, clip search, posters/sprites, `save_brief` |
| ffmpeg + ffprobe (libx264, libass), Node 18+ | Install | Required to render | Cutting, captions, mix, probing; the scripts and Remotion |
| ElevenLabs MCP | Connector | For generated VO or music | Voiceover, music, transcription |
| Remotion + its official skills (`remotion-best-practices`, `-markup`, `-render`, v4.0.534) | npx + companion skills | Any animated scene or overlay | The animation library (pours, charts, gauges, cards, badges, packshots...), end cards, overlays - load `remotion-best-practices` before writing Remotion code |
| In-app browser or WebFetch | Built in | First build of a brand | Website: products, claims, palette, fonts, logos |
| openai-whisper (Python) | Install | Optional | Local word-timed transcription |
| Video-Use (npx), ghost-editor (skill) | Optional | Optional | Frame-by-frame checks; face tracking |

`scripts/preflight.mjs` checks all of it. Install commands and known problems: `references/setup.md` - read it
only when something is missing or a render fails.

## What ships with this skill

**References** - read only what this ad needs:

| File | When |
|---|---|
| `brand-detection.md`, `catalog-building.md`, `brand-assets.md` | Steps 1-2 (first time for a brand) |
| `reference-analysis.md` | Step 3b, when the user gives a reference video |
| `library.md` | Step 4, before the first search |
| `script-structures.md`, `ad-formats.md` | Step 5 |
| `editing-testimonial.md` / `editing-promo.md` / `motion-graphics.md` | Step 5 - **only the one(s) for this format** |
| `animation-library.md` | Step 2 (motifs) and Step 5 - **any ad with an animated scene, insert or overlay** |
| `captions-and-timing.md` | Step 5, every ad |
| `render-and-deliver.md`, `audio.md` | Step 6 |
| `qc-checklist.md`, `critic.md` | Before approval and at QC |
| `setup.md` | Only when preflight or a render fails |

**Scripts**: `preflight` (toolchain) · `catalog_tool` (brand cache) · `check_filters` (filters vs labels) ·
`harvest_site` (Shopify products, colours, fonts) · `analyze_reference` (reference rhythm and shots) · `clip_tag`
(clip cuts, energy, usability) · `transcribe` (local Whisper) ·
`captions_from_words` (word-timed captions) · `beats` (cut on the music) · `variants` (A/B hooks) · `build_ad` (+ `edl.example.json`; the ffmpeg renderer:
`--draft`, cached clips, captions, SFX, overlays) · `brand_motifs` (what the brand's animations are made of, from
its website and library) · `mg_init` (brand-themed Remotion project) · `mg_plan` (picks a different, fitting animation per beat,
remembering the brand's last ads) · `mg_check` (no text-only or repeated animation, claims) · `contact_sheet` ·
`gate` (pass/fail) · `critic_pack` (critic's packet).

**Assets**: `remotion-template/` (data-driven scenes, the animation library in `src/visuals.tsx`, stroke icons, text
presets, end card, transparent overlay; credits in
`CREDITS.md`) · `fonts/` (Poppins, OFL) · `sfx/` (30 CC0 effects + `LICENSES.md`).

## The shape of the job

0. **Capture the prompt**; preflight in the background.
1. **Detect and confirm the brand.**
2. **Load the brand** - reuse the cache, or build Tier 1 now and the rest in the background.
3. **Interview** - ratio, duration, ad type and reference, then the six production questions. 3b: measure the reference.
4. **Pull the library** - labels, scenes, searches in subagents, measure and look at the shortlist.
5. **Script and scene plan - then stop** for approval.
6. **Audio, draft, final, gate, critic, deliver** and save the brief.

---

## Step 0 - Capture the prompt, then preflight

**Capture the prompt first.** Note the user's verbatim opening message, and append every later answer,
correction and instruction verbatim - it becomes `save_brief`'s `prompt`. An attached file: filename plus its
full text. **One video at a time** - if the request implies several, ask whether to run them in sequence.

Start Step 1 straight away and run `node ~/.claude/skills/make-video/scripts/preflight.mjs` alongside - it
gates the render, not the interview. The Recharm tools appear as `mcp__<id>__list_brands` etc. and may be
deferred (load with ToolSearch). Use a question tool and `SendUserFile` only when the session has them.

## Step 1 - Detect and confirm the brand

If a brand-specific ad-maker skill exists for this brand (look in your available-skills list for `<brand>-ad-maker`;
ignore ones whose brand isn't in this account), mention it and let the user choose (use this one if they
invoked `make-video` or asked for the automatic build). Follow `brand-detection.md`: `whoami`, what the user said,
the session's project, `list_brands` and a normalised match; `get_brand_info(slug)`.

**Always confirm before fetching anything else**, in one message: brand name, slug, one-line description,
website - "Is that the right brand?" Re-match from a correction; propose a domain if `website` is empty; offer
candidates if several slugs match.

## Step 2 - Load the brand (reuse or build)

`node scripts/catalog_tool.mjs status <slug>`. **Fresh** (under 30 days, `list_labels` unchanged) - reuse it and
say so. **Missing or stale** - build **Tier 1** now (profile, labels and skeleton catalogs, website claims, the
product mapped to its label) and **Tier 2** in the background (`catalog-building.md`). Start the website with
`node scripts/harvest_site.mjs <site> --brand <slug> --images 8 --write` (Shopify products, prices, packshots,
colours, fonts in seconds), then read claims verbatim in the browser. The catalogs cover
**products, creators, Actor Type, Audio Type and filters** mapped to the brand's labels, plus brand guidelines and
usable assets from the website (`brand-assets.md`); skip any the brand has no label category for, and say so.
**Motifs** (once harvest and labels exist): `node scripts/brand_motifs.mjs --brand <slug> --write` reads the website,
packshots and library labels and drafts what the brand's animations are made of - its particle object, problem
object, product colours, claim icons, a visual per claim, footage actions to match-cut into. Confirm it against two
packshots and a sprite before the first animated plan (`animation-library.md` §1).
Then a five-line summary: products, live creators, actor/audio coverage, key dead labels, what's thin.

---

## Step 3 - Interview

Ask everything in **one message as a numbered list**. If they've already answered some of it, reflect back what
you took and ask only what's missing. Don't guess blocking answers (product, ratio, duration, ad type, voice
source); non-blocking gaps go at the end of the plan.

**A. Aspect ratio**
- **9:16 - 1080x1920** (TikTok, Reels, Shorts, Stories)
- **16:9 - 1920x1080** (YouTube, Facebook feed, CTV)

Say which way the hero footage leans; portrait UGC in 16:9 means `blurfill` or tiled layouts.

**B. Duration** - **15 seconds, 20 seconds, 25 seconds, or a custom length.** Recommend 20s if unsure.
**If they want more than 2 minutes, stop and ask for the exact duration** (and what should fill it); if they
named a number over 2 minutes, ask them to confirm it.

**C. What kind of ad?** Ask in these words:
> "What kind of ad would you like to create? (Example: Testimonial, Problem and Solution, Motion graphics, etc.)
> If you have a **reference video or script**, share it - it gives me a much better idea of the style you want."

**Then the six production questions:**

1. **Product name.** Resolve it against `products.json` and confirm it back with its Recharm label and coverage.
   Footage without a website page (or the reverse) needs confirmation that the product is current.
2. **Type of ad.** Show the list and invite a mix: Testimonial · Product Promotional · Problem -> Solution ·
   Comparison · Unboxing / First Impression · Before / After · Tutorial / How-To · Skeptic · Day-in-the-Life ·
   Founder Story · Urgent CTA · Motion Graphics (ask what it should explain) · VSL · Creator Mashup · Custom.
   "If you want a mix of these, tell me which parts and any extra detail - angle, audience, the claim to lead on."
   **Also ask: only Actor A-roll clips, only Actor B-roll clips, or no restriction?** - with the honest picture
   from `actor-types.json`. A laid-on voiceover rules out A-roll; "the voice from the clips" requires it. No Actor
   Type category? Ask in plain words (people talking to camera vs product and lifestyle shots).
3. **Creator preference - only if the ad uses UGC clips only.** Offer live creators from `creators.json`, grouped
   by what they have (faces camera and speaks / silent / hands only), with posters; the best eight if there are
   dozens. **No preference -> pick the most suitable clips** per beat, one creator per testimonial arc.
4. **Background music.** Their own track (ask them to upload it, and wait) or generated (ask them to describe the
   mood or emotion).
5. **Voiceover.** Their own recording (ask them to upload it), **the voice from the clips**, or **generated** -
   ask gender, accent, age, emotion/energy and pace; generated via the **ElevenLabs MCP**.
6. **Branding.** "Do you have brand guidelines or assets you want used - logo, colours, fonts?" **Push for them on
   a strictly motion-graphics ad.** None given -> use the website assets in the cache, and say so.

### Step 3b - Measure the reference

A reference outranks the default structures. If they give one, run `node scripts/analyze_reference.mjs <file>
--out ref/ --transcribe`, read `ref/shots.jpg`, and write the breakdown in `reference-analysis.md` (hook, structure,
pacing, voice, text style, transitions, slots). Match its rhythm and grammar with this brand's claims and footage,
and say what you took from it.

---

## The voice decides the footage

Settle this before searching - getting it wrong is a visible or audible defect, not a taste issue.

| The ad's voice | Filter every search with | Never pull | Clip audio |
|---|---|---|---|
| **Voiceover or VSL** (generated or uploaded) | `Actor Type: ["Actor B-roll", "No Actor"]` | A-roll; any clip where a mouth moves | **Mute** (`keepClipAudio: false`) |
| **Music only** (no VO) | anything | - | Mute; a short pre-levelled sting may J-cut a hook |
| **Voice from the clips** (testimonial) | `Creator` + `Audio Type: Voice` (+ `Actor Type: Actor A-roll`) | A second creator's voice in the same arc | Keep; jump cuts; **no VO on top** |
| **Mashup** | `Actor Type: ["Actor A-roll"]` + verified speaking creators | B-roll lines with no speech | Keep; **no additional voiceover** |
| **Mixed** A-roll + B-roll + No Actor | A-roll for the story, `Audio Type: Background Sound` cutaways | Cutaways with other voices | Keep A-roll audio; **J/L-cuts** on every change of material |

If a VO-led beat has only A-roll + Voice clips, or the library is tiny or all finished ads, follow `library.md`.
No `Actor Type` category -> omit the filter and check every pick for speech.

**Every ad opens on a hook and closes on the CTA.** Hook in the first line and first ~1.5s - a named pain, a
surprising result, a question, a number from the site; the visual hook is movement. Close on a real CTA - the URL,
"link below", or an offer the user confirmed - up-beat, ~6-8 words, its own beat; an end card on a no-VO ad.

---

## Step 4 - Pull the library (modelled on brief-creator)

Read `library.md` first. Then:

1. **`list_labels(slug)` once**; use only values it returns.
2. **Section the ad into ordered scenes** (~2-5s each, max 18): heading, 1-2 sentence description, role. If a
   reference was measured, size scenes to its median shot.
3. **2 queries per scene**: a literal visual phrase under ~8 words + 0-2 filter categories with 1-3 **live**
   values (`Product` or the variant category, the voice filter, one content category). A third only if both are
   weak. **Before searching, make sure the liveness check has covered every label you'll filter on** (the Tier 2
   check; `check_filters` can only flag dead labels that check has recorded). Validate:
   `node scripts/check_filters.mjs --brand <slug> --file filter.json`.
4. **Search in subagents, in parallel** (each call costs ~10-17k tokens - search is the biggest cost in the skill,
   so keep queries few). Each returns only a short pick list per
   scene: `clipSymbol`, `clipName`, `rawVideoPublicId`, `cosineDistance`, `durationMs`, labels, `downloadUrl`, query
   and filters - 1-3 best hits per query, deduped, **at most one clip per `rawVideoPublicId` per scene**.
5. **Narrow with posters, then measure and look at the shortlist**: `node scripts/clip_tag.mjs <urls>` (cuts
   inside clips, frozen/black stretches, motion energy, speech, usable windows, usability 1-5), then
   `get_clip_sprite_image` for clips that reach the plan - burned-in text, mouths under VO, the right product,
   competitor branding, subject position. Score the four sprite checks in `library.md`. If `motifs.json` isn't
   confirmed yet, these sprites are where you check its props (what the product looks like in use).
6. **Coverage**: ~1.5x the runtime in usable seconds from distinct shoots. A weak scene is a gap, said out loud.

Name clips by `clipName` (`<clipSymbol> - <sceneType>`) in anything the user reads.

## Step 5 - Script and scene plan, then stop

Write the script from `script-structures.md` (bent to the reference and notes), with timings from
`ad-formats.md`, applying the editing file for this format. For speech: transcribe the shortlist, set each
talking segment's in/out from the word timings so **every line finishes** (out = last word's end + 0.3-0.5s; a
jump cut only in a real pause, never inside or straight after a word), then generate the captions from word timings. For music-led ads, plan scene lengths as approximate - they are **snapped to the
beat in Step 6**, once the music exists (`beats.mjs`). Details in `render-and-deliver.md`. Then **stop and show the
user**:

- The full script, with **word count vs duration** (CTA included).
- Scene by scene: `clipName`, in/out, what's on screen, **the transition into it and why**, any `move`, J/L-cut,
  `fit`, and the caption text + `anim` + position.
- **For each supporting graphic, the job it does** - or cut it. **Every animated segment (scene, insert, overlay)
  names its visual** (`pour`, `chart`, `gauge`, `badges`, `packshot`...) and where it comes from - the claim's
  `claimVisuals` entry, the brand's prop or problem object, a packshot, a library action it match-cuts into. A
  segment whose only animation is text is not a plan (`animation-library.md`). **Let `mg_plan.mjs` choose them**
  from the beats - it varies the animations within the ad and against the brand's last ads; you review and adjust.
- Total runtime **after transitions**. **Every claim and number with its source.** Any compromise the library forced.
- What you took from the reference, if there was one.
- **Audio direction as a brief, not a restatement**: for generated music - genre, tempo (BPM), instruments, energy
  arc across the ad, where it lifts and drops, instrumental only; for a generated voice - the voice filters you'll
  search with (gender, age, accent, descriptives, use case) and the read (pace, energy, where the CTA lifts).
- **The review choice** - ask it in these words, alongside the approval:
  > "Do you want an independent review before delivery? A separate reviewer checks the finished ad against the
  > editing rules and I fix what it finds. It adds roughly **75k tokens per review** (up to 2 rounds, so up to
  > ~150k) and a few minutes. Without it, I check the ad against the QC checklist myself (no extra cost)."

  Default to **no** if they don't say. Record the answer in the prompt log.

Check the plan against `qc-checklist.md` (including Variety) first. Wait for approval; re-time after any change.

## Editing rules - summary

The full rules are in the format's editing file. The essentials:

1. **Testimonial / UGC** - jump cuts within a take; a match cut only where action, gesture or gaze genuinely lines
   up; no swipes, wipes or camera moves between talking-head clips; a graphic only to reinforce a spoken claim,
   cover a lull, or show the product as it's mentioned.
2. **Promo, Problem/Solution and custom** - swipes as the default join, direction chosen by meaning; harder and
   quicker in the problem half, slower and smoother in the solution half; the one match cut at the pivot; text and
   small graphics only where they do a job.
3. **Motion graphics** - **no animated segment is just text**: every scene and overlay draws something from the
   animation library, made of the brand's own motifs; transitions chosen per story beat; ease every animated
   property; text animated with intent and explaining the graphic, not replacing it.
4. **Voiceover or VSL** - only Actor B-roll / No Actor clips with no voice; mute any clip audio.
5. **Mashup** - Actor A-roll clips only, with no additional voiceover.
6. **Music sits 4 dB under the voice** (VO or the clips' dialogue) - the builder measures it; never set `music.gainDb`.
7. **J-cuts and L-cuts** on every change of material in a mixed A-roll / B-roll / No Actor ad, and in
   motion-graphics ads where useful.

**Captions** on every spoken line unless burned in, with the four text presets (fade+rise, fade+drop, scale-pop,
slide-in-sequence). **Assets** in the order in `brand-assets.md`: user and website, then native, then flagged stock.

## Step 6 - Audio, render, QC, deliver

Follow `render-and-deliver.md`:

1. **Audio** - VO (ElevenLabs, uploaded, or the clips'), music, sparing SFX, brand pronunciation.
2. **Beat-snap** music-led cuts once the music exists (`beats.mjs analyze` + `snap`, re-time captions), then
   **draft** (`build_ad.mjs edl.json --draft`) -> the user approves the cut -> **final** (cached clips re-used).
   Motion graphics and overlays via the Remotion template (`motion-graphics.md`); **`mg_check.mjs` must PASS
   before each Remotion render**, and `mg_check.mjs --record` after the final one.
3. **QC** - look at the contact sheet; **`gate.mjs` must PASS**; then, **only if the user chose the review**,
   the independent critic (`critic_pack.mjs` + a subagent, max 2 rounds, ~75k tokens each, `critic.md`).
   Otherwise review the sheet against `qc-checklist.md` yourself.
4. **Variants (if asked)** - A/B hooks with `variants.mjs`: only the opening changes, the body is reused from cache
   (~3s per extra draft). Vary the hook's mechanism, one variable per variant, and gate each final.
5. **Deliver** - send the MP4, call `save_brief` once, and summarise: runtime and ratio, the clips that carried it,
   branding source, claims and their pages, the review verdict (or "self-checked"), flagged stock, library gaps,
   one variant to test.

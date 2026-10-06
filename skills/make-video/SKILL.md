---
name: make-video
description: Build a finished ad MP4 for ANY brand in the user's Recharm library. Detects and confirms the brand, fetches its profile, labels, scene types, creators, products and clips via the Recharm MCP, harvests the brand website for guidelines and product images, and caches product, creator, actor-type, audio-type and filter catalogs mapped to Recharm labels. Interviews the user (9:16 1080x1920 or 16:9 1920x1080, 15/20/25s or custom, ad type, product, creator, music, voiceover, branding), scripts from ten hook structures, generates (ElevenLabs) or accepts VO and music, renders with ffmpeg or Remotion, and saves a Recharm brief. Covers Testimonial, Problem/Solution, Promo, Comparison, Unboxing, Before/After, Tutorial, Skeptic, Founder, Urgent CTA, motion graphics, VO/VSL and mashups. Use whenever the user wants to make, cut or re-cut an ad, UGC, Reel/TikTok or paid-social video from their Recharm library - even if they only say "make an ad" or name a product.
---

# Make Video

You produce a finished, ready-to-upload ad - a rendered `.mp4` the user could post this afternoon - not
a plan. A Recharm brief is a by-product you also save so the picks stay reviewable and shareable. The
library method is modelled on Recharm's **brief-creator** (capture the prompt -> labels once -> section
-> literal queries + label filters -> dedupe -> `save_brief`), extended with looking at every pick,
because you are cutting a real ad.

**The skill is brand-agnostic.** Nothing about a brand ships in it. You detect the brand, confirm it with
the user, and build (or reuse) a per-brand cache at `~/.claude/make-video/brands/<slug>/`. Every
Recharm brand is a different company: never pull footage, claims or colours from a slug the user has not
confirmed.

## What ships with this skill

| Path | What it is | Read it |
|---|---|---|
| `references/brand-detection.md` | How to work out which brand the user means, match it to `list_brands`, and confirm | Step 1 |
| `references/catalog-building.md` | Fetching everything Recharm exposes and building the product / creator / actor / audio / filter catalogs | Step 2 |
| `references/brand-assets.md` | Harvesting guidelines, claims and product images from the website; asset-sourcing priority; claims discipline | Steps 2 and 6, any on-screen design |
| `references/library.md` | What labels can/can't do, dead labels, searching, screening, the talking-head reality | Before your first search |
| `references/script-structures.md` | The 10 hook structures with footage recipes per beat | Before writing the script |
| `references/ad-formats.md` | Routes, beat timings, aspect handling, durations | Before the scene plan |
| `references/motion-and-transitions.md` | Editing grammar in full: jump cuts, swipes, match cut, J/L-cuts, captions, graphics, easing | Before building any scene list |
| `references/audio.md` | Voice sources and the footage they allow, ElevenLabs VO/music, the -4 dB rule | Step 4 |
| `references/motion-graphics.md` | Remotion setup and composition patterns | Motion-graphics or mixed ads |
| `scripts/preflight.mjs` | Toolchain check (ffmpeg, Node, Video-Use, ghost-editor) | Step 0 |
| `scripts/catalog_tool.mjs` | Cache layout, label ingestion, catalog skeletons, dead labels, image downloads, freshness | Step 2 |
| `scripts/check_filters.mjs` | Validate a filter map against the brand's label snapshot before searching | Every search |
| `scripts/build_ad.mjs` (+ `edl.example.json`) | The ffmpeg renderer: normalise, transitions, J/L-cuts, captions, audio mix | Step 5 |
| `scripts/contact_sheet.mjs`, `set_music_level.mjs` | QC sheet; music level helper | Steps 5-6 |
| `assets/fonts/` | Poppins (OFL), the default caption face | - |

## The shape of the job

0. Capture the prompt; **preflight** the toolchain.
1. **Detect and confirm the brand.**
2. **Load the brand**: reuse the cache or build the catalogs and brand guidelines.
3. **Interview** - ratio, duration, ad type + reference, the six production questions.
4. **Pull the library** - labels, scenes, filtered searches, look at every pick.
5. **Script and scene plan - then stop** for approval.
6. **Audio**, **render**, **QC**, **deliver** and save the brief.

---

## Step 0 - Capture the prompt, then preflight

Order: capture the prompt, then start Step 1 (brand detection) straight away; run preflight alongside it or
right after the user confirms the brand. Preflight only gates the render, so never hold the brand question
back for it. Tool names in this skill are generic: the Recharm tools appear as `mcp__<id>__list_brands` etc.
and may be deferred (load them with ToolSearch). "Question tool" and `SendUserFile` are used only when the
session has them; otherwise ask in plain text and give the file path.

**Capture the prompt first**: note the user's verbatim opening message before doing anything and append
every later answer, correction and instruction verbatim. It becomes `save_brief`'s `prompt`. If they
attach a file (script, brief, reference), use the filename plus its full text.

One video at a time: if the request implies several ads, ask whether to run them in sequence or pick one.

```bash
node ~/.claude/skills/make-video/scripts/preflight.mjs        # add --deep once per machine to probe Video-Use
```

It checks ffmpeg/ffprobe (with `libx264`, `subtitles`, `xfade`, `zoompan`, `sidechaincompress`), Node, npx,
Video-Use and the companion **ghost-editor** skill, and lists the in-session connectors to confirm:
**Recharm MCP** (library), **ElevenLabs MCP** (voiceover, music) and **Remotion** (via npx, motion graphics).

**Preflight gates the render, not the interview.** Steps 1-5 run on MCP tools. If something is missing,
tell the user exactly what to install, and offer the reviewed plan now and the MP4 once installed:

- ffmpeg - `winget install Gyan.FFmpeg` (Windows) / `brew install ffmpeg` (macOS); a fresh shell is needed.
- Node 18+ - nodejs.org.
- **Video-Use** - nothing to install; `npx -y video-use@latest` resolves on demand. Use it when a sprite
  cannot settle a question (exactly when a mouth moves, when burned-in text clears).
- **Remotion** - `npx create-video@latest`; see `references/motion-graphics.md`.
- **ElevenLabs** - if the connector is not connected, ask the user to connect it in their claude.ai
  connector settings; until then VO options are their upload or the clips' own voice.
- **ghost-editor** (whisper transcription, face tracking, sfx kit) - companion skill:
  `git clone https://github.com/kurbaitaev/ghost-editor ~/.claude/skills/ghost-editor`, then follow its
  `docs/INSTALL.md` (`scripts/doctor.sh`; `pip install numpy opencv-python openai-whisper`; `python3
  scripts/library_restore.py`). On Windows the launcher is `py`, not `python3`/`pip`: use `py -m pip
  install ...`; `doctor.sh` probes `python3`, so on Windows it reports numpy/opencv/whisper as MISS even
  when `py -c "import numpy, cv2, whisper"` succeeds - trust the `py` check. Only clone it if the user has asked or approves; if it is already in `~/.claude/skills`,
  just run `doctor.sh`.

On Windows set a short `workDir` in the EDL (`"C:/adwork"`): working directories past 260 characters
surface as an ENOENT naming ffmpeg.

---

## Step 1 - Detect and confirm the brand

If a brand-specific ad-maker skill for this brand is installed (e.g. `ag1-ad-maker`, `bombas-ad-maker`), say
so in the confirmation message and let the user choose. If the user invoked `make-video` by name or
asked for the automatic build, use this skill; otherwise prefer the hand-built one.

Follow `references/brand-detection.md`: `whoami`, what the user said, the session's project, then
`list_brands` and a normalised match (watch for duplicate slugs and test/demo brands). Call
`get_brand_info(slug)` for `prettyName`, `description`, `vertical`, `website`.

**Always confirm before fetching anything else**, in one message: brand name, slug, one-line description,
website. "Is that the right brand?" If it is not, re-match from their correction. If `website` is empty,
ask for it. If several slugs plausibly match, ask with the candidates.

## Step 2 - Load the brand (reuse or build)

```bash
node ~/.claude/skills/make-video/scripts/catalog_tool.mjs status <slug>
```

- **Fresh cache** (under 30 days, `list_labels` unchanged) -> reuse; say so ("I already know this brand").
- **Missing or stale** -> build it, following `references/catalog-building.md` and
  `references/brand-assets.md`. In short:
  1. `get_brand_info` + `list_labels` -> save to JSON -> `catalog_tool.mjs info|labels`. This captures all
     scene types, tags, labels and filters, and writes skeleton **product, creator, actor-type,
     audio-type, scene-type, asset-type and filter catalogs** for each category the brand actually has.
  2. Sweep `search_clips_visually` per label (batches via subagents; each call returns ~8-10k tokens) to find
     dead and thin labels (`catalog_tool.mjs dead`),
     sample clips, group them by `rawVideoPublicId` (raw videos), and fetch posters.
  3. **Browse the brand's product catalog on its website**, save packshots, and map each product to its
     Recharm `Product` label (`products.json`).
  4. **Build the creator catalog** and map it to `Creator` labels (live / dead, setting, talks-to-camera
     verified, poster). Same for **Actor Type** and **Audio Type** catalogs, and the **Filters catalog**
     (every other category's role, dead/thin values and tags).
  5. **Browse the website for brand guidelines and usable assets**: palette, fonts, logos, tone, claims
     with source URLs, offers, disclaimers -> `brand.json`, `website-brand.json`, `images/website/`.
  Skip any catalog whose label category the brand does not have, and say which were skipped.

Tier-1 catalogs (profile, labels, website claims, product mapping) must exist before the interview; tiers
2-3 can finish in the background (`catalog-building.md` -> "Build tiers"). Give a five-line summary (products, live creators, actor/audio coverage, key dead labels, what the library
is thin on) - it frames what you can promise in the interview.

---

## Step 3 - Interview

Ask everything in **one message as a numbered list** so they can answer in one reply. If they have already
answered some of it, reflect back what you took and ask only what is missing. Do not guess blocking answers
(product, ratio, duration, ad type, voice source) - a wrong one means re-rendering. If only non-blocking
details remain (VO pace, a reference), go to the plan and list those at its end.

**A. Aspect ratio**
- **9:16 - 1080x1920** (TikTok, Reels, Shorts, Stories)
- **16:9 - 1920x1080** (YouTube, Facebook feed, CTV)

Say which way the hero footage for their ad leans (from the clip probe); a 16:9 request on portrait UGC
means `blurfill` or tiled layouts. Motion graphics build natively at either size.

**B. Duration** - **15 seconds, 20 seconds, 25 seconds, or a custom length.** Recommend 20s if unsure.
**If they want more than 2 minutes, stop and ask them for the exact duration** (and what should fill it)
rather than picking one; if they named a number over 2 minutes, ask them to confirm that exact runtime.
Words and scenes per duration are in `references/ad-formats.md`.

**C. What kind of ad?** Ask in these words:
> "What kind of ad would you like to create? (Example: Testimonial, Problem and Solution, Motion graphics,
> etc.) If you have a **reference video or script**, share it - it gives me a much better idea of the
> style you want."

A reference outranks the default structures: match its pacing, hook style, caption look and transition
grammar, and say what you took from it.

**Then the six production questions:**

1. **Product name.** Resolve it against `products.json` and confirm it back with its Recharm label and
   coverage. A product with footage but no website page (or the reverse) needs a confirmation that it is
   current before you build an ad on it.

2. **Type of ad** - show the list and invite a mix: Testimonial · Product Promotional · Problem -> Solution ·
   Comparison · Unboxing / First Impression · Before / After · Tutorial / How-To · Skeptic · Day-in-the-Life ·
   Founder Story · Urgent CTA · Motion Graphics (ask what it should explain) · VSL · Creator Mashup · Custom.
   "If you want a mix of these, tell me which parts and any extra detail - angle, audience, the claim to
   lead on."
   **Also ask: only Actor A-roll clips, only Actor B-roll clips, or no restriction?** - with the honest
   picture from `actor-types.json`. State the dependency once: a laid-on voiceover rules out A-roll; "the
   voice from the clips" requires it. If their answers collide, surface it. If the brand has no Actor
   Type category, ask in plain words (people talking to camera vs product/lifestyle shots).

3. **Creator preference - only if the ad uses UGC clips only.** Offer the live creators from
   `creators.json`, grouped by what they have (faces camera and speaks / faces camera silent / hands only),
   with posters from `images/creators/`; if there are dozens, offer the best eight and say there are more.
   **No preference -> pick the most suitable clips** for each beat, keeping one creator per testimonial arc.

4. **Background music.** Their own track, or generated?
   - Own -> ask them to upload it, and wait for the file.
   - Generated -> ask them to describe the mood or emotion (e.g. "light, playful, bright").

5. **Voiceover.** Three options:
   - **Their own recording** -> ask them to upload it; build the picture to fit the read.
   - **The voice from the clips** -> the creators' own speech (A-roll / verified speaking clips).
   - **Generated** -> ask gender, accent, age, emotion/energy and pace. Generated via the **ElevenLabs MCP**.

6. **Branding.** "Do you have brand guidelines or assets you want used - logo, colours, fonts?" Ask
   explicitly, and **push for them on a strictly motion-graphics ad**. If they give none, source from their
   website (already harvested into the cache) and say that is what you are using.

---

## The voice decides the footage

Settle this before searching - getting it wrong is a visible or audible defect, not a taste issue.

| The ad's voice | Filter every search with | Never pull | Clip audio |
|---|---|---|---|
| **Voiceover or VSL** (generated or uploaded) | `Actor Type: ["Actor B-roll", "No Actor"]` | A-roll; any clip where a mouth moves | **Mute** (`keepClipAudio: false`) |
| **Music-only** (no VO) | anything | - | Mute; a short pre-levelled sting may J-cut a hook |
| **Voice from the clips** (testimonial) | `Creator` + `Audio Type: Voice` (+ `Actor Type: Actor A-roll`) | a second creator's voice in the same arc | Keep; jump cuts; **no VO on top** |
| **Mashup** | `Actor Type: ["Actor A-roll"]` + verified speaking creators | B-roll lines with no speech | Keep; **no additional voiceover** |
| **Mixed** A-roll + B-roll + No Actor | A-roll for the story, `Audio Type: Background Sound` cutaways | cutaways with other voices | Keep A-roll audio; **J/L-cuts** on every change of material |

If a VO-led beat has only A-roll + Voice clips, follow `library.md` -> "When the voice rule empties a beat".
If the library is tiny or all finished ads, follow "Small or unusable libraries" there.
If `ActorType` is absent from the brand's labels, omit the filter and sprite-check every pick for speech.
Labels are the first line, not the last: some `No Actor` clips have narration and some `Actor B-roll`
creators talk, so sprite-check every pick and keep `keepClipAudio: false` on every VO cut.

## Every ad opens on a hook and closes on the CTA

**Hook in the first line and first ~1.5s** - a named pain, a surprising result, a question, a number from
the site. The visual hook is movement. **Close on a real CTA** - the brand's URL, "link below", or an offer
the user confirmed - delivered up-beat (brief the VO for it), ~6-8 words, its own beat. On a no-VO ad, an
animated end card with the logo.

---

## Step 4 - Pull the library (modelled on brief-creator)

Read `references/library.md` first. Then:

1. **`list_labels(slug)` once** and keep it; only use values it returns; compare with `labels.json`.
2. **Section the ad into ordered scenes** (~2-5s each, max 18): heading, 1-2 sentence on-screen description,
   narrative role. If the user gave a breakdown, use it.
3. **Per scene, 2-4 queries**: a literal visual phrase under ~8 words plus 0-2 filter categories with 1-3
   **live** values - `Product` on product shots, the voice filter above, one content category. Never filter
   on a dead or "(do not use)" label.
4. **Validate** each map before concluding footage is missing:
   `node scripts/check_filters.mjs --brand <slug> --file filter.json`.
5. **Search**: `search_clips_visually`, once per query, first page. Take the 1-3 lowest `cosineDistance`
   hits per query, aim for 3-5 candidates per scene, dedupe by `clipSymbol`, **max one clip per
   `rawVideoPublicId` per scene**. Record each pick's query and filters. Thin or empty? Drop a category,
   then try unfiltered, then a synonym - only then call it a gap.
6. **Look before the plan exists**: `get_clip_sprite_image` on every clip that reaches the plan. Check
   burned-in text, mouth movement under VO, the right product/variant, readable competitor branding, subject
   position for crops, dead frames. Probe orientation and audio with ffprobe (rotation flag!).
7. **Coverage**: count distinct shoots and usable seconds - want ~1.5x the runtime. A weak scene is a gap
   (motion-graphic beat, website image, or custom shoot), said out loud, not padded.

Hits carry `downloadUrl` (the clip) and `rawVideoDownloadUrl` (the full source, for handles) - feed either
into the EDL. In anything the user reads, name a clip by its `clipName` (`<clipSymbol> - <sceneType>`;
just the symbol if there is no scene type); the EDL and `save_brief` take `clipSymbol`.

## Step 5 - Script and scene plan, then stop

Write the script from the matching structure in `references/script-structures.md`, bent to their reference
and notes. For a testimonial or mashup, **transcribe the candidate clips** (ElevenLabs
`creative_transcribe_audio`, or ghost-editor's whisper) and build from real lines. Then **stop and show the
user before rendering**:

- The full script with **word count vs duration** (CTA included).
- Scene by scene: `clipName`, in/out, what is on screen, **the transition into it and why that one**, any
  `move`, any J/L-cut and its length, `fit` (+ `anchorX` for landscape-in-9:16), and the caption text +
  `anim` + `band` placed to clear faces and the product, out of the top 8% / bottom 12% UI zones. Hook
  captions snap in (<300ms, `pop`).
- **For each supporting graphic, the job it does** - or cut it.
- Total runtime **after transitions** (output = sum of clips - sum of transitions).
- **Every claim and number, and its source** (the site page, or the user). Anything else is out.
- Any compromise the library forced (thin labels, 16:9 blurfill, a VO-read testimonial, a skipped catalog).

Wait for approval; re-time after any script change.

## Editing rules

Full detail, vocabulary and timings are in `references/motion-and-transitions.md`. Apply by format.

**1. Testimonial / UGC.** Jump cuts are the grammar: trim pauses, fillers and restarts within a single take;
they read as authentic - a transition-heavy testimonial reads scripted or corporate and undercuts trust.
Use a **match cut** only between two different takes where an action, gesture or gaze direction genuinely
lines up; if none exists, a clean jump cut or hard cut is more honest than an invented match. Keep
transitions invisible relative to the talent - no swipes, wipes or camera-move transitions between
talking-head clips; those belong on product/demo cutaways. **Captions** on every spoken line by default
(most viewing is muted): short bursts synced to speech, not a fade-up before the words; fade+rise in, quick
fade or cut out, no more than 4-5 words visible; **skip them if the clip has captions burned in**. Add a
supporting graphic only to reinforce a specific claim (stat callout, before/after, price), to cut away from a
lull or stumble without a jarring jump, or to show the product at the moment it is mentioned; otherwise leave
clean talking head - an over-decorated testimonial reads as an ad pretending to be UGC.

**2. Product Promotional, Problem/Solution and other custom types.** Swipe transitions (directional wipes,
pushes) are the default connective tissue; vary direction with meaning (left-to-right for before -> after and
sequential steps, not one direction regardless). **Problem half**: harder, quicker cuts and swipes
(0.2-0.3s) - friction. **Solution half**: slower, smoother swipes or simulated camera moves (0.45-0.55s,
`pushin`, `glide*`) - relief. **Spend the match cut on the problem -> solution pivot only** (if the pivot is
graphic -> footage, or the footage has no matching move, use a clean hard cut or graphic wipe rather than a
forced match). Text animation
only to name the problem in the viewer's words as it is shown, label the solution the instant it appears, or
reinforce a stat/price/claim: fade+rise standard, scale-pop for one keyword, slide-in-sequence for listed
benefits; no text before the beat it refers to. Small graphics (icons, arrows, comparison bars, highlight
circles) only where footage cannot show it. Captions unless burned in.

**3. Motion graphics.** The animated on-screen text is the caption layer; add separate captions only for VO
words no graphic carries. Transitions chosen per story beat, not one effect repeated: match cuts when a
shape/motion continues, whip pans or swipe wipes for a fast beat change, simulated camera moves (push-in,
pull-back, parallax drift) within a scene. Never a bare hard cut unless it lands on a beat or sound hit.
**Ease every animated property**: ease-out entering, ease-in exiting, spring physics for tactile elements
(buttons, callouts, product reveals); linear only for ambient loops. Text with intent: fade+rise standard,
fade+drop only for dismissal, scale-pop for one keyword, slide-in-sequence for ordered lists; hook text snaps
in <300ms, supporting text eases slightly slower. **Every scene needs at least one non-product graphic**
(icons, stat callouts, comparison bars, backgrounds, texture/lighting, particles, light leaks, gradients).

**4. Voiceover or VSL**: only Actor B-roll / No Actor clips (no voice); if a clip has audio, mute it.
**5. Mashup**: Actor A-roll clips, no additional voiceover.
**6. Music sits 4 dB under the voice** - the VO or the clips' native dialogue. The builder measures both
(EBU R128) and places the bed at `offsetDb: -4`; **do not set `music.gainDb`**, which disables that. Check
the measured-levels line it prints.
**7. J-cuts and L-cuts** (`audioLead`: next clip's audio before its picture; `audioTail`: current audio over
the next picture) on every change of material in an ad mixing A-roll, B-roll and No Actor, and in
motion-graphics ads wherever useful: 0.4-1.2s, landed on speech boundaries, never across a testimonial jump cut.

## Asset sourcing priority

1. Assets the user provided or already on the brand website (`images/website/`, `images/products/`, the
   library footage).
2. Assets generated natively in the composition - icons, shapes, backgrounds, bars, simple illustrations.
3. Web stock only when 1 and 2 cannot cover it, only from sources licensable for commercial ad use - **flag
   each one** in the delivery so it can be swapped before the final render.
Never fabricate a source or use an asset whose clearance you have not confirmed. Never generate the logo,
packaging, or the brand's product and customers.

---

## Step 6 - Audio, render, QC, deliver

**Audio** (`references/audio.md`). Generated VO: ElevenLabs MCP (`creative_list_voices`,
`creative_generate_speech`; load with ToolSearch); filter by gender/accent/descriptives/use cases; never
invent a voice ID; say which voice you chose and why; download the take, measure with ffprobe and re-time the
plan to the real read; write URLs and numbers as spoken. Uploaded VO: use as is; build picture to it. Clip
voice: `keepClipAudio: true`, cut on sentence boundaries. Music: the user's file, or ElevenLabs
`creative_generate_in_flow` with `node_type: "music"`, `model_id: "eleven_music_v2"`, from their mood words +
duration, instrumental; if unavailable, say so rather than shipping a silent bed. Mix is loudness-normalised
to -14 LUFS; music ducks under speech and rests 4 dB below it.

**Render.** Footage and mixed: `node scripts/build_ad.mjs edl.json` (schema and a shape example in
`scripts/edl.example.json` - its clips belong to another brand, never reuse them). Set `"aspect": "9:16"` or
`"16:9"`; `captionStyle.font`/colours and `fontsDir` from the brand's `brand.json` and `fonts/`. The builder
caches downloads, reads each clip's rotation, normalises to the output size at 30fps, applies `fit` (`cover` /
`contain` / `blurfill`), `anchorX`/`anchorY` and `move`, joins with hard cuts or xfade transitions, applies
`audioLead`/`audioTail`, mixes with the -4 dB rule, burns animated captions, and prints the real output
timeline - time captions against it. Do not hand-roll ffmpeg. Motion graphics: Remotion per
`references/motion-graphics.md` at 1080x1920 or 1920x1080, 30fps; deliver directly or render silent and feed it
into `build_ad.mjs` as a `file` segment so VO and music span the ad.

**QC** - look at the render yourself:
```bash
node scripts/contact_sheet.mjs out/ad.mp4 out/qc.jpg
ffprobe -v error -show_entries format=duration -show_entries stream=codec_name,width,height,r_frame_rate -of default=nw=1 out/ad.mp4
```
Resolution matches the ratio; duration within 0.5s of target; every beat shows its subject; captions legible,
clear of faces, product and platform UI; no burned-in text colliding with yours; no claims that are not on the
site; the last beat carries the CTA. On a VO cut, listen to the first seconds - a creator's voice under the VO
means `keepClipAudio` was on. Fix and re-render rather than delivering with an apology.

**Deliver.** Send the MP4 (`SendUserFile` if available). Then call `save_brief` **once**, after the cut is final:

```
save_brief("<slug>", {
  version: "v2",
  title: "<product> · <format> · <ratio> · <duration>",
  prompt: "<user's verbatim opening message + every later answer/instruction, verbatim>",
  scenes: [ { name, description, clips: [ { clipSymbol, searchString, filters } ] } ]   // clips: [] = gap
})
```

Surface the URL, then a few lines: runtime and ratio, which clips carried it (by `clipName`), branding source
(website / user), claims used and their pages, any flagged stock, what the library could not cover (shots
worth shooting next), and one variant worth testing.

---

## Things that go wrong

- Guessing the brand, or using a slug the user did not confirm; mixing in clips or claims from another brand.
- Filtering on a label you have not tested, or on a dead or "(do not use)" label, and concluding the footage
  does not exist - dead-ness is per brand (`Hook`/`CTA`/`Problem` are live in some libraries, dead in others); stacking 3+ filter categories; trusting an empty label list as "no labels".
- A VO over a creator who is visibly talking; `keepClipAudio: true` on a VO cut.
- Promising a testimonial or mashup before verifying the creator speaks on the clips; two voices in one
  testimonial arc; a creator presented as the founder, staff or an expert.
- The wrong product or variant on screen; a product without a live website page advertised as current.
- Claims not on the site; invented review counts; expired offers from old promo clips; regulated claims
  without the site's disclaimer.
- Our captions on a clip with burned-in text; screenshots used as b-roll.
- Readable competitor packaging held on screen, or a competitor named without the user's say-so.
- A portrait UGC clip `cover`-cropped into 16:9; trusting plain ffprobe width/height (rotation flag).
- Two clips from one shoot as separate beats.
- Swipes/moves between talking-head clips; forced match cuts; the match cut spent before the pivot;
  identical pacing in both Problem/Solution halves; one swipe direction regardless of meaning.
- Text before its visual beat; static captions; more than one scale-pop keyword.
- `music.gainDb` set (kills the -4 dB rule); a script overrunning the picture; transitions forgotten in the
  runtime maths; a runtime over 2 minutes chosen silently.
- A retyped or generated logo; an unlicensed or unflagged stock asset; a stale cache trusted over a live
  `list_labels`.

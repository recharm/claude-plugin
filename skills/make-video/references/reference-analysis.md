# Matching a reference video

The interview asks for a reference video or script because "make it like this" is the clearest brief a user can
give - and the reference outranks the default structures. This file turns a reference into numbers and a plan.
Adapted from the output contract in sharon-laicc/viral-video-decomposer and the measurements in
edenfunf/reelmimic (both MIT); the extraction is our own `scripts/analyze_reference.mjs`.

## 1. Get the file

A file the user uploads, a clip from the library (`downloadUrl`), or a direct `.mp4` link. Social links (TikTok,
Instagram, YouTube pages) are not video files - ask for the file itself; don't download through third-party tools.

## 2. Measure it

First settle the **match mode** (the interview asks it with the reference - see `SKILL.md` Step 3 C):

- **Structure and pacing** (default): keep its hook mechanism, shot jobs, rhythm and text style; find footage by
  describing each shot in words.
- **Shot for shot**: also match each shot's *look* - framing, angle, subject, setting - by searching the library
  with the reference's own frames (section 5). Choose this when the user says "remake this", "same shots", "copy
  this ad with our footage", or the reference is **their own ad** they want refreshed with new footage.

```bash
node scripts/analyze_reference.mjs <file-or-url> --out ref/ --transcribe                   # structure and pacing
node scripts/analyze_reference.mjs <file-or-url> --out ref/ --transcribe --search-frames   # shot for shot
```

`--search-frames` also writes `ref/search/`: a ~512px query image per shot (`shot_NN.jpg` + `shot_NN.b64`), a
second at 80% of every shot of 2s or more (`shot_NN_late.*` - catches a reveal or a move), and `frames.json`
listing each one with its shot, time and size.

Read the printout and **look at `ref/shots.jpg`** (one frame per shot, numbered with its length). Scene detection
misses soft dissolves and splits zooms and flashes into extra shots - correct the count by eye, and rerun with
`--threshold 0.2` (finds more) or `0.45` (finds fewer) if it is far off.

## 3. Write the breakdown (show it in the plan)

| Field | From |
|---|---|
| Format | `format` - ratio, length |
| Hook | first 1-3 shots + the transcript's first line: what the viewer sees and hears in the first 1.5s, and *why* it stops the scroll (question, claim, odd visual, problem shown) |
| Structure | each shot's job in order (hook / problem / product / proof / CTA) - map it onto the closest of the 10 structures in `script-structures.md`, and say where it differs |
| Pacing | `rhythm` - median shot length, cuts per 10s, first cut time, speeds up / steady / slows |
| Voice | VO, creator to camera, or music only; words per second; when the first word lands |
| Text | from the sheet - caption style (pill, outline, karaoke), position, how many words at once, colour |
| Transitions | from the sheet and a watch - hard cuts, swipes, zooms, match cuts |
| Footage mix | talking head vs b-roll vs product vs graphics, by shot |
| Slots | what is *variable* (product, claim, creator, flavour) vs the *pattern* to keep |

## 4. Use it

- **Match the rhythm**: plan scene lengths around the reference's median shot (±30%) and its cuts per 10s; land
  the first cut where it does. A 1.7s-median reference cut at 3s shots will feel slow even with the same script.
- **Match the hook mechanism**, not its words - and only with claims this brand can make (`website-brand.json`).
- **Match the text style** with the closest preset and `captionStyle` (pill vs outline), using the brand's colours.
- **Search for the shots it needs**: turn each reference shot into a literal query ("hand opening a purple box",
  "macro of cereal pieces") for Step 4. In shot-for-shot mode, search with the shot's frame first (section 5)
  and keep the literal query as the backup.
- **Say what you took** in the plan: "Reference: 9 shots, 1.7s median, unboxing hook with a question in a pill -
  matching all three; swapping its flavour claim for the site's 12-14g protein."

Never copy a competitor's ad wholesale: take structure, pacing and grammar, not their footage, script or brand.
Image search only ever returns **this brand's own** clips, so matching a competitor's frames is within that rule -
it finds your footage that frames a shot the same way; their script, claims and branding still stay out.

## 5. Shot for shot: search with the reference's frames

Uses Recharm's `search_video_library_by_image` - the shot-level rules (score bands, filters, payload size, raw
video hits) are in `library.md` section 2b; this is the reference workflow.

1. **Merge before searching.** Scene detection splits flashes and zooms into extra shots; map the reference shots
   onto the ad's scenes first (max 18) and search **one frame per scene** - the `mid` frame, plus the `late` frame
   only where the shot changes inside (a reveal, a pour, a move). Skip pure graphics, end cards and text slates:
   those become animated scenes, not footage.
2. **Search in subagents, in parallel** (brief template in `library.md` 2b), with the same voice filters as the
   text searches - a VO-led ad still needs `Actor Type: ["Actor B-roll", "No Actor"]`.
3. **Read the bands per shot:**
   - **0.85+ - same shot.** For a competitor's or stock reference this means the library holds that very footage -
     fine to use. For a **refresh of the user's own ad** it is the clip they already ran: exclude it, and every hit
     from the same `rawVideoPublicId`, so the new version is genuinely new footage.
   - **0.75-0.85 - strong stand-in.** Same composition from a different shoot. The default pick.
   - **0.65-0.75 - loose.** Keep only if the sprite check passes and the shot's *job* is met (the product is the
     right one, the action reads at phone size). Otherwise run the literal text query for that shot.
   - **No hits** (the tool drops everything under 0.65) and no text-query fallback either - a **gap**: say it, and
     fill it with a motion-graphic beat or a website image, or list it as a shot to film.
4. **Never pick on similarity alone.** Similarity measures look, not meaning: a frame with a big burned-in caption
   can match clips that also carry text, and a lookalike may show a competitor's pack. Every pick still goes
   through `clip_tag.mjs` and the sprite checks in `library.md` section 3.
5. **Show the match.** Write `ref/matches.json` - one row per scene: `shot`, `ref` (its frame), `clip` (the pick's
   `posterUrl`, or `null` for a gap), `clipName`, `similarity` - and render
   `node scripts/contact_sheet.mjs --match ref/matches.json ref/matches.jpg`. Show `matches.jpg` in the Step 5
   plan, with the counts (`7 strong, 2 loose, 1 gap`), and record each scene's frame and similarity in the
   `save_brief` notes.
6. **Timing still comes from the reference**: in/out points follow its shot lengths (section 4), within the
   pick's usable window from `clip_tag`.

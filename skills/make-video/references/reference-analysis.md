# Matching a reference video

The interview asks for a reference video or script because "make it like this" is the clearest brief a user can
give - and the reference outranks the default structures. This file turns a reference into numbers and a plan.
Adapted from the output contract in sharon-laicc/viral-video-decomposer and the measurements in
edenfunf/reelmimic (both MIT); the extraction is our own `scripts/analyze_reference.mjs`.

## 1. Get the file

A file the user uploads, a clip from the library (`downloadUrl`), or a direct `.mp4` link. Social links (TikTok,
Instagram, YouTube pages) are not video files - ask for the file itself; don't download through third-party tools.

## 2. Measure it

```bash
node scripts/analyze_reference.mjs <file-or-url> --out ref/ --transcribe
```

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
  "macro of cereal pieces") for Step 4.
- **Say what you took** in the plan: "Reference: 9 shots, 1.7s median, unboxing hook with a question in a pill -
  matching all three; swapping its flavour claim for the site's 12-14g protein."

Never copy a competitor's ad wholesale: take structure, pacing and grammar, not their footage, script or brand.

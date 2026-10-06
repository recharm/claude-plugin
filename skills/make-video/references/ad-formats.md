# Ad formats: routes, timings, aspect handling

Writing patterns are in `script-structures.md`; the editing grammar is in `motion-and-transitions.md`;
library facts in `library.md`. What a given brand's library can actually carry comes from its cache
(`actor-types.json`, `creators.json`, `scene-types.json`): check coverage before promising a format.

## Format -> route -> footage

| Format | Route | Voice / footage |
|---|---|---|
| Product Promotional | ffmpeg | VO over B-roll / No Actor, muted; or music-led |
| Problem -> Solution | ffmpeg (+ a graphic beat) | VO, muted |
| Comparison | ffmpeg + comparison bars | VO, muted |
| Before / After | ffmpeg + labels | VO, muted |
| Tutorial / How-To | ffmpeg | VO, muted |
| Unboxing / First Impression | ffmpeg | VO, or a creator's own verified voice |
| Day-in-the-Life | ffmpeg | VO, muted |
| Skeptic | ffmpeg | VO, muted |
| Urgent CTA | ffmpeg / Remotion end card | VO; real, live offer only |
| Motion Graphics (any subject) | Remotion | Generated VO or music-led |
| VSL (long VO-led) | ffmpeg (+ Remotion beats) | Actor B-roll / No Actor only, muted |
| Testimonial | ffmpeg | Clip voice, jump cuts; verified speech needed |
| Creator Mashup | ffmpeg | Actor A-roll only, no VO |
| Founder Story | ffmpeg + Remotion | The user's real story and footage |

If the library cannot carry a format, say so plainly and offer the nearest one you can build fully -
do not quietly build a worse version.

## Aspect ratio

Libraries are mixed: UGC is mostly portrait, pro and podcast shoots skew landscape. Pick clips native to
the chosen ratio first (check each pick's real display size, rotation flag included), and tell the user
up front which way the hero footage leans.

- **9:16 (1080x1920)** - native for UGC. Landscape clips: `cover` + `anchorX` on a single subject (check
  it stays in the crop from in to out), `blurfill` when the whole frame matters, or a `glideleft/right` pan.
- **16:9 (1920x1080)** - native for pro footage. Portrait UGC needs `blurfill` (sharp clip over a blurred
  fill) or a Remotion layout tiling two portrait clips (good for comparisons). Never `cover`-crop portrait
  into 16:9: it keeps a thin slice. Say this up front when the user picks 16:9 for a UGC-led ad.
- Motion graphics are built natively at either size.

## Duration

~2.6 words/s including the CTA. Transitions shorten runtime: output = sum of clips - sum of transitions;
plan in output time.

| Duration | Words | Scenes | Suits |
|---|---|---|---|
| 15s | ~39 | 4-5 | One product, one claim, a hook test |
| 20s | ~52 | 5-7 | A full Problem->Solution or Before/After arc; default recommendation |
| 25s | ~65 | 6-8 | Comparison, Tutorial, Day-in-the-Life with room to breathe |
| Custom | ~2.6 x seconds | ~1 per 3-4s | |
| 30s | ~65-70 incl. CTA | 6-7 | Motion-graphics explainer: leave 2-3s of air for transitions and the end card; measure the real VO take and trim |
| 30-60s | ~2.3 x seconds | ~1 per 4s | VSL or motion-graphics explainer |
| 60-120s | | | VSL in 2-3 self-contained sections; watch for repeating shoots |
| **>120s** | | | **Stop and ask the user for the exact duration** and what fills it |

Never pad, and never repeat a shot to fill time.

## Beat timings (adapt to the brand's footage)

**Product Promotional, 15s**: visual hook 0-2.5s (hard cut in, hook text `pop` <300ms) -> what it is
2.5-6.5s (product shot, swipe L->R) -> the claim 6.5-11s (one benefit shown, smooth swipe + `pushin`) ->
CTA 11-15s (end card / logo + URL).

**Problem -> Solution, 20s**: hook names the problem 0-3s (hard cut, text names the pain as it is shown) ->
agitation 3-7s (quick swipes 0.2-0.3s) -> **pivot ~7s, the one match cut** (same framing/action across
the cut) -> solution + proof 7-16s (`smooth*` 0.45-0.55s, `pushin`/`glide`) -> CTA 16-20s.

**Comparison, 20-25s**: hook -> one beat per alternative, 2-3s each, hard quick cuts -> winner beat with
a smooth join (a test or demo) -> CTA.

**Before / After, 20s**: after first -> before -> bridge (product in use) -> after (measurable) -> CTA.
L->R swipes for before -> after; visible BEFORE / AFTER labels.

**Tutorial, 20-25s**: hook promising the outcome -> step 1 -> step 2 -> step 3 or the result -> CTA.
Rightward swipes; slide-in-sequence step labels.

**Testimonial, 15-25s**: one creator. Hook line (their strongest sentence, not their first) -> story ->
cutaways where they mention the product (L-cut off them, J-cut back) -> their CTA or an end card. Jump
cuts only between their takes.

**Motion graphics**: hook text snaps in <300ms; one idea per scene, 2.5-4s; every scene has a
non-product graphic; transitions per beat; end card with logo and URL. See `motion-graphics.md`.

**Mixed footage + graphics**: right for explainers, comparisons with numbers, anything footage cannot
show. Render Remotion segments silent and pass them to `build_ad.mjs` as `file` segments so VO and music
span the whole ad.

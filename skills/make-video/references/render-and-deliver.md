# Captions, audio, render, QC and delivery

The detail behind Steps 5-6 of `SKILL.md`. Read the section you're on.

## Transcripts and captions (Step 5)

For a testimonial or mashup, **transcribe only the shortlisted clips** and build from real lines - the word
timings drive the cuts and the captions:

```bash
node scripts/transcribe.mjs clips/<A>.mp4 clips/<B>.mp4 --out transcripts.json
```

Local Whisper (free, offline, word timestamps; the first run downloads the ~140 MB `base` model). Without it, use
ElevenLabs `creative_transcribe_audio`. Times are in source seconds.

**Set talking segments by hand from the word timings** - no automatic trimming. For each line you keep:

- `in` = the first word's `start` - 0.15s (don't clip the first consonant).
- `out` = the last word's `end` + **0.3-0.5s**, so the line, its breath and its tail finish. Whisper's word ends
  run early, so never set `out` at a word's `end`.
- A jump cut only inside a genuine pause (a gap of 0.4s+ between words), cutting in the **middle** of the gap -
  never inside a word or right at the end of one.
- If the take is too long, drop a whole sentence, not the ends of words.

After the draft render, play every cut on a speech segment and listen to the last word of each line. A word that
stops abruptly means widen that `out`.

**Captions come from the word timings, not by hand.** Once the segments are set:

```bash
node scripts/captions_from_words.mjs --edl edl.json --words transcripts.json --punch "<the main claim>" --fix "heard=Correct" --write
```

3-5-word bursts on the output timeline, never across a cut or a sentence, the hook snapping in and `punch` on
the main claim. Read the printout: fix misheard brand words with `--fix`, and set `--y` (or `--band`) from the
sprite so captions clear faces and the product. For a generated voiceover, use the ElevenLabs word timestamps the
same way (key them by the segment they play over).

## Audio (Step 6, `audio.md` for depth)

- **Generated VO**: ElevenLabs MCP (`creative_list_voices`, `creative_generate_speech`; load with ToolSearch).
  Never invent a voice ID; say which voice you chose and why; pick it while the clip searches run. Apply
  `brand.json -> pronunciation` to the text sent (captions keep the real spelling). Download the take, measure it
  with ffprobe and re-time the plan to the real read.
- **Uploaded VO**: use as is; build the picture to it. **Clip voice**: `keepClipAudio: true`, cut on sentence
  boundaries.
- **Music**: the user's file, or ElevenLabs `creative_generate_in_flow` (`node_type: "music"`), instrumental, from
  their mood words + duration. If unavailable, say so rather than shipping a silent bed. Never set
  `music.gainDb` - the builder places the bed 4 dB under the voice by measurement.
- **Sound effects**: only where a cut or graphic earns one - a whoosh under a swipe, a pop on the scale-pop
  keyword, a riser into the pivot, a chime on the CTA; never on testimonial jump cuts. Bundled CC0 set first
  (`audio.sfx: [{ "name": "whoosh-soft", "at": 4.6 }]`, default -6 dB).

## Cutting on the music (Step 6, once the music exists - before the draft)

For promo, problem/solution, motion-graphics and music-only cuts (not testimonials - they cut on sentences - and not
VO-led cuts, where the lines decide the cuts):

```bash
node scripts/beats.mjs analyze bed.mp3 --out audiomap.json
node scripts/beats.mjs snap --edl edl.json --map audiomap.json --write          # footage cuts
node scripts/beats.mjs snap --scenes ads/<name>.json --map audiomap.json --write  # Remotion scene lengths
```

It reports tempo and whether the track is rhythmic; each cut moves to the nearest beat (a downbeat when close) within
0.35s by trimming or extending the outgoing clip. Non-rhythmic beds aren't snapped - it lists the energy shifts so
section changes can sit on them. Re-time captions afterwards and re-check the length.

## Render (Step 6)

**Draft first.** `node scripts/build_ad.mjs edl.json --draft` renders half size with a fast encode and the same
timeline, captions and mix (saved with a `-draft` suffix). Show it to the user; then render the final without
`--draft`. Normalised clips are cached under `cacheDir/segments`, so the final and re-renders only re-encode what
changed.

- **Footage and mixed ads**: schema in `scripts/edl.example.json` (placeholders only). Set `"aspect"`; take
  `captionStyle` and `fontsDir` from `brand.json` and the cache's `fonts/`. Don't hand-roll ffmpeg. On Windows
  use a short `workDir` (`C:/adwork`).
- **Motion graphics**: `motion-graphics.md` - `mg_init.mjs`, a scene list where every scene carries a visual
  (`animation-library.md`), **`mg_check.mjs` PASS**, a half-scale preview checked one frame per scene, then a
  silent Remotion render fed to `build_ad.mjs` as a `file` segment so VO, music, captions and the gate span the
  whole ad. Text that already carries every VO line inside the graphics can stand in for captions - say so.
  After the final render: `mg_check.mjs <ad>.json --record`, so the brand's next ad varies its animations.
- **Graphics over footage**: the template's transparent `Overlay` (each item with an `icon` or a `visual`),
  added as `"overlays": [{"file", "at"}]`.

## QC (Step 6)

```bash
node scripts/contact_sheet.mjs out/ad.mp4 out/qc.jpg
node scripts/gate.mjs out/ad.mp4 --edl edl.json --brand <slug>
```

Look at the sheet. **The gate must PASS before anything is sent**: it blocks on the wrong size, frame rate or
length, loudness more than 2 LU off -14 LUFS, a true peak above -1 dBTP, a missing audio track, `music.gainDb`,
captions past the end, a `-draft` file, and any number on screen that isn't in the website claims or the EDL's
`approvedClaims` (add the user's own figures there). It warns on silences, 6+ word captions, extra `punch`es and
risky words. On a VO cut, listen to the first seconds - a creator's voice under the VO means `keepClipAudio` was on.

**Then, only if the user chose it, the independent critic** (`critic.md`, ~75k tokens per round):
`node scripts/critic_pack.mjs out/ad.mp4 --edl edl.json --brand <slug>` and a separate subagent with the critic
prompt. SHIP -> deliver. FIX -> apply blockers and fixes, re-render, re-gate, one more round at most; then deliver
with any remaining issues listed. If they declined, review the sheet against `qc-checklist.md` yourself.

## A/B hook variants

When the user wants variants to test, swap only the opening:

```bash
node scripts/variants.mjs --edl edl.json --variants variants.json --draft     # then without --draft, with --gate
```

`variants.json` lists each variant's hook segments and hook captions (shape in the script header); later captions,
effects and overlays shift by the change in hook length, and the body comes from the segment cache (~2.5s per
draft in testing). **Vary the mechanism, not the wording** - question vs result vs problem shown vs bold claim vs
reaction - one variable per variant, so the winner tells you something. It warns on variants that open on the same
clip, the same words or the same mechanism, and on length changes; gate every final.

## Deliver

Send the MP4. Then call `save_brief` **once**, after the cut is final:

```
save_brief("<slug>", {
  version: "v2",
  title: "<product> · <format> · <ratio> · <duration>",
  prompt: "<user's verbatim opening message + every later answer/instruction, verbatim>",
  scenes: [ { name, description, clips: [ { clipSymbol, searchString, filters } ] } ]   // clips: [] = gap
})
```

Share the URL (it is a public share link), then a few lines: runtime and ratio, which clips carried it (by
`clipName`), the branding source, claims used and their pages, the critic's verdict, any flagged stock, what the
library couldn't cover (shots worth shooting next), and one variant worth testing.

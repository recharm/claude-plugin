# Voiceover and music

Audio is what makes a cut feel produced. A well-shot ad with a badly levelled VO reads as
amateur; ordinary footage with a clean read and a bed underneath reads as professional.

## First decide where the voice comes from

It is the interview's voiceover question (Q5), and **the answer picks the footage**. Most Recharm
libraries label this with `Actor Type` (`Actor A-roll` / `Actor B-roll` / `No Actor`) and `Audio Type`
(`Voice` / `Voice With Background Sound` / `Background Sound`) - confirm the exact names and values in
the brand's `actor-types.json` / `audio-types.json`. Use them as filters - they are the cheapest way to
keep the wrong clips out of the plan. If the brand has no Actor Type category, sprite-check every pick
for a moving mouth instead.

- **Voiceover cut / VSL** (generated, or the user's upload) - search with
  `{"Actor Type": ["Actor B-roll", "No Actor"]}` only: hands using the
  product, product shots, lifestyle b-roll. **Mute every clip** (`keepClipAudio: false`), because even
  B-roll carries `Background Sound` (room tone, handling noise, sometimes a TV) and some B-roll is
  labelled `Voice With Background Sound` - a creator talking off-camera. Under a VO that is two voices.
- **"The voice from the clips"** - creators' own A-roll dialogue carries the ad: filter
  `{"Actor Type": ["Actor A-roll"], "Audio Type": ["Voice", "Voice With Background Sound"]}`,
  `keepClipAudio: true`, cut on sentence boundaries. No generated VO on top.
- **Mashup** - several creators' A-roll lines cut together (`Actor A-roll` only), **no additional
  voiceover**, clip audio kept.
- **Mixed** - A-roll carrying the story, B-roll / No Actor cutaways. This is where the split-edit
  machinery earns its keep: with `keepClipAudio` on, the builder assembles clip audio on its own
  sample-accurate timeline, so `audioLead` (J-cut) and `audioTail` (L-cut) let sound and picture cross
  over on every change of material. See `motion-and-transitions.md`. With `keepClipAudio: true` the
  cutaways' own sound comes along - pick cutaways labelled `Background Sound` (not `Voice...`), keep
  them short, or pre-render them silent and bring them in as `file` segments.

## Labels are the first line, not the last

Labels were applied by people across 100+ batches and only the top search hits return them - so
enforce the voice rule three ways:

1. **Filters** - `Actor Type` / `Audio Type` as above on every search for a VO-led ad.
2. **Your eyes** - sprite-check every pick (`get_clip_sprite_image`). A label saying `Actor B-roll` on
   a clip where the creator turns and talks to camera for two seconds is still a talking head.
3. **`keepClipAudio: false`** on every VO-led cut. It is the default.

**Why this is not a taste problem:** a voiceover over a visibly speaking person reads as a broken
video - and muting does not fix it, because it is a picture problem. The only fix is not picking
that clip.

## Probing what a clip actually carries

When a label is missing or you doubt it, the file is the authority:

```bash
# Does it even have an audio stream?
ffprobe -v error -select_streams a -show_entries stream=codec_name,channels -of csv=p=0 clip.mp4

# How loud is it? Near-silence means room tone; -20 LUFS or louder usually means speech or music.
ffmpeg -hide_banner -i clip.mp4 -af ebur128=framelog=verbose -f null - 2>&1 | tail -6
```

Loudness tells you there is sound, not whether a mouth is moving on screen - that still needs the
sprite.

## Voiceover

### Generated

**Use the ElevenLabs MCP** (connected as a claude.ai connector): `creative_list_voices` to choose,
`creative_generate_speech` to generate. If it is not connected, tell the user to connect ElevenLabs
in their claude.ai connector settings, and until then offer their own upload or the clips' voice.

1. Call `creative_list_voices` with the user's answers mapped to filters - `gender`, `age`,
   `accent` (with `languages: ["en"]`), `descriptives` (e.g. `upbeat`, `casual`, `confident`),
   `use_cases: ["advertisement", "social_media"]`. **Never use a voice ID from memory.**
2. If they gave no hint: pick from the brand's market and customer (`brand.json -> market`, the
   creators' accents in the library, the site's tone): usually a **warm, conversational 25-40 read in the
   local accent**, like a customer telling a friend, not announcer-slick (`descriptives`: `warm`,
   `friendly`, `casual`; swap for `confident`/`authoritative` on premium or technical brands). If
   creators' A-roll appears in the same ad, match the VO's gender/energy to theirs so it doesn't feel
   like two ads.
   **Say which voice you chose and why** so they can redirect before the render.
3. Generate with `eleven_multilingual_v2`; use `eleven_v3` if you want inline direction such as
   `[excited]` on the CTA. Brief the CTA line (the brand's URL, an offer the user confirmed) as the up-beat, and write URLs and numbers the way they should be spoken ("twenty percent off", "brand dot com").
4. The result renders with a voice switcher and several takes - read the widget context for the
   user's pick rather than asking, then download the chosen take to `vo.mp3`.

```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 vo.mp3
```

**Time the picture to the read, not the read to the picture.** Generated speech will not match
your estimate exactly. Once you have the real duration, adjust scene in/out points so scene
boundaries fall on sentence boundaries. A cut landing mid-word is the most audible mistake in
this whole pipeline.

If the generated read lands more than ~1.5s off your target, rewrite for length and regenerate
rather than stretching or squeezing the audio - time-stretched speech sounds synthetic.

### Supplied by the user

Use their file as-is. Do not re-encode, normalise, or "clean up" a read they recorded unless
they ask.

Measure it with ffprobe, then build the picture around it. If their VO is 24 seconds, the ad
cannot be 20 - tell them, and offer to either trim the picture and have them re-record, or
extend to their length. Do not silently truncate someone's recording.

## Music

### Generated

Use the ElevenLabs MCP: `creative_generate_in_flow` with `node_type: "music"`,
`model_id: "eleven_music_v2"`, and a prompt built from the user's mood words plus the practical
constraints - **instrumental, no vocals**, tempo/energy, and the target length ("25 seconds,
light, playful acoustic pop with pizzicato and soft claps, bright and clean, instrumental, clean ending"). Download the
chosen take to `bed.mp3`. If generation is unavailable, say so plainly and offer VO-only or a track
they supply. Do not quietly deliver an ad with no bed.

### Supplied by the user

Use their file. If it is longer than the ad, `build_ad.mjs` trims it and applies a fade. If
shorter, it pads with silence - which is worse than it sounds, so if their track is shorter
than the ad, mention it before rendering.

### Levels

`build_ad.mjs` handles this, but the reasoning matters if you ever adjust the defaults:

- **VO sits at 0dB** - it is the message and should be unambiguously in front.
- **The music bed sits 4dB under the speech.** This is the rule for every ad this skill makes, and the
  builder enforces it by measurement rather than by a fixed gain: it runs EBU R128 over the speech
  (the VO file, or the clips' own dialogue when `keepClipAudio` is true) and over the bed, then
  applies whatever gain puts the bed exactly 4dB below.

  A fixed gain cannot do this job. A generated VO lands near -18 LUFS, a library bed can arrive
  anywhere from -9 to -30, and a creator's phone audio is its own thing - so any single number is
  right for one pair of files and wrong for the next. Measuring both is what makes "4dB under the
  voice" mean the same thing on every render.

  The builder prints what it measured:

  ```
  music bed: speech -18.3 LUFS, bed -11.2 LUFS -> -11.1dB so the bed sits 4dB under the voice
  ```

  Read that line. If it warns that it fell back to a fixed -20dB bed, the measurement failed and
  the mix is a guess - check by ear before delivering. Override the offset with
  `"offsetDb"` on the music block if a particular ad wants the bed further back; setting `gainDb`
  pins an absolute level and turns the rule off entirely.
- **Ducking is on by default** - the bed drops a further ~9dB while the VO is speaking, via
  sidechain compression, and recovers in the gaps. This is what makes a bed feel deliberate
  instead of like something playing in another room. It works *with* the 4dB rule rather than
  replacing it: -4dB is the bed's resting level against the read, and the duck is what keeps
  individual words clear on top of that.
- **Fade out over the last second** so the ad ends rather than stops.
- **The finished mix is normalized to -14 LUFS** with -1.5 dBTP of headroom. This matters more
  than it sounds: without it the ad comes out at whatever level the VO happened to be
  generated or recorded at, which varies a lot between voices and takes. An ad that plays
  noticeably quieter than the clip before it in the feed gets scrolled past before the hook
  lands. Disable with `"loudnorm": false` or retarget with `"targetLufs"` in the `audio`
  block, but you rarely want to.

Music with a strong vocal will fight the VO no matter how far you duck it. If the user
supplies a vocal track, say so and suggest an instrumental.

### Clip audio

- **VO-led / VSL:** `keepClipAudio: false`, always.
- **Mashup / sync testimonial:** `keepClipAudio: true`. Cut on sentence boundaries. The music bed is
  measured against the clips' own dialogue and placed 4dB under it.
- **Mixed:** `keepClipAudio: true`, with J/L-cuts (`audioLead` / `audioTail`, 0.4-1.2s) on the
  changes between A-roll and cutaways. If a cutaway carries a *different* creator's speech, pick
  another cutaway rather than letting two voices overlap.

**If you want a texture sound** (a pour, a rattle, a click, a pet noise) under a VO-led cut,
generate it as a deliberate SFX layer (ElevenLabs `node_type: "sfx"`) or cut a short, pre-levelled
sting from a clip's own audio into a separate file - never un-mute the clip itself. Un-muting is
all-or-nothing and brings any off-camera talk and room noise with it.

## Assembling the audio in the EDL

```json
"audio": {
  "voiceover": { "file": "vo.mp3", "gainDb": 0, "delay": 0.2 },
  "music":     { "file": "bed.mp3", "duck": true, "duckDb": -9, "fadeOut": 1.0 },
  "keepClipAudio": false
}
```

**Note what is absent: no `gainDb` on the music.** Leaving it out is what lets the builder measure
both tracks and place the bed 4dB under the speech. Writing a `gainDb` there pins an absolute level
and silently disables the rule, which is the most likely way to end up with a bed that is right on
one ad and wrong on the next.

`delay` holds the VO back from frame one. A 0.15-0.3s beat before the first word lets the
opening image register before the voice starts, and it is the difference between an ad that
feels composed and one that feels like it started mid-sentence.

Both `voiceover` and `music` are optional. Omit either for a music-only or VO-only cut.

## Checking it

After rendering, verify the audio actually made it in and is not clipping:

```bash
ffprobe -v error -show_entries stream=codec_type,codec_name,sample_rate,channels -of csv=p=0 out/ad.mp4
ffmpeg -hide_banner -i out/ad.mp4 -af volumedetect -f null - 2>&1 | grep -E "max_volume|mean_volume"
```

Note the second command uses `-hide_banner`, not `-v error` - `volumedetect` reports at info
level, so `-v error` suppresses the very numbers you are asking for.

With loudnorm on, expect `mean_volume` around -16 to -17dB and `max_volume` comfortably below
0 (typically -2 to -8dB). A `mean_volume` near -30dB means the mix never got normalized - check
that `loudnorm` was not disabled. A `max_volume` of exactly 0.0dB means clipping.

To confirm the ducking actually engaged, sample the level in two-second windows and compare a
stretch where the VO is speaking against the tail after it stops:

```bash
for t in 0 6 12 15; do printf "t=%ss " $t; ffmpeg -hide_banner -ss $t -t 2 -i out/ad.mp4 -af volumedetect -f null - 2>&1 | grep mean_volume; done
```

The tail should sit clearly lower than the body. If every window reads the same, the bed is
not ducking and the VO is fighting it.

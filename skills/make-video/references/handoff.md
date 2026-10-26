# Hand-off to editors: Premiere Pro, DaVinci Resolve and After Effects

The MP4 is the deliverable. When the user, or their editor, wants to keep working on the ad, export an editable
version too. Offer it at delivery, or when the interview says an editor will finish the ad. Every export reads the
**same EDL that `build_ad.mjs` rendered**, so the timing matches the MP4 to the frame. Run the exports after the gate
passes.

| Want | Run | Gives |
|---|---|---|
| Re-cut, re-time, re-mix in **Premiere Pro or DaVinci Resolve**, with the motion graphics as separate layers | `node scripts/export_nle.mjs edl.json --verify` | `<ad>-edit/`: `sequence.xml`, `sequence.otio`, `captions.srt`, `media/`, `README.txt`, `verify.jpg` |
| Rework the motion itself in **After Effects** | `node scripts/export_ae.mjs edl.json` | `<ad>-ae/`: `build_comp.jsx` (File > Scripts > Run Script File), `media/`, `README.txt` |

The folders are self-contained. Zip one and send it, or write it straight into a folder the editor shares (Claude
desktop / Code). `export_premiere.mjs` still works: it now runs `export_nle.mjs`.

## Premiere Pro and DaVinci Resolve (`export_nle.mjs`)

`sequence.xml` is Final Cut Pro 7 XML:
- **Premiere:** File > Import.
- **Resolve:** File > Import > Timeline. Resolve 18.5 and later can import `sequence.otio` (OpenTimelineIO) instead.

A motion-graphics segment, an EDL segment with `"motion": "<project>/ads/<name>.json"`, is **taken apart** into
layers rather than handed over as one flat video:

| Track | Holds |
|---|---|
| V1 | **plates**: every scene's background or footage, with the ad's look and every transition baked in. One opaque H.264 render, cut at each transition's midpoint, so a re-trim never opens a gap |
| V2-3 | **graphics**: each scene's animations (charts, badges, packshots, phone, the subject cut-out...) as one transparent clip per scene. Clips alternate tracks where scenes overlap; each plays its own entrance and fades out across the next transition |
| V4-5 | **text**: each scene's heading, sub line and list, one transparent clip per scene |
| next | **captions**: the animated captions, transparent; `captions.srt` too, for a native caption track |
| next | overlays from the EDL, if any |
| next (off) | **sources**: the original clip under every footage scene, trimmed to match, for re-cutting (the plate has the camera move baked in) |
| top (off) | **REFERENCE**: the finished MP4; switch it on to compare |
| A1-A4 | voiceover; music at the measured level with the ducking keyframed under every spoken stretch and a fade-out; sound effects; the clips' own sound (when kept) |
| Markers | every scene: its line, its animations, its transition, its footage and camera move |

Footage-only segments are placed as clips with cross dissolves, as before. Simulated camera moves are marked to
rebuild with Scale / Position keyframes.

**Transparent clips** are PNG-in-MOV (lossless; the alpha is straight) by default:
- Flat graphics are mostly empty pixels, so they come out at a few MB to about 25 MB per scene.
- A scene whose graphics are photographic (a subject cut-out over rays) is heavier, about 45 MB/s. ProRes 4444 is no
  smaller there (measured).
- `--alpha prores` writes ProRes 4444 for pipelines that require it; `--alpha qtrle` writes QuickTime Animation.

**Plates** are H.264 at CRF 18 with a keyframe every half second, for smooth scrubbing. A grain look (film, paper)
is most of the plate's size, because noise doesn't compress. A 30s 9:16 ad comes to about 0.5 GB of media in total.

Layers are cached by content in `media/`. After a review edit, exporting again renders only the changed scenes. The
first export renders every layer, three at a time (`--jobs`): about 1.5-3 minutes for a 9-scene ad.

**`--verify` (use it):** it composites the exported layers the way the timeline places them and compares the
result with the finished MP4, scene by scene. It prints PSNR per scene (30+ dB = the same picture) and writes
`verify.jpg`: one frame per scene, the finished ad beside the layers.
- Averages of 33-38 dB are normal.
- Dips are expected inside transitions, where the graphics fade instead of moving with the transition.
- A scene where a big graphic sits under the look's grain also reads lower: grain is on the plate only.
- A scene averaging under 25 dB is flagged. Look at it in `verify.jpg` before sending.

**`sequence.otio`** is written through the optional OpenTimelineIO tool (`setup.md`). Writing it also proves the
XML parses as FCP7 XML. Without the tool, the export says so and skips the file.

**Doesn't carry over as live effects:**
- The transitions and camera moves are baked into the plates.
- Graphics and text are renders. To change one, edit the ad JSON (or use the review page, `review.md`) and export
  again; only the changed scenes re-render.
- The look's grain sits on the plates, not over the graphics.
- The final -14 LUFS normalisation: do it on export from the NLE.

**Resolve notes:** untick "Automatically set project settings" only if the project already matches the ad's size and
frame rate. If a graphic shows a black box, set Clip Attributes > Alpha mode: Straight. Relink to `media/` if clips
come in offline.

## After Effects (`export_ae.mjs`) - layered, motion baked (Option A)

Run `build_comp.jsx` in After Effects. It adds a folder named after the ad to the open project:

- **Main comp** at the ad's size and fps. Bottom layer: the finished render, switched off - toggle it to compare.
- **Library clips** as footage layers: trimmed, scaled, positioned (crop anchor) like the render; push-in / pull-back
  as Scale keyframes, glides as Position keyframes; a transition into a clip becomes an opacity fade (marked).
- **One precomp per animated scene** ("S03 badges"), holding the scene's elements as separate layers,
  bottom to top: `background` (or `footage`), each visual (`pour`, `chart`, `badges`, `particles`...), `subject cut-out`
  (when the scene has one - the graphics below it sit behind the person), `text`, `icon steps`, `lower third`,
  `highlight ring`. A carry transition's shape is part of the incoming scene's `background` layer. Layers are never
  motion-blurred - switch on AE's own motion blur if you want it. Each element is
  rendered on transparency (PNG sequence) - the background / footage layer is a high-quality H.264.
- **Captions** as live text layers in the brand font, positioned like the MP4's, with fades (and the pop scale).
- **Audio**: voiceover, music (Audio Levels keyframes = the ducking), sound effects. **Markers** name every scene.

The motion **inside** an element layer is baked - the designer can move, retime, mask, re-colour, replace or delete
any layer, but not edit the keyframes of a badge's stamp. (Native shape layers with keyframes - "Option B" - would
convert the vector elements one type at a time.)

Which segment is the motion-graphics render: give that EDL segment `"motion": "<brand project>/ads/<name>.json"`
(the ad JSON it was rendered from; `"remotion"` is read too), or pass `--motion <ads/name.json>`. Rendering the layers
needs the brand's HyperFrames project (`hf_build.mjs --isolate` renders each element on transparency, about 5 seconds
per element; renders are cached by content, so after an edit only the changed scenes render again). Clips keep their
own sound and J/L-cuts on their own audio layers when the ad keeps the clips' audio. Text is written into the script as
ASCII escapes, so curly quotes, accents and emoji arrive intact. (Old Remotion option `--scale` is gone: HyperFrames
renders full size quickly.)

**Size**: element layers are mostly transparent and small (10-60 MB per element per scene at 1080x1920); a 30s
motion-graphics ad is typically a few hundred MB, plus the clips.

## Checking an export

- Premiere / Resolve: `export_nle.mjs --verify` checks the layer timing and stacking against the MP4 without either
  app. Then open `sequence.xml` once in the editor's app and scrub against the REFERENCE track.
- After Effects: `build_comp.jsx` can be run headless-ish for a check - a wrapper that sets
  `var MAKE_VIDEO_AE_SAVE = "<path>.aep";` then `$.evalFile(build_comp.jsx)`, sent with `AfterFX.exe -r wrapper.jsx`
  to a running After Effects, saves the project; `aerender -project <aep> -comp "<ad name>" -s N -e N` renders frames
  to compare with the MP4's.

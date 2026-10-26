# Setup and troubleshooting

Read this only when `scripts/preflight.mjs` reports something missing, or a render fails on the
toolchain. Steps 1-5 of the skill (brand, catalogs, interview, library, plan) run on MCP tools and
do not need any of this; it gates the render only. When something is missing, tell the user exactly
what to install and offer the reviewed plan now and the MP4 once installed.

## Check

```bash
node ~/.claude/skills/make-video/scripts/preflight.mjs          # add --deep once per machine to probe Video-Use
```

It checks ffmpeg/ffprobe (with `libx264`, `subtitles`, `xfade`, `zoompan`, `sidechaincompress`), Node
and npx, notes the optional ghost-editor skill, and lists the in-session connectors to confirm.

## Installs

| Tool | Install | Notes |
|---|---|---|
| ffmpeg + ffprobe | Windows: `winget install Gyan.FFmpeg` (full build) · macOS: `brew install ffmpeg` | Needs `libx264` and `libass`. Open a fresh shell after installing so it is on `PATH` |
| Node 22+ and npx | nodejs.org (npx ships with npm) | Runs the build scripts, HyperFrames and Video-Use. HyperFrames needs 22 or newer |
| HyperFrames + GSAP | nothing by hand - `hf_init.mjs` installs the pinned versions once in `<cache>/tools/hyperframes` | Motion-graphics ads only; see `motion-graphics.md` and HyperFrames below |
| Video-Use | nothing - `npx -y video-use@latest` resolves on demand | Use when a sprite cannot settle a question (exactly when a mouth moves, when burned-in text clears) |
| Object separation (SAM 2.1) | nothing by hand - `node scripts/separate.mjs --setup` builds a venv at `<cache>/tools/sam` | Optional; graphics behind a person / product. Python 3.10+; see Object separation below |
| openai-whisper | `py -m pip install openai-whisper` (Windows) · `pip3 install openai-whisper` | Optional; local transcription for `transcribe.mjs`. First run downloads the ~140 MB `base` model |

## Cloud sandboxes (claude.ai) - blocked downloads

Code in a claude.ai chat runs in a sandbox whose network may only reach an allowlist of hosts. `preflight.mjs`
reports each host the ad needs as `ok` or `BLOCKED` (it tells a real S3 answer from a proxy refusal).

| Host | Needed for |
|---|---|
| `recharm-content-library.s3-accelerate.amazonaws.com` | Recharm clips (the URLs search returns) |
| `recharm-content-library.s3.amazonaws.com` | the same clips - the automatic fallback |
| `registry.npmjs.org` | installing HyperFrames + GSAP (motion graphics, end cards, overlays) |
| `storage.googleapis.com` | HyperFrames' headless Chrome (downloaded on the first render) |
| the brand's website | claims, packshots, colours, fonts (first build of a brand) |

The Recharm and ElevenLabs **connectors** don't need these - they run outside the sandbox.

When clip storage is blocked, say so in the first message and offer:
1. **Allow the hosts** - an admin of the claude.ai workspace adds the two clip hosts (and the website) to the
   allowed domains for code execution / network access in the organisation's settings, then the user starts a
   new chat (settings apply to new sessions).
2. **Supply the clips by hand** - after the shortlist, `fetch_clips.mjs` writes `DOWNLOAD-THESE.html`: one link per
   clip. The user clicks each (the browser keeps the right file name), then shares the folder (Claude desktop /
   Code: grant that folder) or uploads the files to the chat. `fetch_clips --from <folder>` picks them up by name.
   Files over the chat's upload limit need the folder route. A cloud-drive connector usually can't move video files
   of this size - don't rely on it.
3. **No library footage** - a motion-graphics ad (`animation-library.md`) from the website's packshots, or from
   packshots and a logo the user uploads when the website is blocked too.

## Object separation (graphics behind the subject)

`scripts/separate.mjs` cuts a person, product or hand out of a library clip with **SAM 2.1** (Meta, Apache-2.0),
locally through Hugging Face transformers - nothing is uploaded. The first run makes a venv at `<cache>/tools/sam`
(reusing a system torch when there is one) and installs torchvision, transformers, pillow, numpy and accelerate;
the model downloads once to the Hugging Face cache.

| Machine | Model (auto) | Speed |
|---|---|---|
| CPU | `tiny` (156 MB) | ~2.5-5 s per frame - a 2.5s shot at 30fps takes 3-6 minutes; run it in the background |
| Apple silicon (mps) | `base-plus` (323 MB) | ~1 s per frame |
| NVIDIA, 12 GB+ | `large` (898 MB) - add `--cuda` once to install the CUDA torch (~2.5 GB) | well under 1 s per frame |

Separate only the stretch the scene uses (`--from` = its trimBefore, `--dur` = its duration + 0.3). Two or three
`--points` on the subject beat one; add `x,y,0` to exclude something (the box a hand holds). Check frame 0 and the
last frame of the output: the printed coverage should be plausible and "frames lost the subject" absent. Known:
- `Sam2ImageProcessor requires the Torchvision library` - an old venv; `separate.mjs --setup` installs it.
- A symlink warning from huggingface_hub on Windows is harmless (the cache just uses more disk).
- Python not found - install Python 3.10+ (python.org; tick "Add to PATH"), then `--setup`.

## HyperFrames (motion graphics)

The motion-graphics engine is HyperFrames (HeyGen, Apache-2.0), pinned at **0.8.185**, with GSAP **3.14.2**. `hf_init.mjs`
installs both once per cache in `<cache>/tools/hyperframes` (`npm install`, about a minute) and copies GSAP and the
skill's runtime into each brand project. The first render downloads a headless Chrome (chrome-headless-shell, about
150 MB) into HyperFrames' cache. Every `hf_build.mjs` run sets `HYPERFRAMES_NO_TELEMETRY=1` (and `DO_NOT_TRACK=1`) and
turns off its update checks and auto-installs for that process, so nothing about the user's renders is reported and
the pinned version stays put. To upgrade: change the pin in `hf_init.mjs`, delete `<cache>/tools/hyperframes`, re-run
`hf_init`, and re-render the three test drafts before using it on a client ad.

The animation library itself is the skill's runtime: `assets/hyperframes-runtime` (the library written against a small
Remotion-compatible layer over Preact, MIT), prebuilt as `dist/mv-runtime.js`. After editing anything in its `src/`:
`npm install` there once, `node build.mjs`, then re-run `hf_init` for each brand.

The runtime bundles Preact and lottie-web (both MIT). `npm run check` in `assets/hyperframes-runtime` type-checks it
(TypeScript) - run it before `node build.mjs` after an edit: the bundler alone does not catch an undefined name, and
HyperFrames then refuses the render with `sub_timeline_script_failure`. Shader backgrounds need WebGL in the headless
Chrome; where it is missing (some cloud sandboxes without a GPU) they draw a CSS gradient of the same colours.

Known problems:
- `Video "...": sparse keyframes` - only appears if a clip bypasses `hf_build` (it re-encodes every clip it uses).
- `render failed` with a browser error - run `npx hyperframes doctor` from `<cache>/tools/hyperframes`; a blocked
  `storage.googleapis.com` stops the Chrome download.
- A scene renders black where footage should be - the clip isn't in `<project>/assets/clips/`, or the scene names it
  differently from the file (`mg_check` reports missing clips).
- Node older than 22 - HyperFrames refuses to start; upgrade Node (preflight warns).

## Connectors

| Connector | If missing |
|---|---|
| Recharm MCP | Ask the user to connect or re-authorise it in their claude.ai connector settings (or `/mcp` in a terminal session). Nothing in the skill works without it |
| ElevenLabs MCP | Ask the user to connect it in claude.ai connector settings. Until then the voice options are their own upload or the clips' own voice, and music must be their upload |

Tool names in this skill are generic: the Recharm tools appear as `mcp__<id>__list_brands` and so on, and
may be deferred - load them with ToolSearch before calling.

## Optional: OpenTimelineIO (Resolve hand-off)

`export_nle.mjs` writes `sequence.otio` beside `sequence.xml` when the OpenTimelineIO tool is installed: Resolve 18.5+
imports it directly, and converting the XML is also a check that it parses as FCP7 XML. One venv in the cache:

```bash
py -3 -m venv <cache root>/tools/otio            # python3 on macOS / Linux
<cache root>/tools/otio/Scripts/python -m pip install opentimelineio otio-fcp-adapter     # bin/python on macOS / Linux
```

Without it the export still writes `sequence.xml` (Premiere and Resolve both import that) and says it skipped the
`.otio`. Preflight shows whether it is there.

## Review page

`review.mjs` needs nothing beyond the render toolchain: a Node HTTP server on 127.0.0.1 and the page in
`assets/review/review.html`. If port 4317 is taken, pass `--port <another>`. Stop it with Ctrl+C. When it runs in the
background in Claude Code, stop that background task. It keeps no state in memory that matters: notes and versions are
files next to the ad JSON.

## Optional: ghost-editor

If `~/.claude/skills/ghost-editor` exists, its whisper transcription and sfx kit help with testimonials
and mashups; check it with `bash ~/.claude/skills/ghost-editor/scripts/doctor.sh`. Otherwise use
ElevenLabs `creative_transcribe_audio`. Do not install it unless the user asks.

## Known problems

- **Windows path length.** Working directories past 260 characters fail with an ENOENT naming ffmpeg.
  Set a short `workDir` in the EDL, e.g. `"C:/adwork"`.
- **Windows Python.** The launcher is `py`, not `python3`/`pip`: use `py -m pip install ...`. ghost-editor's
  `doctor.sh` probes `python3`, so on Windows it reports numpy/opencv/whisper as missing even when
  `py -c "import numpy, cv2, whisper"` succeeds - trust the `py` check.
- **PowerShell and JSON.** PowerShell strips inner quotes from inline JSON; write filter maps to a file
  and pass `--file` to `check_filters.mjs`.
- **Rotation flags.** Plain ffprobe width/height lies for portrait clips stored landscape; `build_ad.mjs`
  reads the rotation, and screening should too (`stream_side_data=rotation`).

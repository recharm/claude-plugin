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
| Node 18+ and npx | nodejs.org (npx ships with npm) | Runs the build scripts, Remotion and Video-Use |
| Remotion | `npx create-video@latest` - nothing global | Motion-graphics ads only; see `motion-graphics.md` |
| Video-Use | nothing - `npx -y video-use@latest` resolves on demand | Use when a sprite cannot settle a question (exactly when a mouth moves, when burned-in text clears) |
| Remotion official skills | `npx skills add remotion-dev/skills -g -a claude-code --copy -y --skill remotion-best-practices --skill remotion-markup --skill remotion-render` | Companion skills, pinned at v4.0.534; review before updating |
| openai-whisper | `py -m pip install openai-whisper` (Windows) · `pip3 install openai-whisper` | Optional; local transcription for `transcribe.mjs`. First run downloads the ~140 MB `base` model |

## Connectors

| Connector | If missing |
|---|---|
| Recharm MCP | Ask the user to connect or re-authorise it in their claude.ai connector settings (or `/mcp` in a terminal session). Nothing in the skill works without it |
| ElevenLabs MCP | Ask the user to connect it in claude.ai connector settings. Until then the voice options are their own upload or the clips' own voice, and music must be their upload |

Tool names in this skill are generic: the Recharm tools appear as `mcp__<id>__list_brands` and so on, and
may be deferred - load them with ToolSearch before calling.

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

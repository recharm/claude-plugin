# Review: notes, quick edits and per-scene re-renders

Once the first draft of a motion-graphics ad exists, give the user a review page instead of asking for feedback in
chat. They watch the ad, leave notes on scenes (or at a timecode), make small edits themselves, and every change
re-renders only the scenes it touched: about 15 seconds a round instead of the whole ad.

```bash
node scripts/review.mjs <project>/ads/<name>.json --edl <edl.json>      # --port 4317 by default
```

Run it in the background and open `http://127.0.0.1:4317/` in the built-in browser (`preview_start` with the url),
or tell the user to open it. Leave out `--edl` for an animation-only review (no voiceover, music or captions).
The server listens on 127.0.0.1 only and refuses other hosts.

## What the page does

| Part | Does |
|---|---|
| Player | The ad as mixed (VO, music, captions) at draft quality. Frame steps, scene jumps, loop a scene, timecode and frame number. Keys: space, arrow keys, J/L, `[` `]`, N for a note |
| Scene strip | One block per scene where it sits in the edit. Click to seek. Dots are notes; an amber edge is an edit waiting to render; a blue edge is a scene that just re-rendered |
| Scene cards | Each scene's frame, timing, animations, transition and line. **Edit this scene**: heading, sub line, text animation, background tone and style, transition in (and carry shape), length, camera (footage), or the scene's whole JSON |
| Notes | Per scene or at the playhead, saved to `<project>/ads/<name>.review.json`. Each has a status (open / done / wontfix) and Claude's reply |
| Apply & re-render | Runs `mg_check` on the edited ad. A BLOCK refuses the edit and leaves the ad untouched, then keeps the replaced version for **Undo** and renders |
| Render final | Final renders with motion blur, points the EDL at it, runs `build_ad` and the gate |
| Export for Premiere / Resolve | `export_nle.mjs --verify` on the EDL (`handoff.md`) |

## Why it's fast

- `hf_build.mjs --incremental` renders the timeline as one window per scene. A window runs from where the scene's
  transition begins to where the next scene's begins.
- Each window is cached by everything it reads: its scenes' JSON, the transitions, the clips, the brand assets and
  the runtime.
- An edit to scene k re-renders the two windows that contain it, and the rest come from the cache. A length change
  shifts later scenes but doesn't re-render them.
- The windows are joined without re-encoding. The result matches a whole-ad render frame for frame: tested at
  36-44 dB PSNR, which is encoder noise.
- The ad's look (grain, sweep) runs on time since the current scene's window started, so a re-rendered window
  matches its neighbours.
- `build_ad` keeps the animated-captions layer while the captions don't change, so the mix takes about 4 seconds.
- Undo restores the previous JSON. Its windows are still cached, so it shows in a few seconds.
- Measured on a 32-second, 9-scene ad, CPU only:

  | Step | Time |
  |---|---|
  | First preview | about 60 seconds (every window and the captions, once) |
  | A one-scene edit | 12-14 seconds of rendering, plus about 4 seconds of mixing |
  | A restart, or an undo | about 6 seconds |

## Notes are for you: the protocol

A note that needs judgement ("make this punchier", "the chart is confusing", "wrong product") is yours to act on.
When the user says "apply my review notes" (or asks what's open):

1. Read `<name>.review.json`. Act on every note with `status: "open"`, in scene order. `scene` is the 0-based index,
   and `t` is seconds on the preview's timeline.
2. Change the **ad JSON** in place: the scene's fields, its visuals, its transition. Keep the claims rule: numbers
   only from the site or `approvedClaims`.
   - For a VO, script or music note, say what it needs. A new voiceover means new word timings and new scene cuts,
     so it's a new draft, not a review edit.
3. Run `mg_check.mjs` on the ad. Save only when it passes.
4. The running server notices the file change, keeps the previous version for Undo, and re-renders the scenes
   you touched. The page updates by itself.
5. For each note, set `status: "done"` (or `"wontfix"`) and a one-line `reply` saying what you changed, or why not.
   Write the file back. Keep its other fields as they are, and don't touch notes you didn't act on.
6. Tell the user in chat what changed, scene by scene. They can see it on the page already.

Don't change the ad JSON while a final render or an export is running. The status chip on the page, or
`GET /api/status`, says what is running.

## When the user is happy

Press **Render final** on the page, or run the same steps yourself:
1. `hf_build --incremental --blur`.
2. Point the EDL's motion segment at the result, with `out` following the ad's new length.
3. `build_ad`, then the gate.

The first time it does this, the server copies the EDL to `<edl>.before-review`. Then deliver as Step 6 says, and
run `mg_check --record` on the final ad.

---
name: Recharm Video Briefs
description: Turn an end-to-end creative brief (usually for a video) into a sectioned shot list, search the user's Recharm clip library for footage that fits each section, visually review the candidates, and produce a final creative brief with the picks. Use whenever a user provides a brief/script/storyboard and asks for matching footage from Recharm.
---

# Recharm Video Briefs

You orchestrate a multi-step search-and-review loop against the user's Recharm clip library to turn a creative brief into a shot-by-shot brief with concrete clip picks.

The Recharm MCP server (`recharm`) is available in this plugin and exposes:

- `list_brands` — returns the brands the user has access to.
- `search_clips_visually(brandName, query, cursor?)` — semantic visual search over the brand's **clips** (a clip = a curated, named segment of a raw video). Returns text-only hit metadata per clip: `clipSymbol`, `sceneType`, `clipName` (formatted `<clipSymbol> - <sceneType>`), `durationMs`, `aspectRatio`, `cosineDistance`, `matchOffsetMs`, `posterUrl`, `spriteUrl`, `hasSprite`. **No images come back inline** — you must fetch them with the tools below.
- `get_clip_sprite_image(brandName, clipSymbol)` — returns a JPEG **sprite** (a grid of frames sampled evenly across the clip). This is the primary tool for visually reviewing a candidate — a single poster lies about clips with motion or scene changes; a sprite shows you what actually happens. Only available when the hit's `hasSprite` is `true`.
- `get_clip_poster_image(brandName, clipSymbol)` — returns a single still poster for the clip. Use this when one frame is enough (e.g. a static product shot) or as a fallback when `hasSprite` is `false`.
- `save_brief(brandName, file)` — uploads the final brief to Recharm's public-share storage and returns a `{ url, briefId, s3Key }` JSON payload. `file` is a versioned, discriminated payload; for the current schema pass `file: { version: "v1", fileHtml: "<full HTML document>" }`. Call this once, after the brief is fully assembled.

**Always refer to a clip in user-facing output as its `clipName` — `<clipSymbol> - <sceneType>`** (e.g. "AB12 - Product Reveal"). If `sceneType` is `null`, fall back to just the `clipSymbol`.

Follow the steps below in order. Do not skip the visual-review step — the value of this skill is that you actually look at the candidates, not just list IDs.

## Step 1 — Confirm the brand

- If the user already named a brand slug (e.g. `lululemon`, `hike_footwear`), use it.
- Otherwise call `list_brands` and ask the user to pick.
- Stop and ask if there is any ambiguity — do not guess the brand.

## Step 2 — Section the brief

If a brief is already split into sections, skip this step.

Read the brief and break it into ordered sections. A "section" is a beat/scene/shot the final video will need footage for. For each section, capture:

- A short heading (e.g. "Hook — runner laces up at dawn")
- 1–2 sentences on what should appear on screen
- The narrative role (hook / problem / product reveal / benefit / proof / CTA / etc.) when the brief implies one

If the brief is short or unstructured, propose your sectioning to the user before searching — getting this wrong wastes searches downstream.

## Step 3 — Generate visual search queries per section

For each section, generate **3–5 short, visual** search phrases. These feed an embedding-based search, so:

- Describe what is literally on screen, not abstract concepts. "woman tying running shoes on porch" beats "morning motivation".
- Vary the phrases — different subjects, framings, environments — so you cover the section instead of returning near-duplicates.
- Keep each phrase under ~8 words.

## Step 4 — Search and review, section by section

For each section:

1. Call `search_clips_visually` once per phrase. Pass `brandName` and `query`. Leave `cursor` unset on the first pass.
2. Read the text metadata first (`clipName`, `sceneType`, `cosineDistance`, `durationMs`) to triage. Skip hits whose `cosineDistance` is clearly worse than the rest of the page — they will almost never be good. Use `sceneType` as a signal of fit (e.g. an "Establishing Shot" is unlikely to work as a "Product Reveal").
3. For each plausible candidate, call `get_clip_sprite_image(brandName, clipSymbol)` **actually look at the grid**. The sprite is the truth about a clip — a poster can flatter a clip that pans away or loses framing mid-shot. Review the grid left-to-right; the frames are evenly spaced across the clip.

- Do NOT try to fetch the sprite directly from s3

4. Score each candidate against the section's intent. Reject hits that are visually off-brief even if the metadata looked promising. Note _why_ a clip works (composition, subject, energy, lighting, motion arc) — that reasoning is what the customer is paying for.
5. If none of the candidates for a section are strong, run one more search with reworded phrases before giving up. It is better to mark a section "no strong match — needs a custom shoot" than to recommend a weak clip.
6. Pick the top 1–3 candidates per section. Track each pick by `clipName` (and the underlying `clipSymbol`) and the brand slug.
7. Remember the search term used for each selected candidate

## Step 5 — Produce the final brief

Output a single HTML document with this shape:

- Title: `<Project name> — Footage Brief`
- One section per brief section, each with:
  - The section heading
  - **On screen:** a 1–2 sentence description from Step 2
  - **Picks:** a list of clips. For each pick, show the clip's poster image, link it to `https://app.recharm.com/app/<brandName>/?clipId=<clipSymbol>` (URL-encode both), and include the `clipName` and a one-line reason it works. The clips should show the poster image and the video clip URL so it is playable inline.
  - **Notes:** anything the customer should know — e.g. "no strong match for the night-time variant; consider a custom shoot"
  - **Search Term** the search query from Step 3 that generated this result. Note that each clip will have its own search term.

End the document with a short **Overall notes** section: any sections that need custom footage, any cross-cutting style observations, and any obvious gaps in the brand's library so they know what to shoot next.

## Step 6 — Save and share the brief

After the HTML document is complete, call `save_brief` exactly once with `brandName` and `file: { version: "v1", fileHtml: "<the complete HTML>" }`. The tool returns `{ url, briefId, s3Key }` — surface the `url` to the user as the shareable link (e.g. "Brief saved: <url>"). If the call fails, fall back to showing the HTML inline and tell the user the save failed.

## What not to do

- Don't recommend a clip you didn't visually review via `get_clip_sprite_image` (or `get_clip_poster_image` for genuinely static content / sprite-less clips).
- Don't pad picks with weak matches just to fill a section.
- Don't invent `clipSymbol`s — only use ones returned by `search_clips_visually`.
- Don't refer to a clip by `clipSymbol` alone in user-facing output — always use `clipName`.
- Don't ask the user to run searches themselves — the whole point is that you do it for them via the MCP.
- Don't call `save_brief` more than once per brief, and don't call it before the HTML is finalized — each call mints a new URL.

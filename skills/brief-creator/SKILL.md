---
name: "brief-creator"
description: Turn an end-to-end video creative brief into a sectioned shot list, search the user's Recharm clip library for footage that fits each section using label-based filters, and produce a final creative brief with picks. Use whenever a user provides a brief/script/storyboard and asks for matching footage from Recharm.
---

# Create Video Brief

You orchestrate a multi-step search loop against the user's Recharm clip library to turn a creative brief into a shot-by-shot brief with concrete clip picks. You use label-based filters to constrain searches — no visual review of clips is performed.

The Recharm MCP server (`recharm`) is available in this plugin. Key behavioral notes:

- Call `list_labels` once at the start — keep the result for the entire workflow; do not call it again per scene.
- You do NOT build HTML. You pick clips and hand `save_brief` a slim structured package; the server derives every clip's URLs, name, duration, and aspect ratio from its `clipSymbol` and renders the HTML.
- Call `save_brief` exactly once, after the clip picks are final. Each call mints a new URL.
- Do not paginate `search_clips_visually` — use the first page only.
- Only use label values returned by `list_labels` — do not invent or guess label strings.

Please check the actual MCP server data for up-to-date API info.

**Always refer to a clip in user-facing output as its `clipName` — `<clipSymbol> - <sceneType>`** (e.g. "AB - Product Reveal"). If `sceneType` is null, fall back to just the `clipSymbol`.

This skill processes one video at a time. If you detect that the provided brief calls for creating multiple videos, prompt the user up front whether to run the skill once per video (sequentially) or pick a single video to process — then follow the steps below for each chosen video.

Follow the steps below in order.

## Step 1 — Confirm the brand

- If the user already named a brand slug (e.g. `lululemon`, `hike_footwear`), use it.
- Otherwise call `list_brands` and ask the user to pick.
- Do not guess the brand if there is any ambiguity.

## Step 2 — Fetch available labels

Call `list_labels(brandName)` and keep the result for the rest of the workflow. You will use these categories and labels to build search filters. Do not invent or use label values that were not returned by this call.

Note the following special-case categories if present:

- **SceneType**: each clip belongs to exactly one SceneType. Useful values include `Hook`, `CTA`, `Product Benefit`, `Demo`, and `Product Shot`.
- **ActorType**: indicates whether a person appears and whether they are speaking.

## Step 3 — Section the brief

Read the brief and break it into ordered scenes. Each scene should be approximately 2–5 seconds and correspond to a single Recharm clip. Cap the total at **18 scenes**.

For each scene capture:

- A short heading (e.g. "Hook — runner laces up at dawn")
- 1–2 sentences describing what should appear on screen
- The narrative role (hook / problem / product reveal / benefit / proof / CTA / etc.) when the brief implies one

If the user supplied an explicit scene breakdown, use it and skip to Step 4. Otherwise, **show the proposed scene breakdown to the user and wait for confirmation before proceeding.**

If a transcript (also called voiceover or VO) is provided, use it to inform what each scene should show — but section the brief independently of transcript timing.

## Step 4 — Build search queries

For each scene, generate **2-4 search queries**. Each query has:

- A short visual phrase (under ~8 words) describing what is literally on screen — not abstract concepts. "woman tying running shoes on porch" beats "morning motivation". Vary phrases across queries to cover different subjects, framings, and environments.
- An optional `filters` object with 0–3 categories and 1-2 labels from the `list_labels` response.

### Filter rules

**SceneType filter:** use the SceneType that best matches the scene's narrative role when a relevant SceneType exists in the label list.

**ActorType filter (transcript constraint):** if a transcript (or voiceover/VO) was provided AND `ActorType` is present in the `list_labels` response, add `ActorType: ["Actor B-roll", "No Actor"]` as a hard filter on every query. If `ActorType` is absent from the label list, omit this filter entirely.

**Product filter:** if a specific product was named in the input:

1. Look for a product-related label category in the `list_labels` response.
2. If found, match the product name to the closest available label. If you are unsure which label is the right match, ask the user to pick before searching.
3. If no product label category exists, include the product name in the text query phrase for scenes where it is relevant (product shots, demos, CTAs) — not mechanically on every scene.

**General filter guidance:** supply multiple labels within a category to broaden results (OR logic within a category). Only combine multiple categories when both constraints are genuinely required (AND logic across categories) — over-filtering will return too few results.

## Step 5 — Search, section by section

Each `search_clips_visually` hit is slim: `clipSymbol`, `clipName`, `rawVideoPublicId`, `sceneType`, `cosineDistance` (lower is closer), `durationMs`, and `categoriesAndLabels` (top hits). No media URLs are returned — pick clips by `clipSymbol` and the server derives the rest at render time.

For each scene:

1. Call `search_clips_visually` once per query phrase, passing `brandName`, `query`, and any `filters`. Do not paginate — use only the first page of results.
2. Select the **1–2 top results per query** by lowest `cosineDistance`. Do not fetch or examine poster images or sprite images.
3. Aim for **3–6 clips per scene** total (across all queries). Deduplicate by `clipSymbol` — if the same clip appears in multiple query results, count it once and attribute it to the query with the best cosineDistance.
4. Use **at most one clip per `rawVideoPublicId`** within a scene — clips sharing a `rawVideoPublicId` are different moments of the same source video and look near-identical. Keep the best (lowest cosineDistance) and drop the rest, so each scene's picks are visually varied.
5. Track, per picked clip, the **query phrase** and the **filters** used in the search that surfaced it — both go into the brief package in Step 6.
6. If all results for a scene have weak cosineDistance scores, leave that scene's clip list empty (Step 6) so it renders as a "custom shoot needed" gap, and note it in the overall summary to the user.

## Step 6 — Assemble the brief package

Do **not** write HTML. Build a slim structured package the server will render:

- `title`: a short brief title, e.g. `"5 Outdated Rules" · UGC Testimonial · Women 50+`.
- `scenes`: the ordered scenes from Step 3. Each scene is:
  - `name`: the scene heading.
  - `description`: the 1–2 sentence on-screen description from Step 3.
  - `clips`: the picked clips for the scene, in order. Each clip is:
    - `clipSymbol`: the `clipSymbol` from the `search_clips_visually` hit.
    - `searchString`: the query phrase that surfaced this clip (Step 4/5).
    - `filters`: the label filters used in that search, if any (the same `filters` object you passed to `search_clips_visually`).
  - For a scene that needs a custom shoot (no strong matches), use an **empty `clips` array** — it renders as a "custom shoot needed" gap.

You do not provide URLs, durations, dimensions, aspect ratios, or display names — the server derives all of those from each `clipSymbol`.

## Step 7 — Save and share the brief

Once the package is assembled, call `save_brief` exactly once with the **v2** payload:

```
save_brief(brandName, {
  version: "v2",
  title: "<brief title>",
  scenes: [
    {
      name: "<scene heading>",
      description: "<on-screen description>",
      clips: [
        { clipSymbol: "<symbol>", searchString: "<query phrase>", filters: { <category>: ["<label>"] } }
      ]
    }
    // ...a scene needing a custom shoot uses: { name, description, clips: [] }
  ]
})
```

The tool derives, renders, and uploads the HTML, returning `{ url, briefId, s3Key }` — surface the `url` to the user as the shareable link. After saving, give the user a short **overall summary**: scenes that need custom footage, cross-cutting observations, and obvious gaps in the brand's library. If the call fails, report the failure and show the structured package you assembled.

## What not to do

- Don't fetch or examine poster images or sprite images — clip selection is based on cosineDistance and text metadata only.
- Don't use label values that were not returned by `list_labels` — the API will reject them.
- Don't over-filter: combining many categories will produce too few results.
- Don't pad picks with weak matches without a warning note.
- Don't invent `clipSymbol`s — only use ones returned by `search_clips_visually`.
- Don't refer to a clip by `clipSymbol` alone in user-facing output — always use `clipName`.
- Don't ask the user to run searches themselves — you do it via the MCP.
- Don't build HTML or construct clip URLs yourself — hand `save_brief` the v2 structured package and let the server render.
- Don't call `save_brief` more than once per brief, and don't call it before the clip picks are final.

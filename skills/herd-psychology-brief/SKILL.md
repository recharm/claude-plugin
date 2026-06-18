---
name: "herd-psychology-brief"
description: >
  Build a Recharm footage brief for a HERD PSYCHOLOGY ad — open with a FOMO or social-proof hook ("Why is everyone switching to X?", "Am I the only one who hasn't tried this?"), then ride the bandwagon narrative to the product reveal and CTA. Use whenever a user provides a brief, concept, or ad idea and wants to frame it around social proof, FOMO, viral curiosity, or the feeling that "everyone is doing this." Searches the user's Recharm clip library and produces a shareable shot-by-shot brief with clip picks. Trigger this skill whenever the user mentions "herd psychology", "FOMO", "bandwagon", "everyone is using", "why is everyone", "social proof hooks", "viral curiosity", "am I the only one", or provides a brief with a trend-driven, crowd-following angle. Also use when the user asks for herd-style hooks, bandwagon ad openers, or any creative where the core tension is "everyone else is already doing this — why aren't you?"
---

# Herd Psychology Ad Brief

You build a Recharm footage brief for a **herd psychology** ad — one that opens with a hook rooted in social curiosity or FOMO, then rides the bandwagon narrative to a product reveal and CTA.

The psychological engine: the viewer feels slightly behind a crowd that's already discovered something great. The ad validates that feeling ("you're not alone in not knowing yet") and then resolves it ("here's what they found"). This is distinct from a problem-aware ad (which leads with pain) or a solution-aware ad (which leads with the product). The driver here is _social momentum_ — not suffering, not features.

The Recharm MCP server (`recharm`) is available in this plugin. Key behavioral notes:

- Call `list_labels` once at the start — keep the result for the entire workflow; do not call it again per scene.
- You do NOT build HTML. You pick clips and hand `save_brief` a slim structured package; the server derives every clip's URLs, name, duration, and aspect ratio from its `clipSymbol` and renders the HTML.
- Call `save_brief` exactly once, after the clip picks are final. Each call mints a new URL.
- Do not paginate `search_clips_visually` — use the first page only.
- Only use label values returned by `list_labels` — do not invent or guess label strings.

**Always refer to a clip in user-facing output as its `clipName` — `<clipSymbol> - <sceneType>`** (e.g. "AB - Product Reveal"). If `sceneType` is null, fall back to just the `clipSymbol`.

Follow the steps below in order.

---

## Step 1 — Confirm the brand, hook, and content constraints

**Brand:** If the user already named a brand slug (e.g. `magic_spoon`, `hike_footwear`), use it. Otherwise call `list_brands` and ask the user to pick. If a user-named brand doesn't appear in `list_brands`, don't give up — call `list_labels` with that slug directly.

**Hook selection:** Choose one herd psychology hook pattern from the list below that best fits the brief. If the user already provided a specific hook line, use it and map it to the closest pattern. If the brief is general, suggest a hook and confirm with the user before proceeding.

**Herd psychology hook patterns:**

- _Laggard FOMO_ — "Am I the only one who hasn't tried [X] yet?"
- _Trend curiosity_ — "Why is everyone suddenly obsessed with [X]?"
- _Switcher wave_ — "Why is everyone ditching [old thing] for [X]?"
- _Feed takeover_ — "Why is [X] all over my feed?"
- _Last to know_ — "Am I the last person to know about [X]?"
- _Shared discovery_ — "Have you seen why everyone is talking about [X]?"
- _Mass benefit_ — "Is everyone else seeing the benefits of [X]?"
- _Bandwagon check_ — "Is it just me, or is everyone switching to [X]?"
- _Hype investigation_ — "Why is everyone so excited about [X]?"
- _Ubiquity question_ — "Why is [X] suddenly everywhere?"

**ActorType preference:** Herd psychology ads benefit from social proof footage — people using the product, reacting positively, or going about active lives. Scan the brief and apply judgment:

- **No Actor** — purely product/environment footage (less common for this ad style)
- **Actor B-roll** — hands, partial body, people in motion (recommended for social-proof scenes)
- **Both** (No Actor + Actor B-roll) — broadest B-roll pool (good default)
- **No filter** — include all footage

Confirm the ActorType preference with the user before searching.

---

## Step 2 — Fetch available labels

Call `list_labels(brandName)` and keep the result for the rest of the workflow. Note these special-case categories if present:

- **Scene Type**: `Hook`, `Visual Hook`, `CTA`, `Product Benefits`, `Product Shot`, `Lifestyle`, `Bowl Shot`, `Box Shot`, and others.
- **Actor Type**: whether a person appears and whether they are speaking.
- **Product**: maps to specific flavors or SKUs.

---

## Step 3 — Section the brief using the herd psychology narrative arc

Herd psychology ads follow a specific arc. Break the brief into **10–14 scenes** using this structure as a guide (adapt scene counts to fit the actual brief):

| Arc segment           | Typical scenes | Purpose                                                                                                                              |
| --------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Hook**              | 1–2            | Drop the herd question. The viewer recognizes themselves as the one who hasn't joined yet.                                           |
| **Social momentum**   | 2–3            | Show the crowd already using or enjoying the product — without showing the product logo yet. Build FOMO.                             |
| **Curiosity bridge**  | 1–2            | A moment of "what is this thing?" — a close-up, a reaction, an unboxing gesture. Delay the reveal just long enough to build tension. |
| **Product reveal**    | 1–2            | The product lands clearly on screen. This is the answer to the herd question.                                                        |
| **Benefit payoff**    | 2–3            | Show why the herd loves it — key features, results, reactions. Keep it tight.                                                        |
| **Social resolution** | 1              | The viewer is now part of the in-group. Show someone thriving with the product.                                                      |
| **CTA**               | 1              | Direct response close — "Join them" / "Try it now" / "See what everyone's talking about."                                            |

For each scene capture:

- A short heading (e.g. "Hook — FOMO question over morning routine")
- 1–2 sentences describing what should appear on screen
- The arc segment it belongs to

**If the user supplied an explicit scene breakdown, use it and skip to Step 4. Otherwise, show the proposed breakdown and wait for confirmation.**

---

## Step 4 — Build search queries

For each scene, generate **2–4 search queries**. Each query has:

- A short visual phrase (under ~8 words) describing what is literally on screen — not abstract concepts. "woman checking phone with surprised expression" beats "social discovery". Vary phrases across queries.
- An optional `filters` object.

### Filter rules

**Default to lean filtering.** The text query does most of the heavy lifting. Add at most **1 label category** per query beyond the ActorType baseline. Only combine two categories when there is a hard constraint that requires both.

**ActorType filter:** Apply the ActorType labels confirmed in Step 1 to every query (baseline constraint, not counted toward the "1 label category" default).

**Scene Type filter:** Use the Scene Type matching the arc segment:

- Hook / Visual Hook for arc segment "Hook"
- Product Benefits or Lifestyle for social momentum and benefit payoff scenes
- Product Shot for product reveal
- CTA for the close
- Omit Scene Type for generic transition or reaction shots

**Product filter:** Apply the matching `Product` label for scenes where the specific product is the hero (reveal, close-up demos, CTAs). Omit for lifestyle and social-proof scenes.

---

## Step 5 — Search, section by section

**Run all first-round queries in parallel.** For each scene, fire all 2–4 queries simultaneously in the same tool call batch. Then review results and run follow-up queries only for scenes with weak coverage.

For each scene:

1. Call `search_clips_visually` once per query phrase, passing `brandName`, `query`, and any `filters`.
2. Select the **1–2 top results per query** by lowest `cosineDistance`.
3. Aim for **3–6 clips per scene** total. Deduplicate by `clipSymbol`.
4. Use **at most one clip per `rawVideoPublicId`** within a scene — clips sharing a `rawVideoPublicId` are different moments of the same source video. Keep the best (lowest cosineDistance).
5. Track, per picked clip, the **query phrase** and the **filters** used.
6. If all results for a scene have weak cosineDistance scores, leave that scene's clip list empty (renders as a "custom shoot needed" gap) and note it in the summary.

**Arc-specific search guidance:**

- **Hook scenes:** Look for clips that can read as "relatable daily life" without the product. A person on their phone, scrolling, looking curious or mildly left-out. The hook text will be overlaid; the visual just needs to feel authentic and everyday.
- **Social momentum scenes:** Search for groups, multiple people, activity shots — anything that communicates "a lot of people are doing this." Lifestyle clips with energy work well here.
- **Curiosity bridge:** Close-ups, hands reaching for something, packaging, wide eyes. The goal is tension and intrigue.
- **Product reveal / benefit / CTA:** Product Shot, Benefits, CTA Scene Types — standard search approach.

---

## Step 6 — Assemble the brief package

Build the structured package for `save_brief`:

- `title`: e.g. `"Why Is Everyone Switching?" · Herd Psychology · [Brand]`
- `scenes`: ordered scenes. Each scene:
  - `name`: the scene heading
  - `description`: 1–2 sentence on-screen description
  - `clips`: picked clips, each with `clipSymbol`, `searchString`, and `filters`
  - Empty `clips: []` for custom-shoot gaps

---

## Step 7 — Save and share the brief

Call `save_brief` exactly once with the **v2** payload:

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
  ]
})
```

Surface the returned `url` to the user as the shareable link. Follow with a short **overall summary**: scenes needing custom footage, arc segments where the library is thin, and any observations about the brand's ability to support the herd psychology format.

---

## What not to do

- Don't confuse this with a problem-aware ad (pain-led) or a solution-aware ad (product-led) — the herd psychology angle is _social momentum_, not suffering or features.
- Don't show the product too early — respect the curiosity bridge before the reveal.
- Don't use label values not returned by `list_labels`.
- Don't over-filter — default to 1 label category per query beyond ActorType.
- Don't pad picks with weak matches without flagging them.
- Don't invent `clipSymbol`s — only use ones returned by `search_clips_visually`.
- Don't refer to a clip by `clipSymbol` alone — always use `clipName` in user-facing output.
- Don't build HTML or construct clip URLs yourself — hand `save_brief` the v2 package.
- Don't call `save_brief` more than once per brief.
- Don't give up if a brand doesn't appear in `list_brands` — try `list_labels` directly.

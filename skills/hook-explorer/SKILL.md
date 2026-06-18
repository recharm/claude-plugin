---
name: "hook-explorer"
description: >
  Build a 10-hook creative brief for a brand by selecting diverse hook archetypes from a curated template bank, filling them in specifically for the brand, pairing each hook with matching Recharm b-roll clip picks (no talking heads — Actor B-Roll and No Actor only), and saving a shareable brief designed for voiceover-led ads. Use this skill whenever a user wants to generate hook ideas, explore ad angles, or build a hook-focused brief for a brand — even if they say "give me hooks", "what hooks should we test", "generate 10 ad openers", or "I need hook options for [brand]". Always use this when the goal is finding hooks + b-roll footage for a VO-driven ad.
---

# Hook Explorer

You generate 10 diverse, brand-specific hooks for a given brand, match each hook with b-roll clips from the brand's Recharm library, and save a shareable brief where each section is one hook with its opening visuals and voiceover line. All clip picks are b-roll only — no talking heads or speaking actors. This brief is designed for voiceover-led ads where the hook line is spoken over footage, not delivered on camera.

The Recharm MCP server (`recharm`) is available in this plugin.

**Key rules (same as brief-creator):**

- Call `list_labels` once at the start — reuse for the whole workflow.
- Do NOT build HTML. Hand `save_brief` a structured v2 package; the server renders everything.
- Call `save_brief` exactly once after all clip picks are final.
- Only use label values returned by `list_labels` — never invent them.
- Do not paginate `search_clips_visually` — use first page only.
- Refer to clips in user-facing output as `clipName` = `<clipSymbol> - <sceneType>`.

---

## Step 1 — Gather brand context

Ask the user for (or infer from what they've already provided):

1. **Brand slug** — e.g. `magic_spoon`, `hike_footwear`. If unknown, call `list_brands` and have them pick.
2. **Product / SKU** (optional) — a specific product or flavor to feature, if any.
3. **Target audience** — who the hooks are for (e.g. "women 25–45 interested in fitness", "busy parents").
4. **Tone** — one or two words: funny, sincere, bold, educational, aspirational, etc.
5. **Any hook styles to include or avoid** — e.g. "no skeptic hooks", "definitely include a listicle hook".

If the user's message already contains enough context, proceed without asking — state your assumptions at the top of your output.

---

## Step 2 — Fetch available labels

Call `list_labels(brandName)`. Keep the full result for the rest of the workflow.

Note these categories for use in search filters later:

- **Scene Type** — e.g. `Hook`, `Visual Hook`, `Product Shot`, `Bowl Shot`, `CTA`.
- **Actor Type** — whether a person appears and whether they're speaking. Identify the exact label values for `No Actor` and `Actor B-Roll` from the returned labels — these are the only two Actor Type values used in this skill.
- **Product** — specific SKUs or flavors. Use these when the user named a specific product.

---

## Step 3 — Select and write 10 hooks

Read `references/hook-templates.md`. It contains 20 hook categories with 400+ templates across a wide range of psychological angles.

Select **10 hooks** spanning at least **7 different categories** — variety is the whole point. Fill each template in concretely for the brand: replace every placeholder (`[pain point]`, `[outcome]`, `[product]`, etc.) with specific language that fits this brand and audience. Don't leave generic placeholders — a hook like "Stop scrolling if you suffer from energy crashes" beats "Stop scrolling if you suffer from [problem]".

For each hook, produce:

- **Hook name** — a short label, e.g. "Skeptic Test", "Bold Claim", "FOMO Scroll-Stop"
- **Hook line** — the filled-in, verbatim hook text the creator or VO would say or show on screen
- **Visual opening** — 1 sentence describing what should be on screen during this hook (this drives the Recharm search)
- **Voiceover / on-screen text** — the hook line itself, formatted as it would appear (this becomes the `description` field in the brief)

Show the 10 hooks to the user and confirm they're happy with the selection before searching for clips. If they want swaps, adjust and re-confirm.

---

## Step 4 — Search for clips, hook by hook

For each of the 10 hooks, generate **2–3 search queries** based on the visual opening from Step 3. Each query should describe what is literally on screen — concrete and visual, not abstract. Run all queries for all hooks in parallel (one big batch of calls).

### Filter rules

- **ActorType (hard constraint):** Every single query must include an Actor Type filter restricting results to **`No Actor` and `Actor B-Roll` only**. Apply both values together on every search — no exceptions. This brief is VO-only; talking heads and speaking actors are never appropriate here.
- **Scene Type:** Use `Hook` or `Visual Hook` for most hooks. For product close-up hooks, use `Product Shot`. For lifestyle/POV hooks, omit Scene Type and let the text query do the work.
- **Product:** Only apply a Product filter when the hook is specifically about a product or flavor the user named.
- Default to **at most 1 additional label category** per query beyond the ActorType constraint.

For each hook, pick **2–4 clips** by lowest `cosineDistance`. Use at most one clip per `rawVideoPublicId` within a hook to ensure visual variety.

---

## Step 5 — Assemble and save the brief

Build the v2 `save_brief` package. The brief has 10 scenes — one per hook:

- `title`: e.g. `"Magic Spoon · 10 Hook Options · Women 25-45"`
- Each `scene`:
  - `name`: the hook name (e.g. "FOMO Scroll-Stop")
  - `description`: the hook line + voiceover, formatted as:
    ```
    Hook: "[verbatim hook line]"
    VO: "[voiceover or on-screen text]"
    Visual: [1-sentence visual opening description]
    ```
  - `clips`: the picked clips for this hook's opening visual

Call `save_brief` exactly once:

```
save_brief(brandName, {
  version: "v2",
  title: "<brief title>",
  scenes: [
    {
      name: "<hook name>",
      description: "<hook line + VO + visual note>",
      clips: [
        { clipSymbol: "<symbol>", searchString: "<query phrase>", filters: { <category>: ["<label>"] } }
      ]
    }
    // ... 10 scenes total
  ]
})
```

Surface the returned `url` to the user as the shareable brief link.

---

## Step 6 — Wrap-up summary

After saving, give the user a short summary:

- Which hook categories are represented
- Any hooks where clip matches were weak (custom shoot may be needed)
- Standout clip picks worth noting
- Suggested next step (e.g. "pick 2–3 hooks to test as full briefs using brief-creator")

---

## What not to do

- Don't pick two hooks from the same category unless the user asks for it.
- Don't leave template placeholders unfilled — every hook must be specific to the brand.
- Don't invent label values — only use ones from `list_labels`.
- Don't over-filter searches — 1 label category beyond the ActorType constraint per query.
- Don't call `save_brief` more than once.
- Don't build HTML or construct clip URLs yourself.
- Don't skip Step 3 confirmation — the user should approve the hooks before you search.
- Don't pick Actor Speaking or any talking-head clips — this brief is VO-only, b-roll only.

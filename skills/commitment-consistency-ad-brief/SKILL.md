---
name: "commitment-consistency-ad-brief"
description: >
  Build a Recharm footage brief for a COMMITMENT & CONSISTENCY ad — open by surfacing an identity or goal the viewer has already claimed ('you said this was your year'), stack small yeses, then position the product as the consistent next step. Use whenever a user provides a brief, concept, or ad idea framed around keeping promises, staying on-streak, identity-based selling, micro-commitments, or New Year's-resolution energy. Searches the user's Recharm clip library and produces a shareable shot-by-shot brief with clip picks. Trigger on "commitment", "consistency", "identity ad", "keep your promise", "you said you would", "stay on track", "micro-yes", "if you're the kind of person who", or any creative where the lever is the viewer's own prior commitment. Also use for goal-callback or streak-keeper style ads.
---

# Commitment & Consistency Ad Brief

You build a Recharm footage brief for a **commitment & consistency** ad — one that opens by surfacing a commitment or identity the viewer already holds, stacks small agreements, then positions the product as the way to stay consistent with who they've said they are.

The psychological engine: people strive to act consistently with what they've already said and done. When an ad earns a small "yes" — an identity claim, a goal already declared, a value the viewer holds — the product becomes the way to honor that self-image. This is distinct from a problem-aware ad (pain-led) or a herd ad (crowd-led): the driver is *the viewer's own prior commitment*, and the tone is "stay true to yourself," never shame.

The Recharm MCP server (`recharm`) is available in this plugin. Key behavioral notes:

- Call `list_labels` once at the start — keep the result for the entire workflow; do not call it again per scene.
- Search hits from `search_clips_visually` already include `posterUrl` and `previewUrl` — use them directly. Only call `get_clip_poster_image` as a fallback if a hit is missing `posterUrl`.
- The template builds "View clip" and "Find similar" links itself from `clipSymbol`, `brand`, and `searchString` — you don't construct any Recharm app URLs.
- Do not paginate `search_clips_visually` — use the first page only.
- Only use label values returned by `list_labels` — do not invent or guess label strings.
- Do **NOT** call `save_brief`. Instead, render the brief using `templates/brief.html` and upload via `save_html_file`.

**Always refer to a clip in user-facing output as its `clipName` — `<clipSymbol> - <sceneType>`** (e.g. "AB - Product Reveal"). If `sceneType` is null, fall back to just the `clipSymbol`.

Follow the steps below in order.

---

## Step 1 — Confirm the brand, hook, and content constraints

**Brand:** If the user already named a brand slug (e.g. `magic_spoon`, `hike_footwear`), use it. Otherwise call `list_brands` and ask the user to pick. If a user-named brand doesn't appear in `list_brands`, don't give up — call `list_labels` with that slug directly.

**Hook selection:** Choose the best-fitting commitment & consistency hook pattern for the brief. If the user provided a specific hook line, use it and map it to the closest pattern. Make your pick, write a one-sentence rationale, and note why you're rejecting the others — you'll need all of this for the final brief output.

**Commitment & Consistency hook patterns:**
- *Identity Check* — "If you're the kind of person who [X], keep watching."
- *Goal Callback* — "Remember when you said this was the year you'd [X]?"
- *Micro-Yes* — "Agree that [obvious truth]? Then you already agree with what's next."
- *Streak Keeper* — "You didn't come this far to only come this far."
- *Values Mirror* — "You care about [value] — so why is your [category] working against it?"
- *Resolution Rescue* — "Your January goal called. It's not dead yet."
- *Public Promise* — "You told everyone you'd [X]. Here's the easy way to actually keep it."
- *Small-Step Ladder* — "Start with ten seconds a day. That's it. That's the whole ask."
- *Already-Doing-It* — "You're already [adjacent habit] — this just finishes the job."
- *Consistency Test* — "Would the [ideal-self] version of you skip this?"

**ActorType preference:** Commitment ads need footage of routine and follow-through — people mid-habit. Confirm with the user:
- **No Actor** — purely product/environment footage
- **Actor B-roll** — hands, partial body, people in motion (recommended)
- **Both** (No Actor + Actor B-roll) — good default
- **No filter** — include all footage

**Brand-fit rationale:** While confirming, form a view on *why commitment & consistency will work for this specific brand* — what commitment or identity do its buyers already hold (fitness goals, health resolutions, values) that the product can credibly serve as the next consistent step for? You'll write this into the brief's `why.brandFit` field in Step 6 so anyone opening the brief understands the strategy, not just the shot list.

---

## Step 2 — Fetch available labels

Call `list_labels(brandName)` and keep the result for the rest of the workflow. Note:
- **Scene Type**: `Hook`, `Visual Hook`, `CTA`, `Product Benefits`, `Product Shot`, `Lifestyle`, `Bowl Shot`, `Box Shot`, etc.
- **Actor Type**: whether a person appears and whether they are speaking.
- **Product**: maps to specific flavors or SKUs.

---

## Step 3 — Section the brief using the commitment & consistency narrative arc

Break the brief into **10–14 scenes** using this arc:

| Arc segment | Typical scenes | Purpose |
|---|---|---|
| **Hook** | 1–2 | Surface a commitment or identity the viewer already holds — earn the first small yes. |
| **Micro-Yes Ladder** | 2–3 | Stack small agreements: relatable moments that make the viewer nod along, each one a tiny commitment. |
| **Identity Mirror** | 1–2 | Show the viewer's ideal self in action — the person they've committed to being, just out of reach. |
| **Product Reveal** | 1–2 | The product lands as the tool that keeps the commitment — the bridge between claimed identity and daily behavior. |
| **Benefit Payoff** | 2–3 | Show how easy consistency becomes — results, effortless routine integration, visible progress. |
| **Commitment Lock** | 1 | Identity and product now aligned — the viewer's future self, on-streak and thriving. |
| **CTA** | 1 | "Keep your promise" / "Stay consistent" / "Finish what you started." |

For each scene capture:
- `name`: short heading (e.g. "Hook — lacing up running shoes at dawn")
- `description`: 1–2 sentences describing what appears on screen
- `arcSegment`: one of the 7 arc segment names above (must match exactly — the HTML uses these for color-coding)

**If the user supplied an explicit scene breakdown, use it. Otherwise show the proposed breakdown and wait for confirmation.**

---

## Step 4 — Build search queries

For each scene, generate **3–5 search queries** — short visual phrases (under ~8 words) describing what is literally on screen, not abstract concepts. Vary phrases to cover different subjects, framings, and environments. You need enough query diversity to surface **4 strong, visually distinct clips per scene** — a single query rarely gets you there.

### Filter rules
- Apply ActorType labels to every query (baseline, not counted toward the category limit).
- Add at most **1 additional label category** per query (Scene Type or Product).
- Use Scene Type matching the arc segment: Hook/Visual Hook for the hook; Lifestyle/Product Benefits for the middle segments; Product Shot for the reveal; CTA for the close.
- Apply Product label only for scenes where the specific SKU is the hero.

---

## Step 5 — Search and collect clip media

**Run all first-round queries in parallel** (all 3–5 queries per scene in one batch). Then fill gaps with follow-up queries only where needed.

For each scene:
1. Call `search_clips_visually` with `brandName`, `query`, and any `filters`.
2. Pool the results from all of the scene's queries and pick the **4 best clips** — rank primarily by lowest `cosineDistance`, but prefer visual variety (different framings, subjects, environments) over four near-identical picks.
3. Deduplicate by `clipSymbol`. Use **at most one clip per `rawVideoPublicId`** — clips sharing a source video look near-identical; keep the best (lowest cosineDistance).
4. If a scene has fewer than 4 strong matches after the first round, run 1–2 follow-up queries with different phrasings before settling for fewer. A scene may ship with 2–3 clips if the library is genuinely thin — never pad with weak matches (cosineDistance well into the "weak" range) just to hit 4.
5. Take `posterUrl` and `previewUrl` directly from the search hit. If a hit is missing `previewUrl` and has a `rawVideoPublicId`, derive it: `https://res.cloudinary.com/recharm/video/upload/so_0,eo_4,q_auto,f_auto/{rawVideoPublicId}.mp4`.
6. Track per clip: `clipSymbol`, `clipName`, `posterUrl`, `previewUrl`, `cosineDistance`, `searchString`, `filters`. `searchString` must be the **exact query string** used in the `search_clips_visually` call that surfaced the clip — the template uses it to build the "Find similar" link, which reopens the full visual-search result set (including the clips you considered but rejected). The template also builds each "View clip" link from `clipSymbol`, so `clipSymbol` must be exactly as returned.
7. Scenes with no strong matches → `clips: []` (renders as "custom shoot needed" gap in the HTML).

**Arc-specific search guidance:**
- **Hook:** Mirror moments, journaling, goal boards, calendars, lacing up shoes — visuals of intention and identity.
- **Micro-Yes Ladder:** Relatable daily-habit footage the target buyer instantly recognizes as their own life.
- **Identity Mirror:** Aspirational-but-attainable routines — disciplined mornings, consistent workouts, organized kitchens.
- **Product Reveal / Benefit / CTA:** Product Shot, Benefits, CTA Scene Types; favor footage showing the product inside an established routine.

---

## Step 6 — Assemble the JSON data payload

Build this object — the HTML template renders everything from it:

```json
{
  "title": "<e.g. 'Finish What You Started · Magic Spoon · Frosted'>",
  "brand": "<brandName slug>",
  "generatedAt": "<YYYY-MM-DD>",
  "filterChips": [
    { "category": "Actor Type", "value": "Actor B-Roll" },
    { "category": "Actor Type", "value": "No Actor" },
    { "category": "Product", "value": "Frosted" },
    { "category": "Scenes", "value": "12" }
  ],
  "why": {
    "explainer": "<2–3 sentences: what a commitment & consistency ad is and the mechanism that makes it convert — small yeses and claimed identities create pressure to follow through, and the product becomes the way to stay consistent. Written for someone who has never heard the term.>",
    "brandFit": "<2–3 sentences: why this mechanism fits THIS brand specifically — its category, how its buyers decide, and the context that makes the commitment & consistency angle credible.>"
  },
  "hook": {
    "pattern": "<Pattern name, e.g. 'Goal Callback'>",
    "line": "<The actual hook line, e.g. 'Remember when you said this was the year you'd fix breakfast?'>",
    "rationale": "<1–2 sentences: why this hook fits this brand and audience>"
  },
  "rejectedHooks": [
    {
      "pattern": "<Pattern name>",
      "line": "<What the hook line would have been>",
      "reason": "<1 sentence — specific reason this pattern is a weaker fit here>"
    }
  ],
  "actorType": "<e.g. 'Both (Actor B-Roll + No Actor)'>",
  "scenes": [
    {
      "name": "<Scene heading>",
      "arcSegment": "<Exactly one of: Hook | Micro-Yes Ladder | Identity Mirror | Product Reveal | Benefit Payoff | Commitment Lock | CTA>",
      "description": "<1–2 sentences of on-screen description>",
      "clips": [
        {
          "clipSymbol": "<symbol>",
          "clipName": "<clipName from search result>",
          "posterUrl": "<posterUrl from the search hit>",
          "previewUrl": "<previewUrl from the search hit, or derived from rawVideoPublicId, or null>",
          "cosineDistance": 0.142,
          "searchString": "<exact query phrase used to find this clip>",
          "filters": { "<category>": ["<label>"] }
        }
      ]
    }
  ]
}
```

Notes:
- `filterChips` is what renders under the title — one chip per applied footage filter. Include every ActorType label applied, any Product/Scene Type filters used broadly, and a `Scenes` count chip. Keep values short (chip-sized) — this replaces the old prose subtitle.
- `why.explainer` and `why.brandFit` render as a prominent "Why this approach" panel — write them for a reader who has never heard of the commitment & consistency lever and needs to be convinced it fits their brand. Target **4 clip picks per scene** in `clips`.
- Include **at least 5 rejected hooks** in `rejectedHooks` with specific, brand-aware reasons so the user understands the creative logic behind the chosen pattern.

---

## Step 7 — Render and save the brief

1. **Read** `templates/brief.html` (in this skill's directory).
2. **Replace** the exact string `__BRIEF_DATA_JSON__` with the JSON payload (serialized as a single string — no pretty-printing needed, just ensure it is valid JSON). After serializing, replace every `</` with `<\/` in the JSON string — the payload lives inside an inline `<script>` tag, and an unescaped `</` in any text field would terminate the script and break the whole page.
3. **Call the Recharm MCP `save_html_file` tool** with:
   - `brandName`: the brand slug used throughout this workflow
   - `html`: the fully rendered HTML string (max 20 MB)

   This uploads the HTML to Recharm's public-share storage and returns a shareable `url`.
4. **Surface the `url`** to the user.
5. Give a short **summary**: custom-shoot gaps, scenes that shipped with fewer than 4 clips, arc segments with thin library coverage, any weak-match clips flagged.

---

## What not to do

- Don't confuse this with a problem-aware ad — the lever isn't pain, it's the gap between what the viewer committed to and what they're doing.
- Don't shame — "you failed" kills the mechanism. The tone is always "stay true to yourself," honoring the commitment rather than punishing the lapse.
- Don't reveal the product before the Identity Mirror — protect the tension arc.
- Don't settle for 1 clip per scene — the brief is a menu, not a lock; editors need 4 options per scene to cut alternates.
- Don't pad to 4 clips with weak matches — 2–3 strong picks beat 4 with a dud.
- Don't drop `posterUrl`/`previewUrl` from search hits — the template needs them for thumbnails and hover previews.
- Don't add download links — raw downloadable video URLs aren't available; "View clip" and "Find similar" open in the Recharm app.
- Don't call `save_brief` — use the Recharm MCP `save_html_file` tool with `brandName` + `html`.
- Don't use label values not returned by `list_labels`.
- Don't over-filter — default to 1 label category per query beyond ActorType.
- Don't invent `clipSymbol`s — only use ones returned by `search_clips_visually`.
- Don't refer to a clip by `clipSymbol` alone — always use `clipName` in user-facing output.
- Don't paraphrase `searchString` — it must be the exact query used, or the visual-search results link in the brief won't reproduce the search.
- Don't call `save_html_file` more than once per brief — each call mints a new URL.
- Don't give up if a brand doesn't appear in `list_brands` — try `list_labels` directly.

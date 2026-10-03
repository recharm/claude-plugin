---
name: "authority-ad-brief"
description: >
  Build a Recharm footage brief for an AUTHORITY ad — borrow the credibility of experts, credentials, science, or institutions so the viewer defers to trusted judgment instead of evaluating from scratch. Use whenever a user provides a brief, concept, or ad idea framed around expert endorsement, 'doctor recommended', 'formulated by', scientific backing, certifications, pro-grade positioning, or credential-led trust. Searches the user's Recharm clip library and produces a shareable shot-by-shot brief with clip picks. Trigger on "authority", "expert ad", "doctor recommended", "dermatologist", "nutritionist", "scientifically proven", "lab tested", "what the pros use", or any creative fronted by one qualified voice rather than a crowd. Distinct from social proof (many ordinary voices) — authority is one credible expert voice.
---

# Authority Ad Brief

You build a Recharm footage brief for a **authority** ad — one that borrows the credibility of experts, credentials, science, or institutions so the viewer defers to trusted judgment instead of evaluating from scratch.

The psychological engine: people defer to legitimate expertise. When a credible authority — a doctor, coach, scientist, certification body — vouches for the product, evaluation shortcuts to trust. This is distinct from social proof (many ordinary voices — this is *one qualified voice*), from liking (warmth), and from herd psychology (crowd feeling). The ad must establish the credential before spending it.

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

**Hook selection:** Choose the best-fitting authority hook pattern for the brief. If the user provided a specific hook line, use it and map it to the closest pattern. Make your pick, write a one-sentence rationale, and note why you're rejecting the others — you'll need all of this for the final brief output.

**Authority hook patterns:**
- *Expert Confession* — "A [dermatologist] told me to stop doing this immediately."
- *Credential Open* — "I've spent 15 years as a [profession]. This is what I actually use."
- *Science Lead* — "The study that changed how I think about [category]."
- *Formulated-By* — "Designed by [experts] who got tired of what's on shelves."
- *Insider Warning* — "As a [profession], here's what I'd never buy."
- *Award Stack* — "Backed by [certification], tested by [lab], used by [pros]."
- *Myth Bust* — "A [expert] debunks the biggest [category] myth."
- *Pro Standard* — "What [pros/athletes] use when nobody is sponsoring them."
- *Checklist Authority* — "The three things a [expert] checks before buying any [category]."
- *White Coat Reveal* — "Turns out your [doctor] was right about this one."

**ActorType preference:** Authority ads need footage that reads competent and credible — precision, professional settings, mastery. Confirm with the user:
- **No Actor** — purely product/environment footage
- **Actor B-roll** — hands, partial body, people in motion (recommended)
- **Both** (No Actor + Actor B-roll) — good default
- **No filter** — include all footage

**Brand-fit rationale:** While confirming, form a view on *why authority will work for this specific brand* — what real credentials, experts, studies, or certifications does it have to spend, and will its buyers recognize that authority as legitimate? You'll write this into the brief's `why.brandFit` field in Step 6 so anyone opening the brief understands the strategy, not just the shot list.

---

## Step 2 — Fetch available labels

Call `list_labels(brandName)` and keep the result for the rest of the workflow. Note:
- **Scene Type**: `Hook`, `Visual Hook`, `CTA`, `Product Benefits`, `Product Shot`, `Lifestyle`, `Bowl Shot`, `Box Shot`, etc.
- **Actor Type**: whether a person appears and whether they are speaking.
- **Product**: maps to specific flavors or SKUs.

---

## Step 3 — Section the brief using the authority narrative arc

Break the brief into **10–14 scenes** using this arc:

| Arc segment | Typical scenes | Purpose |
|---|---|---|
| **Hook** | 1–2 | Lead with the authority signal — credential, uniform, lab, professional setting. The viewer registers "qualified voice" instantly. |
| **Credential Stack** | 2–3 | Establish why this voice is trusted — expertise in action, professional environments, mastery on display. |
| **Expert Insight** | 1–2 | The authority's key insight or standard — what most products in the category get wrong. Tension before the answer. |
| **Product Reveal** | 1–2 | The product that meets the expert's standard — the one that passes the test. |
| **Benefit Payoff** | 2–3 | Evidence the expert would cite — ingredients, mechanisms, measurable results. |
| **Endorsement Seal** | 1 | The trust moment — confident daily use, the professional's own choice. |
| **CTA** | 1 | "Expert-approved" / "Try what the pros use." |

For each scene capture:
- `name`: short heading (e.g. "Hook — nutrition label inspected in bright kitchen")
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
- **Hook:** Professional settings — labs, kitchens-as-workspaces, gyms with coaching energy, clean clinical environments.
- **Credential Stack:** Competence footage — precise measuring, careful preparation, athletic performance, focused work.
- **Expert Insight:** Ingredient close-ups, label inspection, side-by-side comparison gestures, analytical beats.
- **Product Reveal / Benefit / CTA:** Product Shot, Benefits, CTA Scene Types; favor clean, precise, "specification-grade" framing.

---

## Step 6 — Assemble the JSON data payload

Build this object — the HTML template renders everything from it:

```json
{
  "title": "<e.g. 'What Nutritionists Actually Eat · Magic Spoon · Frosted'>",
  "brand": "<brandName slug>",
  "generatedAt": "<YYYY-MM-DD>",
  "filterChips": [
    { "category": "Actor Type", "value": "Actor B-Roll" },
    { "category": "Actor Type", "value": "No Actor" },
    { "category": "Product", "value": "Frosted" },
    { "category": "Scenes", "value": "12" }
  ],
  "why": {
    "explainer": "<2–3 sentences: what a authority ad is and the mechanism that makes it convert — a qualified, credible voice lets buyers shortcut evaluation and defer to trusted judgment. Written for someone who has never heard the term.>",
    "brandFit": "<2–3 sentences: why this mechanism fits THIS brand specifically — its category, how its buyers decide, and the context that makes the authority angle credible.>"
  },
  "hook": {
    "pattern": "<Pattern name, e.g. 'Credential Open'>",
    "line": "<The actual hook line, e.g. 'I've spent 15 years as a nutritionist. This is what I actually eat.'>",
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
      "arcSegment": "<Exactly one of: Hook | Credential Stack | Expert Insight | Product Reveal | Benefit Payoff | Endorsement Seal | CTA>",
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
- `why.explainer` and `why.brandFit` render as a prominent "Why this approach" panel — write them for a reader who has never heard of the authority lever and needs to be convinced it fits their brand. Target **4 clip picks per scene** in `clips`.
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

- Don't confuse authority with social proof — proof is many ordinary voices; authority is one qualified voice. If the angle is review counts and testimonials, use social-proof-ad-brief.
- Don't use authority claims the brand can't substantiate — real credentials, real studies, real certifications only. Invented expertise is a legal risk; flag anything that seems fabricated.
- Don't reveal the product before the Expert Insight — protect the tension arc.
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

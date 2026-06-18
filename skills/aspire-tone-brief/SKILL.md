---
name: "aspire-tone-brief"
description: >
  Build a Recharm footage brief for an ad anchored in an optimistic purchasing emotion — show the prospect already thriving, not suffering from a problem. Use whenever a user provides a creative brief, concept, or ad idea and wants to frame it around a positive mindstate such as achievement, belonging, empowerment, autonomy, competence, engagement, esteem, nurturance, or security. Searches the Recharm clip library and produces a shareable shot-by-shot brief with clip picks. Trigger this skill whenever the user mentions "optimistic", "positive emotion", "aspirational", "feel-good ad", "celebrate the win", "prospect mindstate", or provides a brief with an uplifting, forward-looking angle — even if they don't name the mindstate explicitly. Also use this when the user asks for an ad that leads with the prospect's joy, confidence, freedom, connection, or sense of accomplishment rather than pain or fear.
---

# Aspire Tone Brief

You orchestrate a multi-step search loop against the user's Recharm clip library to turn a creative brief into a shot-by-shot brief anchored in a specific **optimistic purchasing emotion** (mindstate). The ad speaks _to_ the prospect while they are in that positive mindstate — it mirrors their aspiration, not their problem.

The Recharm MCP server (`recharm`) is available in this plugin. Key behavioral notes:

- Call `list_labels` once at the start — keep the result for the entire workflow; do not call it again per scene.
- You do NOT build HTML. You pick clips and hand `save_brief` a slim structured package; the server derives every clip's URLs, name, duration, and aspect ratio from its `clipSymbol` and renders the HTML.
- Call `save_brief` exactly once, after clip picks are final. Each call mints a new URL.
- Do not paginate `search_clips_visually` — use the first page only.
- Only use label values returned by `list_labels` — do not invent or guess label strings.

**Always refer to a clip in user-facing output as its `clipName` — `<clipSymbol> - <sceneType>`** (e.g. "AB - Product Reveal"). If `sceneType` is null, fall back to just the `clipSymbol`.

This skill processes one video at a time. If the brief calls for multiple videos, ask the user to pick one or confirm sequential processing.

Follow the steps below in order.

---

## The Nine Optimistic Mindstates

Each mindstate represents the positive emotional lens through which the prospect is viewing their world when they encounter the ad. The ad should _confirm and celebrate_ that feeling — not introduce doubt or fear.

| Mindstate                  | Core desire                                  | What the ad celebrates                            |
| -------------------------- | -------------------------------------------- | ------------------------------------------------- |
| **Optimistic Achievement** | Success, accomplishing goals                 | The win, the milestone, the earned result         |
| **Optimistic Autonomy**    | Freedom, self-expression, personal choice    | Being the author of one's own story               |
| **Optimistic Belonging**   | Connection, shared experiences, community    | Togetherness, tribe, being part of something      |
| **Optimistic Competence**  | Improvement, growth, doing one's best        | Getting better, leveling up, mastering something  |
| **Optimistic Engagement**  | Pleasure, excitement, full immersion in life | Joy, vitality, savoring the moment                |
| **Optimistic Empowerment** | Handling challenges, feeling capable         | Strength, readiness, rising to occasions          |
| **Optimistic Esteem**      | Recognition, appreciation, self-confidence   | Being seen, valued, proud of who you are          |
| **Optimistic Nurturance**  | Compassion, feeling loved, caring for others | Warmth, being cherished, giving or receiving care |
| **Optimistic Security**    | Safety, protection, peace of mind            | Confidence in the future, freedom from worry      |

---

## Step 1 — Identify the target mindstate(s)

**From the brief:** Read it for emotional cues — words like "earned it", "finally free", "part of something", "getting stronger", "peace of mind", etc. Map these to one or two mindstates from the table above.

**Ask for confirmation:** Present your read to the user:

> "I'm reading this as an **Optimistic [X]** ad — the prospect is feeling [brief description of what they're experiencing]. Does that resonate, or would you like to shift the emotional angle?"

If the brief is silent on emotion, ask the user to pick one. Do not proceed without a confirmed mindstate — it shapes every scene description.

**One primary mindstate:** Use at most two mindstates per brief. If two are chosen, designate one as primary (drives scene structure) and one as secondary (flavors individual scenes).

---

## Step 2 — Confirm the brand and content constraints

**Brand:** If the user already named a brand slug (e.g. `magic_spoon`, `hike_footwear`), use it. Otherwise call `list_brands` and ask the user to pick. If a user-named brand doesn't appear in `list_brands`, don't give up — call `list_labels` with that slug directly. Many brands work even when absent from the brands listing.

**ActorType preference:** By default, apply **both Actor B-roll and No Actor** labels to every search query — this gives the broadest b-roll pool while excluding talking heads, which tend to feel too direct for optimistic emotion-led ads. Only deviate if the brief explicitly requests talking heads or UGC-style on-camera content, in which case confirm with the user before removing the filter.

---

## Step 3 — Fetch available labels

Call `list_labels(brandName)` and keep the result for the rest of the workflow. Note these special-case categories if present:

- **Scene Type**: each clip belongs to exactly one Scene Type (`Hook`, `CTA`, `Product Benefits`, `Product Shot`, `Bowl Shot`, `Box Shot`, `Pouring Cereal`, etc.)
- **Actor Type**: whether a person appears and whether they are speaking
- **Product**: specific flavors or SKUs

---

## Step 4 — Section the brief through the mindstate lens

Read the brief and break it into **ordered scenes**. Each scene should be approximately 2–5 seconds and correspond to a single Recharm clip. Cap the total at **18 scenes**.

**Mindstate-driven scene architecture:** Structure scenes to take the viewer on an emotional arc _within_ the chosen mindstate — starting from a moment that resonates with their current positive feeling, deepening it, and closing with the product as a natural extension of that feeling.

Typical arc shapes by mindstate:

- **Achievement / Competence / Empowerment:** Open on effort or momentum → show the peak moment / the win → product as the trusted companion that got them there.
- **Belonging / Nurturance:** Open on connection or warmth → deepen the shared moment → product as part of the ritual or gift.
- **Autonomy / Engagement:** Open on freedom or pleasure → show full immersion in the experience → product as the enabler.
- **Esteem:** Open on a confident, proud moment → amplify with recognition → product as a natural choice for someone like them.
- **Security:** Open on calm confidence → show life running smoothly → product as the quiet guardian of that peace.

For each scene capture:

- A short heading (e.g. "Hook — athlete cresting a hill at sunrise")
- 1–2 sentences describing what should appear on screen
- The **emotional beat** — what the viewer is feeling in this moment and how it ties to the mindstate
- The narrative role (hook / build / peak / product reveal / CTA)

**Show the proposed scene breakdown to the user and wait for confirmation before searching.**

---

## Step 5 — Build search queries

For each scene, generate **2–4 search queries**. Each query has:

- A short visual phrase (under ~8 words) describing what is literally on screen. Be concrete and visual — "woman crossing finish line arms raised" beats "achievement". Vary phrases to cover different subjects, framings, and environments.
- An optional `filters` object.

### Filter rules

**Default to lean filtering.** The text query does most of the heavy lifting. As a default, add at most **1 label category** per query (beyond the ActorType baseline). Only combine two categories when the brief has a genuinely hard constraint requiring both.

**ActorType filter:** Apply Actor B-roll and No Actor labels to every query (the default). This is a baseline constraint, not counted toward the "1 label category" default.

**Scene Type filter:** Use the Scene Type that best matches the scene's narrative role: `Hook` / `Visual Hook` for openers; product-specific types for food/product B-roll; `CTA` for closers.

**Product filter:** If the brief names a specific flavor or SKU, apply the matching `Product` label on queries where the product is the hero.

---

## Step 6 — Search, section by section

**Run all first-round queries in parallel** — fire all 2–4 queries per scene simultaneously in the same tool call batch.

For each scene:

1. Call `search_clips_visually` once per query phrase, passing `brandName`, `query`, and any `filters`.
2. Select the **1–2 top results per query** by lowest `cosineDistance`.
3. Aim for **3–6 clips per scene** total. Deduplicate by `clipSymbol`.
4. Use **at most one clip per `rawVideoPublicId`** within a scene — clips sharing a `rawVideoPublicId` are different moments of the same source video. Keep the best.
5. Track, per picked clip, the **query phrase** and **filters** used — both go into the brief package.
6. If all results for a scene have weak scores, leave that scene's clip list empty (renders as "custom shoot needed") and note it in the summary.

**Mindstate alignment check:** As you review results, notice whether clips feel emotionally congruent with the mindstate. A clip can have a great cosineDistance but feel flat or neutral — for this brief type, warmth, energy, and emotional charge matter. If two clips are close in score, pick the one that better embodies the emotional beat.

---

## Step 7 — Assemble the brief package

Do **not** write HTML. Build a slim structured package:

- `title`: e.g. `"Magic Spoon · Optimistic Achievement · Runner's Morning"`
- `scenes`: ordered scenes. Each scene:
  - `name`: the scene heading
  - `description`: the 1–2 sentence on-screen description **plus** a parenthetical emotional beat note, e.g. `"Close-up of hands lacing up trail shoes before a run. (Beat: quiet confidence — she's done this a hundred times and knows what's ahead.)"`
  - `clips`: picked clips. Each clip:
    - `clipSymbol`
    - `searchString`
    - `filters`
  - Empty `clips` array for custom shoot scenes.

---

## Step 8 — Save and share the brief

Call `save_brief` exactly once with the **v2** payload:

```
save_brief(brandName, {
  version: "v2",
  title: "<brief title>",
  scenes: [
    {
      name: "<scene heading>",
      description: "<on-screen description + emotional beat note>",
      clips: [
        { clipSymbol: "<symbol>", searchString: "<query phrase>", filters: { <category>: ["<label>"] } }
      ]
    }
  ]
})
```

Surface the returned `url` as the shareable link. Then give the user a short **overall summary**:

- Which mindstate(s) the brief targets and how the arc lands
- Scenes needing custom footage
- Any emotional-alignment gaps (scenes where the best clips feel tonally off)
- Cross-cutting observations about the library's depth for this mindstate

---

## What not to do

- Don't skip the mindstate confirmation step — it's the whole point of this brief type.
- Don't describe scenes in abstract terms — visual specificity drives better search results.
- Don't use label values not returned by `list_labels`.
- Don't over-filter — default to 1 label category per query (beyond ActorType).
- Don't pad picks with weak matches without noting it.
- Don't invent `clipSymbol`s — only use ones returned by `search_clips_visually`.
- Don't refer to a clip by `clipSymbol` alone in user-facing output — always use `clipName`.
- Don't build HTML or construct clip URLs — hand `save_brief` the v2 package.
- Don't call `save_brief` more than once or before clip picks are final.
- Don't give up if a user-named brand doesn't appear in `list_brands` — try `list_labels` directly.

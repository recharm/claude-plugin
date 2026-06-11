---
name: unaware-ad-brief
description: Build a Recharm footage brief for an UNAWARE-market ad — symptom-led, educate-then-sell. Use whenever a brief, script, or storyboard targets cold or top-of-funnel audiences, or the user mentions "unaware", "cold traffic", "doesn't know they have a problem", or wants an ad that opens on a symptom or relatable moment rather than the product. Searches the user's Recharm clip library and produces a shareable shot-by-shot brief with clip picks. If the user asks for ad footage but the audience awareness level is unclear, ask whether the audience is unaware, problem-aware, or solution-aware before picking a skill.
---

# Unaware-Market Ad Brief

Turn a creative brief aimed at an **unaware market** — people who don't yet know they have a problem — into a shot-by-shot footage brief with concrete clip picks from the user's Recharm library, via the `recharm` MCP server.

An unaware-market ad must earn the right to sell. It opens on a **symptom** the viewer recognizes from their own life, **diagnoses** the underlying problem, and only then introduces the product. Selling too early loses this audience entirely — that is why the stage order below is enforced, not suggested.

## The five stages — enforce strictly

Every scene belongs to exactly one stage, and stages appear in this order:

1. **Symptom** — open on a relatable, *felt* experience. No product, no problem-naming yet. (e.g. "she keeps finding hair on her pillow", "he tugs at pants that don't fit right".)
2. **Diagnose with problem** — name and explain the underlying problem behind the symptom. Educational and authority footage belongs here (expert talking, animation, close-ups of the cause).
3. **Introduce solution** — reveal the product as the answer to the diagnosed problem.
4. **Answer objections / questions / increase trust** — proof: testimonials, demos, before/after, credentials, ingredients, durability tests.
5. **Where to buy** — CTA: website, store, offer.

Scene budget: 10–18 scenes total (each scene ≈ 2–5 s, one Recharm clip). Weight scenes toward stages 1–2 — the education work is what this ad type does that others skip. If the user's brief skips a stage or reorders stages, point out the conflict with the unaware framework and ask before proceeding.

## Recharm mechanics (read once, applies throughout)

- Call `list_labels(brandName)` once at the start and keep the result; never invent label values or category names — use the exact strings returned (category names vary by brand: `Scene Type` vs `SceneType`, etc.).
- `search_clips_visually` returns slim hits: `clipSymbol`, `clipName`, `rawVideoPublicId`, `sceneType`, `cosineDistance` (lower = closer), `durationMs`, `categoriesAndLabels` (populated only for top hits). Never fetch poster or sprite images; pick on metadata only. Use only the first page — don't paginate.
- Refer to clips in all user-facing output by `clipName` (`<clipSymbol> - <sceneType>`), never bare `clipSymbol`.
- Call `save_brief` exactly once, after picks are final. The server renders the HTML — never build HTML or clip URLs yourself.
- One video per run. If the brief calls for multiple videos, ask the user whether to run per-video sequentially or pick one.

## Workflow

### Step 0 — Create a granular task list

Before any searching, create a visible task list with one task per stage — "Search Symptom scenes", "Search Diagnose scenes", "Search Solution-intro scenes", "Search Trust scenes", "Search Where-to-buy scenes" — plus "Confirm scene breakdown", "Establish primary creator", "Assemble & save brief", and "Explain picks & gaps". Mark each in progress and complete as you go. The searches take a while; granular tasks let the user watch the work happen stage by stage and catch a wrong turn early instead of at the end.

### Step 1 — Confirm the brand

Use the brand slug if the user named one; otherwise call `list_brands` and ask. Never guess between candidates.

### Step 2 — Fetch labels

Call `list_labels(brandName)`. Note which categories exist for: scene type, creator, actor type, product, age/gender. You'll use them below.

### Step 3 — Section the brief into the five stages

Break the brief into ordered scenes, each tagged with its stage. For each scene capture a short heading, 1–2 sentences of what's on screen, and the stage. If the user supplied an explicit scene breakdown, map it onto the stages (flagging conflicts); otherwise **show the proposed breakdown grouped by stage and wait for confirmation before searching**. If a transcript/VO is provided, use it to inform what each scene shows, but section independently of transcript timing.

### Step 4 — Establish the primary creator

UGC-style ads fall apart when the on-camera person changes between cuts — viewers read it as an edit, not a story, and trust drops. So pick one **primary creator** and stick with them:

1. If the brief names a creator, match it to a label in the creator category (ask if ambiguous).
2. Otherwise run the Stage 1 (Symptom) searches first with no creator filter. From the top hits' creator labels, shortlist creators who match the brief's audience (use age/gender labels where present). Run 1–2 quick probe searches filtered by each shortlisted creator against a *later-stage* need (e.g. a testimonial or demo) to check they have coverage across the ad — then commit to the one with the best combined match + coverage.
3. Add the creator filter (e.g. `Creator: ["<primary>"]`) to every scene where a person is on camera. Pure product shots / no-actor b-roll don't need it, but if hands or body appear, still prefer the primary creator.
4. If a creator-filtered search returns nothing usable, retry the same filter with a broader query phrase first; only then drop the filter. Any scene that uses a different creator must say so explicitly in its reasoning and in the final summary ("Scene 7 breaks creator consistency: needed Jill, library only has Lauren for this shot").

Tell the user which creator you chose and why before continuing.

### Step 5 — Build queries per scene

2–4 queries per scene. Each query is a short visual phrase (< ~8 words) describing what is literally on screen — "woman finding hair in shower drain" beats "hair loss anxiety". Vary subject/framing/environment across queries. Filters: 0–3 categories, 1–2 labels each.

- **Scene-type filter:** map the stage to the closest scene-type labels in the label list (Symptom → hook/problem-style labels; Diagnose → problem/educational/authority labels; Introduce solution → product intro/solution labels; Trust → testimonial/demo/before-after labels; Where to buy → CTA/website labels). Use multiple labels in the category to broaden (OR within a category).
- **Actor-type filter (transcript rule):** if a transcript/VO was provided AND an actor-type category exists, add the b-roll/no-actor labels as a hard filter on every query (a VO will be laid over the footage, so on-camera speech would clash). Omit if the category doesn't exist.
- **Product filter:** if a product was named, match it to a product-category label (ask if unsure which). Product filters belong on stage 3–5 scenes; stages 1–2 should normally be product-free — that's the point of this ad type.
- Don't over-filter: AND across categories shrinks results fast. Creator + scene type is usually enough.

### Step 6 — Search and pick, stage by stage

Work through stages in order, updating the task list. Per scene: run each query once, take the 1–2 best hits per query by `cosineDistance`, dedupe by `clipSymbol` (attribute to the best-scoring query), keep at most one clip per `rawVideoPublicId` within a scene, and aim for 3–6 picks. Track per pick the query phrase and filters used — both go into the brief package.

**Be aggressive about declaring gaps.** A wrong clip is worse than no clip: it costs the editor a download-and-reject cycle and hides a real library gap the brand should fill with a shoot. Apply this bar:

- A pick must *literally show* what the scene requires. If a hit's `sceneType` or labels contradict the scene (a CTA clip offered for a symptom scene), reject it regardless of distance.
- Treat a best distance that is much worse than your other scenes' results as a red flag, not a least-bad winner.
- If nothing passes, leave the scene's `clips` empty — it renders as a "custom shoot needed" gap. That is a *good* outcome: it tells the brand exactly what to shoot. Never pad with weak matches, and never include a clip you'd have to caveat with "sort of".
- Expect gaps. Unaware-market ads need symptom and diagnosis footage most libraries are thin on. A brief with zero gaps usually means the bar was too low.

### Step 7 — Assemble and save

Build the v2 package — `title`, ordered `scenes` (`name` prefixed with its stage, e.g. "Symptom — hair on the pillow", `description`, `clips` with `clipSymbol`/`searchString`/`filters`; empty `clips` for gaps) — and call `save_brief(brandName, {version: "v2", ...})` once. Surface the returned `url`. If the call fails, report it and show the package.

### Step 8 — Explain your work

Your reasoning is part of the deliverable. After saving, give the user:

- **Per scene, 1–2 lines:** stage, the winning query, why the top pick won (distance rank, matching labels, creator), and anything notable you rejected and why.
- **Creator-consistency report:** the primary creator, which scenes hold the line, which break it and why.
- **Gap report:** every "custom shoot needed" scene with a one-line shoot suggestion.
- **Library observations:** patterns the brand should know (e.g. "almost no product-free symptom footage — top-of-funnel ads will keep hitting this wall").

Keep in-progress narration brief — a line at each stage transition — and put the substance in this final summary.

## What not to do

- Don't sell before stage 3 — no product in Symptom or Diagnose scenes unless the user insists.
- Don't fetch poster/sprite images, paginate searches, invent label values or `clipSymbol`s, or call `save_brief` more than once.
- Don't pad thin scenes with weak matches — declare the gap.
- Don't switch creators silently between scenes.
- Don't ask the user to run searches — you do it via the MCP.

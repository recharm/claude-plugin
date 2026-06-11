---
name: solution-aware-ad-brief
description: Build a Recharm footage brief for a SOLUTION-AWARE ad — lead with the product, win on proof and differentiation. Use whenever a brief, script, or storyboard targets people who already know solutions like this exist (bottom-of-funnel, retargeting, comparison shoppers), or the user mentions "solution aware", "warm audience", "why us", competitor comparisons, or wants an ad that opens on the product itself. Searches the user's Recharm clip library and produces a shareable shot-by-shot brief with clip picks. If the user asks for ad footage but the audience awareness level is unclear, ask whether the audience is unaware, problem-aware, or solution-aware before picking a skill.
---

# Solution-Aware Ad Brief

Turn a creative brief aimed at a **solution-aware market** — people who already know products like this exist and are weighing options — into a shot-by-shot footage brief with concrete clip picks from the user's Recharm library, via the `recharm` MCP server.

A solution-aware ad has nothing to teach and no pain to dramatize: the viewer is comparing. Lead with the product immediately, then win the comparison with **proof and differentiation** — that middle stage is where this ad lives or dies. Re-explaining the problem wastes the viewer's patience. That is why the stage order below is enforced, not suggested.

## The three stages — enforce strictly

Every scene belongs to exactly one stage, and stages appear in this order:

1. **Call out the solution** — open on the product, named and shown, with its sharpest differentiating claim (e.g. "the only khakis with 4-way stretch", "the dermatologist-built hair serum"). No problem setup.
2. **Answer objections / questions / increase trust** — the heart of the ad: testimonials, demos, before/after, credentials, ingredients, durability tests, competitor comparisons, social proof. Anticipate the specific doubts a comparison shopper has (does it work? why this one? is it worth more?) and give each its own scene.
3. **Where to buy** — CTA: website, store, offer, guarantee.

Scene budget: 6–12 scenes total (each scene ≈ 2–5 s, one Recharm clip). Stage 1 should be 1–3 scenes; weight heavily toward stage 2 — proof is the product here. If the user's brief skips a stage or reorders stages, point out the conflict with the solution-aware framework and ask before proceeding.

## Recharm mechanics (read once, applies throughout)

- Call `list_labels(brandName)` once at the start and keep the result; never invent label values or category names — use the exact strings returned (category names vary by brand: `Scene Type` vs `SceneType`, etc.).
- `search_clips_visually` returns slim hits: `clipSymbol`, `clipName`, `rawVideoPublicId`, `sceneType`, `cosineDistance` (lower = closer), `durationMs`, `categoriesAndLabels` (populated only for top hits). Never fetch poster or sprite images; pick on metadata only. Use only the first page — don't paginate.
- Refer to clips in all user-facing output by `clipName` (`<clipSymbol> - <sceneType>`), never bare `clipSymbol`.
- Call `save_brief` exactly once, after picks are final. The server renders the HTML — never build HTML or clip URLs yourself.
- One video per run. If the brief calls for multiple videos, ask the user whether to run per-video sequentially or pick one.

## Workflow

### Step 0 — Create a granular task list

Before any searching, create a visible task list with one task per stage — "Search Solution call-out scenes", "Search Trust & differentiation scenes", "Search Where-to-buy scenes" — plus "Confirm scene breakdown", "Establish primary creator", "Assemble & save brief", and "Explain picks & gaps". Because stage 2 carries most of the ad, split it into one task per objection/proof theme (e.g. "Search demo proof", "Search testimonial proof", "Search comparison proof"). Mark each in progress and complete as you go — granular tasks let the user watch the work happen and catch a wrong turn early instead of at the end.

### Step 1 — Confirm the brand

Use the brand slug if the user named one; otherwise call `list_brands` and ask. Never guess between candidates.

### Step 2 — Fetch labels

Call `list_labels(brandName)`. Note which categories exist for: scene type, creator, actor type, product, age/gender, and any proof-friendly labels (testimonial, demo, before/after, durability, competitors, features/benefits categories — these map directly to stage 2 scenes).

### Step 3 — Section the brief into the three stages

Break the brief into ordered scenes, each tagged with its stage. For each stage-2 scene, also note *which objection it answers* — that's the scene's job. If the user supplied an explicit scene breakdown, map it onto the stages (flagging conflicts); otherwise **show the proposed breakdown grouped by stage and wait for confirmation before searching**. If a transcript/VO is provided, use it to inform what each scene shows, but section independently of transcript timing.

### Step 4 — Establish the primary creator

UGC-style ads fall apart when the on-camera person changes between cuts — viewers read it as an edit, not a story, and trust drops. Comparison shoppers are the most skeptical audience of all, so consistency matters most here. Pick one **primary creator** and stick with them:

1. If the brief names a creator, match it to a label in the creator category (ask if ambiguous).
2. Otherwise run the Stage 1 (solution call-out) searches first with no creator filter. From the top hits' creator labels, shortlist creators who match the brief's audience (use age/gender labels where present). Run 1–2 quick probe searches filtered by each shortlisted creator against a *stage-2* need (e.g. a testimonial or demo) to check they have coverage across the ad — then commit to the one with the best combined match + coverage.
3. Add the creator filter (e.g. `Creator: ["<primary>"]`) to every scene where a person is on camera. Pure product shots / no-actor b-roll don't need it, but if hands or body appear, still prefer the primary creator. Exception: a montage of *multiple different* testimonial voices can be a deliberate social-proof choice — if the brief implies one, confirm with the user, then treat each testimonial scene's creator variety as intentional and say so in the reasoning.
4. If a creator-filtered search returns nothing usable, retry the same filter with a broader query phrase first; only then drop the filter. Any scene that uses a different creator must say so explicitly in its reasoning and in the final summary.

Tell the user which creator you chose and why before continuing.

### Step 5 — Build queries per scene

2–4 queries per scene. Each query is a short visual phrase (< ~8 words) describing what is literally on screen — "close-up serum dropper on scalp" beats "product efficacy". Vary subject/framing/environment across queries. Filters: 0–3 categories, 1–2 labels each.

- **Scene-type filter:** map the stage to the closest scene-type labels in the label list (Solution call-out → product intro/product shot/holding product labels; Trust → testimonial/demo/before-after/durability/competitors labels, matched to the objection each scene answers; Where to buy → CTA/website labels). Use multiple labels in the category to broaden (OR within a category).
- **Actor-type filter (transcript rule):** if a transcript/VO was provided AND an actor-type category exists, add the b-roll/no-actor labels as a hard filter on every query (a VO will be laid over the footage, so on-camera speech would clash). Omit if the category doesn't exist.
- **Product filter:** if a product was named, match it to a product-category label (ask if unsure which) and apply it broadly — in a solution-aware ad nearly every scene is product-relevant, and showing the *wrong* product to a comparison shopper is a credibility hit.
- Don't over-filter: AND across categories shrinks results fast. Creator + scene type, or product + scene type, is usually enough.

### Step 6 — Search and pick, stage by stage

Work through stages in order, updating the task list. Per scene: run each query once, take the 1–2 best hits per query by `cosineDistance`, dedupe by `clipSymbol` (attribute to the best-scoring query), keep at most one clip per `rawVideoPublicId` within a scene, and aim for 3–6 picks. Track per pick the query phrase and filters used — both go into the brief package.

**Be aggressive about declaring gaps.** A wrong clip is worse than no clip: it costs the editor a download-and-reject cycle and hides a real library gap the brand should fill with a shoot. Apply this bar:

- A pick must *literally show* what the scene requires — including the *right product*. A hit showing a different product than the brief's is a rejection, regardless of distance.
- If a hit's `sceneType` or labels contradict the scene (a hook clip offered for a demo scene), reject it.
- Treat a best distance that is much worse than your other scenes' results as a red flag, not a least-bad winner.
- If nothing passes, leave the scene's `clips` empty — it renders as a "custom shoot needed" gap. That is a *good* outcome: it tells the brand exactly what to shoot. Never pad with weak matches, and never include a clip you'd have to caveat with "sort of".
- Expect gaps. Specific proof footage (comparisons, before/after for a named product) is often missing. A brief with zero gaps usually means the bar was too low.

### Step 7 — Assemble and save

Build the v2 package — `title`, ordered `scenes` (`name` prefixed with its stage and, for stage 2, the objection it answers, e.g. "Trust (does it actually work?) — before/after hairline", `description`, `clips` with `clipSymbol`/`searchString`/`filters`; empty `clips` for gaps) — and call `save_brief(brandName, {version: "v2", ...})` once. Surface the returned `url`. If the call fails, report it and show the package.

### Step 8 — Explain your work

Your reasoning is part of the deliverable. After saving, give the user:

- **Per scene, 1–2 lines:** stage (and the objection answered, for stage 2), the winning query, why the top pick won (distance rank, matching labels, creator, correct product), and anything notable you rejected and why.
- **Creator-consistency report:** the primary creator, which scenes hold the line, which break it and why (including any deliberate testimonial-montage variety).
- **Gap report:** every "custom shoot needed" scene with a one-line shoot suggestion.
- **Library observations:** patterns the brand should know (e.g. "no competitor-comparison footage at all — differentiation scenes will always need custom shoots").

Keep in-progress narration brief — a line at each stage transition — and put the substance in this final summary.

## What not to do

- Don't open with problem setup or education — this audience is past it; those are the problem-aware and unaware skills' jobs.
- Don't let stage 2 collapse into generic product beauty shots — every trust scene must answer a specific objection.
- Don't fetch poster/sprite images, paginate searches, invent label values or `clipSymbol`s, or call `save_brief` more than once.
- Don't pad thin scenes with weak matches — declare the gap.
- Don't switch creators silently between scenes.
- Don't ask the user to run searches — you do it via the MCP.

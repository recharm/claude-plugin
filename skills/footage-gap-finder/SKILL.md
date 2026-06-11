---
name: footage-gap-finder
description: Analyze a creative input — an ad concept, creative brief, ad transcript, script, or even a rough idea — and find which shot types are MISSING from the user's Recharm clip library. Use whenever the user asks "what footage are we missing", "find gaps in our library", "what do we need to shoot", "can our library support this idea", wants a shoot list of footage to capture before production, or wants to stress-test a creative concept against their existing clips. Brainstorms many shot types the concept calls for, searches the library visually for each, verifies hits by inspecting poster images, and delivers an HTML gap report explaining each missing shot and why it would be useful. Produces a findings report, NOT a brief — never use this when the user wants a brief or clip picks for an edit.
---

# Footage Gap Finder

You are acting as a pre-production footage auditor. The user gives you a creative input — a polished brief, an ad transcript, a concept, or a one-line idea — and your job is to figure out what shots that idea _would need_, check whether the Recharm library actually has them, and report the ones it doesn't. The deliverable is an HTML gap report that a team can take straight into a shoot-planning meeting: each gap names the missing shot, why the creative needs it, and what to capture.

The Recharm MCP server provides: `list_brands`, `list_labels`, `search_clips_visually`, `get_clip_poster_image`, `get_clip_sprite_image`. Check the live tool schemas for current parameters.

Three principles drive everything below:

1. **Generate generously, verify ruthlessly.** Brainstorm far more shot ideas than you expect to be missing. The value of this skill is breadth — a gap you never thought to search for is a gap you'll never report.
2. **Visual search always returns _something_.** `search_clips_visually` ranks by similarity; it never returns empty. A low cosine distance is encouraging and a high one is suspicious, but neither decides anything. A shot is only "covered" or "missing" after you have **looked at poster images** of the top hits and judged whether they actually depict the shot.
3. **A gap is only worth reporting if you can argue for it.** Every gap in the report must say why this specific creative needs that shot — not "more footage is always nice".

## Step 1 — Brand

Use the brand slug if the user named one. Otherwise call `list_brands` and ask the user to pick. Don't guess.

## Step 2 — Derive shot ideas from the creative input

Read the input and reconstruct how the finished ad would actually be cut together. Then brainstorm **12–20 candidate shot types** that would help fulfill it. Cover the full structure, not just the obvious centerpiece:

- **Hook** — the scroll-stopping first frame (often the least-stocked and most valuable category)
- **Problem / tension** — the frustration, symptom, or "before" moment
- **Product in action** — demo, application, unboxing, close-ups of texture/mechanism/UI
- **Proof** — results, before/after, testimonial-to-camera, reactions
- **Lifestyle / world** — the setting and people the ad lives in
- **CTA support** — packaging, offer-friendly framing, end-card-able shots

For each shot idea, write one line: a short name, a literal visual description of what's on screen, and which beat of the creative it serves. If the input is a transcript or script, anchor shot ideas to specific lines. If it's a vague idea, infer the likely structure and say what you assumed.

State the full shot-idea list before searching — it's the audit checklist, and listing it first stops you from quietly skipping ideas that are awkward to search.

## Step 3 — Fetch labels

Call `list_labels(brandName)` once and keep the result. Categories like **Scene Type, Asset Type, Gender, Age, Creator** are useful as search filters and as context for what the library even tracks. Only ever filter with label values returned by this call. The label list also calibrates expectations — if the concept needs gym footage and there's no fitness-adjacent label anywhere, you already suspect where gaps will cluster.

## Step 4 — Search the library for each shot idea

Work through the checklist. For each shot idea run **1–2 visual searches** with short literal visual phrases (under ~8 words; describe what's on screen, not concepts — "hands opening cardboard box on counter", not "unboxing excitement"). Add a label filter only when the shot clearly implies one; over-filtering hides footage that exists under unexpected labels.

If the first query for a shot comes back with nothing promising, try one rephrasing (different subject, framing, or setting) before judging — one bad query phrase shouldn't condemn a shot to gap status.

## Step 5 — Judge each shot: covered or gap (the heart of this skill)

For each shot idea, look at the top hits' `cosineDistance` and descriptions, then **inspect poster images** with `get_clip_poster_image` for the hits that might plausibly match — typically the top 1–3. Judge each frame against the shot's visual description:

- Does the frame actually show the shot, or something merely adjacent? (A search for "frustrated person rubbing temples" that returns smiling testimonials is a gap, whatever the distance score.)
- Is the subject, framing, and setting usable for this beat — or would an editor reject it on sight?
- If a poster is ambiguous (mid-motion, too wide), pull `get_clip_sprite_image` for the same clip before deciding.

Verdict per shot idea, one line each:

- **Covered** — at least one inspected clip genuinely depicts the shot. Record the best clip's `clipSymbol` and a short visual description of its poster. Move on.
- **Gap** — none of the inspected hits work. Record the queries you tried and, if there was a near-miss, the closest clip's `clipSymbol` and _why it falls short_ — that contrast makes the report persuasive.

Shortcut for clear cases: if the top hit's metadata is unambiguous and its distance is strong, one poster check is enough to confirm coverage. Spend your image-inspection budget on the borderline shots — those are where false gaps and false coverage both live.

**If everything is covered, that's not the end.** A fully-covered checklist usually means the ideas were too safe. Generate a second wave of 5–10 more ambitious shot ideas — alternate hooks, unusual angles or macro details, seasonal/contextual variants, reaction shots, formats the brand likely never shot — and audit those the same way. A report with zero gaps should be rare and should explicitly say the concept is fully shootable from the library today.

## Step 6 — Write up the gaps

For each gap, prepare the fields the report needs:

- **Title** — short shot name (e.g. "Late-night doomscroll hook")
- **What to capture** — a literal, shootable description a videographer could act on: subject, action, setting, framing
- **Why it's useful** — tie it to the creative: which beat it unlocks, what the ad loses without it. This is the argument; make it concrete.
- **What was searched** — the query phrases tried, so the user can trust (or re-run) the audit
- **Closest existing clip** (optional) — the near-miss and why it doesn't work

Then rank gaps by how much they'd hurt the creative if left unfilled — hook and proof gaps usually outrank b-roll gaps.

## Step 7 — Build the HTML report

The report is generated by merging your findings into a pre-built template — you don't need to write any HTML.

### 7a — Assemble findings as JSON

```json
{
  "meta": {
    "brand": "<brandSlug>",
    "concept": "<one-line name of the creative input, e.g. 'Morning-routine UGC ad'>",
    "date": "<YYYY-MM-DD>",
    "shotIdeasConsidered": <number>,
    "searchesRun": <number>,
    "gapsFound": <number>,
    "summary": "<1–2 sentence verdict: can the library carry this concept, and what's the biggest hole? Use <strong> tags for key phrases.>"
  },
  "gaps": [
    {
      "title": "<short shot name>",
      "lookFor": "<what to capture · shootable visual description · dot-separated cues>",
      "whyUseful": "<why the creative needs this shot. Use <strong> tags for key phrases.>",
      "searchedFor": ["<query 1>", "<query 2>"],
      "closestMatch": {
        "clipSymbol": "<clipSymbol>",
        "visualCue": "<short visual description of that clip's poster>",
        "whyNotEnough": "<one sentence on why it falls short>"
      }
    }
  ],
  "covered": [
    {
      "title": "<short shot name>",
      "visualCue": "<short visual description of the best clip's poster>",
      "clipSymbol": "<best clipSymbol>"
    }
  ]
}
```

Field notes:

- Order `gaps` by impact (Step 6 ranking) — the template numbers them in order.
- `closestMatch` is optional; omit the key when no hit was even close.
- Every shot idea from your checklist (both waves) must land in either `gaps` or `covered`. Silent drops undermine trust in the audit.
- `lookFor` and `visualCue` use `·` as separator (e.g. `"Hand silencing alarm · Dark bedroom · Phone glow"`).
- `whyUseful` and `meta.summary` support inline HTML (`<strong>`, `<em>`). Keep each 2–4 sentences max.
- `clipSymbol` is used to construct "View clip" Recharm links automatically.

### 7b — Merge into the template

The template is at `<skill_base_dir>/assets/template.html` where `<skill_base_dir>` is shown in the skill header line at the top of this session (e.g. `Base directory for this skill: /path/to/footage-gap-finder`).

Run this Python snippet in the bash shell to produce the output file:

```python
import json, pathlib

skill_dir  = "<skill_base_dir>"    # from the skill header
brand      = "<brandSlug>"
outputs    = "<outputs_dir>"       # Claude's working outputs folder

data = { ... }  # your assembled JSON object from 7a

template = pathlib.Path(f"{skill_dir}/assets/template.html").read_text()
html     = template.replace("__DATA_JSON__", json.dumps(data)).replace("__BRAND__", brand)

out = pathlib.Path(outputs) / f"footage-gaps-{brand}.html"
out.write_text(html)
print(f"Written: {out}")
```

**Critical — always use `json.dumps(data)`, never hand-write the JSON.** Manually constructing the JSON string inline (e.g. typing `{"meta": {...}, "gaps": [` directly into a Write tool call) is structurally fragile: an unclosed array or mismatched bracket produces a blank HTML report with no error message. Build the `data` dict as a Python object and let `json.dumps` serialize it — it is the only safe path.

Present the output file to the user and give a 3–5 sentence chat summary: how many gaps, the most important one or two, and the overall verdict on whether the library can carry the concept.

## What not to do

- Don't call `save_brief` — this skill produces a findings report, not a brief. This holds even if the input was a brief.
- Don't declare a shot covered or missing from search scores alone — verdicts require inspecting poster (or sprite) images.
- Don't condemn a shot to gap status off a single query phrasing — try a rephrase first.
- Don't invent label values — only filter with values returned by `list_labels`.
- Don't pad the report with generic gaps ("more b-roll") that aren't tied to a beat of this creative.
- Don't drop shot ideas silently — every idea ends up in `gaps` or `covered`.
- Don't construct media URLs by hand — the MCP does not expose embeddable poster/video URLs; use the `app.recharm.com` clip links the template generates.
- Don't stop after the first wave if everything is covered — escalate to more ambitious shot ideas.

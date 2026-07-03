---
name: creator-finder
description: Identify which creator (on-camera talent) in a Recharm clip library is the best fit to front a given ad creative concept. Use whenever the user asks who should star in, front, or be cast for an ad concept, asks to "find a creator", "pick talent", "which creator should I use", or wants a creator recommendation backed by evidence from their Recharm library. Searches the library visually, inspects poster images of real clips to judge each creator's on-camera fit, and delivers an HTML report with the recommended creator, supporting clips, and the reasons other creators were rejected.
---

# Creator Finder

You are acting as a casting director, but instead of audition tapes you have a Recharm clip library. Videos and clips are labeled with a `Creator` category. Your job: given an ad creative concept, work out what kind of person should front it, surface candidate creators through visual searches, **actually look at their faces** in poster images, and recommend one creator — with explicit reasoning for the pick and for every rejection. The deliverable is an HTML findings report, not a brief.

The Recharm MCP server provides: `list_brands`, `list_labels`, `search_clips_visually`, `get_clip_poster_image`, `get_clip_sprite_image`, `save_html_file`. Check the live tool schemas for current parameters.

Two principles drive everything below:

1. **Decide what you're looking for before you look.** If you start browsing faces first, you'll anchor on whoever you saw first. Define the target persona from the concept, then evaluate candidates against it.
2. **Labels get you candidates; only your eyes can cast them.** Search metadata tells you a creator exists and what scene types they have. Whether they have the right age, energy, polish, and camera presence for _this_ concept — you must judge from the actual images.

## Step 1 — Brand

Use the brand slug if the user named one. Otherwise call `list_brands` and ask the user to pick. Don't guess.

## Step 2 — Define the target creator persona and scene needs

Think through how this ad concept would actually be executed:

- **Scene needs**: what 3–6 types of scenes would the finished ad require? (e.g. hook, problem moment, product demo, testimonial to camera, lifestyle b-roll, CTA). The chosen creator should ideally cover most of them.
- **Target persona**: who should be on camera? Capture apparent age range, gender (if the concept implies one), energy (deadpan, high-energy, warm), polish (relatable UGC vs. pro spokesperson), and setting/lifestyle cues (office worker, golfer, gym, home).

State the persona and scene needs explicitly before searching — this is the rubric every candidate gets scored against.

## Step 3 — Fetch labels

Call `list_labels(brandName)` once and keep the result. Note:

- **Creator** — the candidate universe. Every recommendation must be a name from this list.
- **Gender / Age / Asset Type / Scene Type / Actor Type** — useful filter categories when present.

Only ever filter with label values returned by this call.

## Step 4 — Discovery searches: build the candidate pool

Run **one or two visual searches per scene need** (roughly 5–10 searches total), with short literal visual phrases (under ~8 words, describe what's on screen, not concepts). Vary subjects, framings, and settings across queries. Add a `Gender` or `Age` filter when the persona clearly implies one — but don't over-filter; discovery should cast a wide net.

Important quirk: only the **top few hits** of each search come back with `categoriesAndLabels` populated — that's where creator names come from. This is another reason to run many varied searches rather than one big one.

Each hit also returns a **`posterUrl`** (a hosted still thumbnail of the clip) and a `recharmUrl`. **Record the `posterUrl` alongside the `clipSymbol`** for every candidate's best clip — you will reuse it in Step 7 so the report shows the creator's actual face, not just initials. (`posterUrl` is what you see; `get_clip_poster_image` is still the right tool when you want to inspect a frame inline during Step 5.)

From all hits, build a candidate table: creator name → their best hit (clipSymbol, posterUrl, sceneType, cosineDistance) per scene need. Aim to surface **8–12 distinct creators**; you will face-evaluate **at least 5–10** of them. If discovery surfaces too few, run additional searches with different phrasings or relaxed filters. Hits without a Creator label can't be attributed — skip them for candidacy purposes.

## Step 5 — Face evaluation (the heart of this skill)

For each candidate (at least 5–10), call `get_clip_poster_image` with `asset: {type: "Clip", symbol: <their best clipSymbol>}` and **look at the frame**. Judge against the Step 2 persona:

- Is a face actually visible and is this plausibly the labeled creator (not an empty product shot)?
- Apparent age and gender vs. persona
- Energy and expression — does their vibe match the concept's tone?
- Polish — UGC-relatable or produced? Which does the concept call for?
- Setting and wardrobe — consistent with the concept's world?
- Camera presence — would you stop scrolling for this person?

Record a one-line verdict per creator: **advance**, or **reject + the specific reason** (e.g. "reads mid-50s, concept needs a 25-ish office guy"). Also note what the poster shows in a short visual description — these descriptions go in the report. **Keep the `posterUrl` of the exact clip you judged each creator on** — that is the still that should represent them in the report. If a poster is ambiguous (face turned away, too wide), don't guess: pull `get_clip_sprite_image` for the same clip, or fetch the poster of another clip by that creator (search with `filters: {"Creator": ["<name>"]}`) and use that better clip's `clipSymbol` + `posterUrl` instead.

Be honest in verdicts. A weak match advanced out of politeness produces a bad ad. If _nobody_ fits the persona, say so — recommending a custom shoot with a casting spec is a valid outcome.

## Step 6 — Coverage check on finalists

Take the top 2–3 advancing creators. For each, run `search_clips_visually` with `filters: {"Creator": ["<name>"]}` against your remaining scene needs to see what else they have. Check 2–4 more poster images per finalist to confirm the first impression holds across clips (consistency matters — one flattering frame can mislead). Count usable clips per scene need, keeping **at most one clip per `rawVideoPublicId`** (clips sharing a source video look near-identical).

The winner is the best combination of **persona fit** (from faces) and **coverage** (can they carry most of the ad?). A perfect face with one clip usually loses to a strong face with footage for every scene.

## Step 7 — Build the HTML report

The report is generated by merging your findings into a pre-built template. This saves time and keeps output consistent across runs — you don't need to write any HTML.

### 7a — Assemble findings as JSON

Build this object from your research:

```json
{
  "meta": {
    "brand": "<brandSlug>",
    "concept": "<ad concept, e.g. 'Authority Figure Ad'>",
    "date": "<YYYY-MM-DD>",
    "persona": "<one-sentence summary of the target persona from Step 2>",
    "metrics": [
      { "num": <discovery search count>, "label": "Discovery searches" },
      { "num": <coverage search count>,  "label": "Coverage searches" },
      { "num": <posters you inspected>,  "label": "Posters inspected" },
      { "num": <creators face-evaluated>, "label": "Creators evaluated" },
      { "num": 1, "label": "Clear winner", "tone": "win" }
    ]
  },
  "winner": {
    "name": "<Creator label name>",
    "posterUrl": "<posterUrl of the representative clip you judged this creator on>",
    "visualCue": "<short · dot-separated · visual description from the poster you inspected>",
    "reason": "<why this creator was picked, referencing the persona rubric. Use <strong> tags for key phrases.>",
    "clipSymbol": "<representative clipSymbol>"
  },
  "runnersUp": [
    {
      "name": "<Creator label name>",
      "posterUrl": "<posterUrl of the representative clip>",
      "visualCue": "<visual description>",
      "reason": "<why they came close and what disqualified them. Use <strong> tags.>",
      "clipSymbol": "<representative clipSymbol>"
    }
  ],
  "rejected": [
    {
      "name": "<Creator label name>",
      "posterUrl": "<posterUrl of the representative clip>",
      "visualCue": "<visual description>",
      "reason": "<specific rejection reason from Step 5. Use <strong> tags.>",
      "clipSymbol": "<representative clipSymbol>"
    }
  ]
}
```

Field notes:

- Every creator you face-evaluated must appear as winner, runner-up, or rejected. Silent drops undermine trust in the pick.
- `metrics`: an ordered array of `{num, label, tone?}` pills rendered in the header stats bar — use it to give the reader honest numerical visibility into the work (searches run, posters inspected, creators evaluated, etc.). Report the counts you _actually_ performed; don't inflate them. Split searches into discovery vs. coverage when you ran a Step 6 pass. `tone:"win"` paints a pill green (reserve it for the "Clear winner" pill). Add or drop pills freely — the template renders however many you give it. If `metrics` is omitted, the template falls back to a legacy `searchesRun` + `creatorsEvaluated` + winner layout, so include those two numbers instead if you skip the array.
- `posterUrl`: the hosted clip still returned by `search_clips_visually` for the **exact clip you evaluated** (the same one named in `clipSymbol`). The template renders this image so the reader can see who is being picked. If a creator genuinely has no usable `posterUrl`, omit the field — the card falls back to a colored initials avatar.
- `visualCue`: describe what the poster frame actually shows — setting, wardrobe, hair, energy. Use `·` as separator (e.g. `"White coat · Pharmacy · Silver hair"`). This caption sits under the image.
- `reason` fields support inline HTML (`<strong>`, `<em>`). Keep it tight — 2–4 sentences.
- `clipSymbol` is used to construct the "View clip" Recharm link and should match the clip the `posterUrl` came from. The "All clips" link is auto-generated from the creator name — no extra field needed.

### 7b — Merge into the template and produce both a local file and a shareable link

The template is at `<skill_base_dir>/assets/template.html` where `<skill_base_dir>` is shown in the skill header line at the top of this session (e.g. `Base directory for this skill: /path/to/creator-finder`).

Run this Python snippet in the bash shell to produce the local output file:

```python
import json, pathlib

skill_dir  = "<skill_base_dir>"    # from the skill header
brand      = "<brandSlug>"
outputs    = "<outputs_dir>"       # Claude's working outputs folder

data = { ... }  # your assembled JSON object from 7a

template = pathlib.Path(f"{skill_dir}/assets/template.html").read_text()
html     = template.replace("__DATA_JSON__", json.dumps(data)).replace("__BRAND__", brand)

out = pathlib.Path(outputs) / f"creator-recommendation-{brand}.html"
out.write_text(html)
print(f"Written: {out}")
print(html)   # also print so the next step can grab the exact HTML to upload
```

Then **upload the same HTML to get a shareable link**: call `save_html_file` with `brandName` set to the brand slug and `html` set to the exact merged HTML string you just wrote to disk. It returns a public Recharm URL anyone can open. This gives two deliverables:

- a **local `.html` file** in the outputs folder (present it to the user), and
- a **shared Recharm URL** from `save_html_file` (paste it in the chat summary).

Because the poster images load from hosted `posterUrl`s, the report renders identically whether opened locally or from the shared link.

Present the local file to the user, include the shared link, and give a 3–5 sentence chat summary: the pick, the top reason, and the closest runner-up.

## What not to do

- Don't recommend a creator whose face you never inspected in a poster or sprite image.
- Don't evaluate fewer than 5 creators unless the library itself surfaces fewer — and say so if it does.
- Don't invent creator names or label values — only use ones returned by the API.
- Don't reject silently: every evaluated creator gets a stated reason in the report.
- Don't hand-build or guess poster/clip URLs. Use the `posterUrl` exactly as returned by `search_clips_visually` for the image, and the `app.recharm.com` clip links (auto-generated by the template) for navigation. Mismatching a `posterUrl` to a different `clipSymbol` will show the wrong face.
- Don't call `save_brief` — this skill produces a findings report, not a brief. Use `save_html_file` to share it.
- Don't pad the winner's clip list with near-duplicates from the same `rawVideoPublicId`.

---
name: "uber-ad-brief"
description: >
  Build a Recharm footage brief for an Uber-style ad — where the creative concept is set inside
  a rideshare and centers on the driver-passenger dynamic as the vehicle for storytelling about
  a product. Use this skill whenever a user provides an ad concept, brief, or product idea and
  wants to frame it around an Uber ride, rideshare setting, driver-passenger conversation, backseat
  discovery, or any in-car / commute scenario. Trigger on: "uber ad", "rideshare brief", "in-car ad
  concept", "driver-passenger", "backseat", "make an ad set in an Uber", or any brief that uses a
  car ride as the storytelling device. Always use this skill when the brief involves a prospect who
  is a passenger or driver in a rideshare — even if the user doesn't say "Recharm" or "brief"
  explicitly.
---

# Uber-Style Ad Brief Creator

You turn a product and an ad concept direction into a fully sectioned Uber-style creative brief,
then search the user's Recharm clip library for footage that fits, and produce a shareable brief.

The Recharm MCP server (`recharm`) is available. Key rules:

- Call `list_labels` **once** at the start — reuse it throughout, never call it again per scene.
- Do NOT build HTML. Hand `save_brief` a structured v2 package; the server renders everything.
- Call `save_brief` exactly **once**, after all clip picks are final.
- Do not paginate `search_clips_visually` — use the first page only.
- Only use label values returned by `list_labels` — never invent or guess label strings.
- Always refer to a clip as its `clipName`: `<clipSymbol> - <sceneType>`. Fall back to `clipSymbol`
  if `sceneType` is null.

---

## Uber Ad Concept Archetypes

When the user's brief implies an approach, map it to one (or a blend) of these archetypes. If the
brief is open-ended, present 3–4 options and let the user pick.

### Original 10 Archetypes

1. **Expert Advice POV** — Driver stops mid-ride to offer niche, unsolicited life advice about the
   product. Feels like a genuine slightly-intrusive Uber conversation.
2. **Hidden Compartment Reveal** — Driver reveals the car is secretly stocked with the brand's
   products instead of the usual water/chargers. Acts like it's the most normal thing in the world.
3. **Music Taste Test** — Driver plays a track that perfectly matches the product's vibe, using the
   car's speakers to demonstrate the product's benefits (sound quality, mood-setting, etc.).
4. **"Wait, Look at This" Detour** — Driver pulls over at a scenic spot or store specifically to
   show the passenger a cool product feature or use case. Breaks the monotony of the car shot.
5. **Passenger Challenge** — Driver challenges the passenger to try the product for the duration of
   the ride and captures their raw, unfiltered first-impression reaction.
6. **Backseat Vlogger** — Dashcam-style angle catches the passenger "accidentally" discovering the
   product in the backseat and starting an organic conversation about it.
7. **Road Trip Prep** — Montage of the driver prepping the car — and prominently including the
   product as an essential part of the service they offer every passenger.
8. **Inside Joke Dynamic** — Driver and passenger are already laughing together, then effortlessly
   pivot to how the product solved a common problem they both share.
9. **Before/After Traffic Jam** — High-stress, gridlocked ride transforms into a relaxed experience
   once the driver introduces the product. Positions it as a mood-shifter or stress-reliever.
10. **The Rating Play** — Driver jokingly asks for a "5-star rating," but only if the passenger
    agrees that [Product] is the best thing they've tried all day. Familiar mechanic → CTA.

### 10 Additional Archetypes

11. **ETA Countdown** — Driver references the ride's remaining time ("6 minutes left") and shows
    how the product fits perfectly into any commute window — making every ride feel productive.
12. **Surge Pricing Confession** — Driver jokes about surge pricing, then pivots: "But some things
    are always worth the premium," pivoting to the product's value proposition.
13. **Lost and Found** — Driver pulls out the product: "Someone left this last week — I tried it,
    now I keep it for every ride." Stranger's social proof in a highly believable setting.
14. **Late Night Shift** — Midnight or early-AM ride; driver reveals the product that keeps them
    going through long shifts. Authentic tiredness + genuine product discovery.
15. **Airport Goodbye** — Frantic airport drop-off, driver hands the product to the passenger as a
    parting gift: "You're going to need this." High-emotion, memorable ending.
16. **Carpool Chemistry** — Two strangers sharing a rideshare bond over the product during an
    otherwise awkward shared ride. Turns a mundane moment into a connection.
17. **Parallel Lives Split-Screen** — Driver and passenger are shown using the product in their
    separate daily lives, connected only by the ride. Universality of the product.
18. **Turn-by-Turn Tutorial** — Driver gives a GPS-navigation-style walkthrough of the product:
    "In 200 feet, open the app…" Playful format, clear product education.
19. **Long Haul Confession** — Extended airport or cross-city ride; driver opens up about how the
    product genuinely changed something in their life. Intimacy of a long shared journey.
20. **Wrong Turn, Right Product** — GPS reroute or wrong turn accidentally leads to discovering the
    product. Reframes the "mistake" as serendipity. Works well for discovery-stage brands.

---

## Step 1 — Confirm brand, archetype, and actor preference

**Brand:** If the user named a brand slug, use it. Otherwise call `list_brands` and ask the user to
pick. If the slug isn't in `list_brands`, try `list_labels` with it directly before giving up.

**Archetype:** Map the user's brief to one or a blend of the archetypes above. If it's unclear,
present 3–4 good fits and wait for confirmation. The archetype shapes every scene heading and the
tone of the search queries — getting it right upfront matters.

**Actor Type preference:** Uber-style ads are inherently actor-forward (driver, passenger), so
the default is **No Filter** unless the user's brief specifically calls for B-roll only. Confirm:

- **No Filter** (default) — includes talking heads, UGC, Actor B-roll, and No Actor
- **Actor B-roll only** — partial body, hands, environmental shots only
- **No Actor** — purely product/environment footage (unusual for this format)

---

## Step 2 — Fetch available labels

Call `list_labels(brandName)`. Keep the result for the full workflow. Note:

- **Scene Type**: used to filter for hooks, CTAs, product shots, etc.
- **Actor Type**: confirms available actor/B-roll categories.
- **Product**: maps to specific flavors/SKUs if the brief names one.

---

## Step 3 — Section the brief into Uber-style scenes

Break the brief into ordered scenes. Target **10–14 scenes** (Uber ads are tight — cap at 14).
Each scene ≈ 2–4 seconds. For each scene capture:

- A short heading that names both the Uber context and the product beat
  (e.g., "Backseat Reveal — passenger opens product for first time")
- 1–2 sentences describing exactly what appears on screen
- The narrative role: hook / ride-context-setup / product-discovery / benefit / reaction / CTA

**Uber scene palette — lean on these visual contexts:**

- Car interior: backseat POV, front-passenger POV, rearview mirror framing
- Driver face / driver hands on wheel
- City or highway passing through the window (movement = life)
- Product appearing in the cupholder, center console, seatback pocket, or passenger's hand
- Driver-passenger eye contact via rearview mirror
- Phone screen showing the Uber app (ETA, rating prompt, arrival)
- Arrival / door-open moment (high energy, natural cut point)
- Reaction shots — genuine surprise, delight, or laughter

**Show the proposed scene breakdown to the user and wait for confirmation before proceeding.**

---

## Step 4 — Build search queries

For each scene, generate **2–4 search queries**. Each query:

- A short visual phrase (under ~8 words) describing what's literally on screen.
  Favor phrases that include in-car cues: "woman in backseat opening small box",
  "driver smiling in rearview mirror", "city lights through car window at night".
- An optional `filters` object. Default: at most **1 label category** beyond ActorType.

**Scene Type guidance for Uber briefs:**

- Opening scenes → `Hook` or `Visual Hook`
- Product first-touch / discovery scenes → `Product Shot` or `Product Benefits`
- Reaction / conversation scenes → no Scene Type filter (let the visual query do the work)
- Closing scenes → `CTA`

---

## Step 5 — Search, section by section

**Fire all queries for all scenes in parallel** in the same tool call batch (first round).
Only run follow-ups after reviewing first-round results.

For each scene:

1. Call `search_clips_visually` for each query phrase.
2. Select **1–2 top results per query** by lowest `cosineDistance`.
3. Aim for **3–5 clips per scene** total. Deduplicate by `clipSymbol`.
4. Use **at most one clip per `rawVideoPublicId`** within a scene — clips sharing an ID are
   near-duplicate moments from the same source video. Keep the lowest cosineDistance, drop the rest.
5. Deprioritize clips over 4000 ms when shorter alternatives exist at similar cosineDistance.
6. Track the `query phrase` and `filters` used for each picked clip — both go into the package.
7. If a scene has no strong matches, leave `clips: []` (renders as "custom shoot needed" gap) and
   note it in the final summary.

---

## Step 6 — Assemble the brief package

Build the v2 structured package:

- `title`: short brief title capturing the archetype and product,
  e.g., `"Hidden Compartment Reveal" · Magic Spoon · Cold Traffic`.
- `scenes`: ordered list. Each scene:
  - `name`: the scene heading.
  - `description`: the 1–2 sentence on-screen description.
  - `clips`: picked clips, each with `clipSymbol`, `searchString`, `filters`.
  - Empty `clips: []` for custom-shoot gaps.

Do not provide URLs, durations, or display names — the server derives them from `clipSymbol`.

---

## Step 7 — Save and share

Call `save_brief` exactly once:

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

Surface the returned `url` as the shareable link. Follow with a short **summary**:
scenes needing custom footage, any unusually long clips, and observations about gaps in the library
specifically for in-car / Uber-context footage.

---

## What not to do

- Don't skip the archetype selection step — it's what makes this format distinctive.
- Don't use label values not returned by `list_labels`.
- Don't over-filter: 1 label category per query (beyond ActorType) is the default.
- Don't fetch or examine poster images or sprite images.
- Don't invent `clipSymbol`s — only use ones from `search_clips_visually` results.
- Don't refer to clips by `clipSymbol` alone in user-facing output — always use `clipName`.
- Don't call `save_brief` more than once, and never before clip picks are final.
- Don't build HTML or construct clip URLs yourself.

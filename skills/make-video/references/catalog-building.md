# Building (or reusing) the brand catalogs

The skill builds its working knowledge of a brand the first time it sees it, caches it, and reuses
it. Everything lives in `~/.claude/make-video/brands/<slug>/` (override the root with
`MAKE_VIDEO_ROOT`), so one skill serves every brand and nothing brand-specific ships inside it.

```
<slug>/
  brand.json            slug, prettyName, website, description, vertical, palette, fonts, logo paths, tone, market
  catalog/
    labels.json         raw list_labels snapshot + detected categories + bannedValues + deadValues   (check_filters reads it)
    products.json       product catalog    -> Recharm Product-type labels      (if the brand has them)
    creators.json       creator catalog    -> Creator labels                   (if present)
    actor-types.json    Actor Type catalog -> Actor Type labels                (if present)
    audio-types.json    Audio Type catalog -> Audio Type labels                (if present)
    scene-types.json    Scene Types: live/dead/role                            (if present)
    asset-types.json    Asset Type / Captions                                  (if present)
    filters.json        every other label category: role + dead/thin values + tags
    website-brand.json  claims with source URLs, offers, reviews, disclaimers, tone
    clips.json, raw-videos.json   sampled clips grouped by source shoot, with probe data
    images/{products,creators,scenes,website}/   saved images
  fonts/                brand font files, when licensable
```

## 0. Freshness

```bash
node scripts/catalog_tool.mjs status <slug>
```

Reuse a cache that is under 30 days old **and** whose `labels.json` still matches a fresh
`list_labels` (same categories and value counts). Otherwise rebuild; `catalog_tool.mjs labels`
preserves enriched entries and reports which labels are new or gone. Tell the user "I already know
this brand (built <date>)" or "building the brand library now (~N minutes)".

## 0b. Build tiers (so a budget-limited run still ends usable)

- **Tier 1 - required before the interview**: `brand.json` (from `get_brand_info`), `labels.json` +
  skeleton catalogs, `website-brand.json` (claims with source URLs, offers, disclaimers) and
  `products.json` mapped to labels, with the product the user named verified live in a search.
- **Tier 2 - required before the plan**: dead/thin results for every label you intend to filter on, the
  creators you will offer (live, speaking verified), Actor/Audio coverage counts, 6-12 packshots/logos.
- **Tier 3 - nice to have**: the full creator sweep, `clips.json`/`raw-videos.json` for every label,
  posters per scene type. Build in the background with subagents; never block the interview on it.
`status` shows what is missing; tell the user which tiers are done. Write the website data to the cache
(`brand.json`, `website-brand.json`, `images/website/`) as soon as you have it - it is easy to forget.

## 1. Fetch everything Recharm exposes

There is no single call that returns "all clips, scene types, raw videos, tags and filters".
Assemble it from:

| Need | How |
|---|---|
| Brand profile | `get_brand_info(slug)` |
| Labels, tags, filters, scene types | `list_labels(slug)` - every category and its values. Scene Type, Creator, Product, Actor Type, Audio Type and Captions are all just label categories |
| Clips and raw videos | `search_clips_visually(slug, query, filters)` - the only enumerator. Sweep it (below); each hit gives `clipSymbol`, `rawVideoPublicId`, `sceneType`, `durationMs`, `categoriesAndLabels`, and URLs |
| What a clip looks like | `get_clip_poster_image`, `get_clip_sprite_image` |

Save each tool result to a JSON file in the scratch folder (the MCP call cannot write files; you write
the file yourself). For categories with hundreds of values (creators) write the first ~60 plus
`"partial": true` and the real `"count"`: `check_filters.mjs` then warns, not errors, on a value it has
not seen, and the sweep fills in the creators you actually use. Then ingest:

```bash
node scripts/catalog_tool.mjs init <slug>
node scripts/catalog_tool.mjs info <slug> info.json        # get_brand_info output
node scripts/catalog_tool.mjs labels <slug> labels.json    # list_labels output -> skeleton catalogs
```

`labels` auto-detects which categories feed which catalog (Product/Flavor/Variant, Creator/Talent,
Actor Type, Audio Type, Scene Type, Captions/Asset Type), drops values the library owners tagged
"(do not use)", skips admin categories (Batch, Usage Rights, Recharm), and leaves the rest for
`filters.json`. **Read its output and correct it**: if a category was mis-detected, or the brand uses
a different name for creators, fix the catalog by hand and `catalog_tool.mjs set`. If the brand has
no Creator (etc.) category, that catalog does not exist - say so, do not invent one.

## 2. Sweep the library (search is the only way in)

For libraries under ~30 clips skip the per-label sweep: one unfiltered search returns nearly everything;
record it and sprite-check. Otherwise, for each Scene Type, Product, Creator, Actor Type and Audio Type
label you intend to use, run **one filtered search** with a generic query ("person", "product", "hands") and `filters: {<category>: [<label>]}`.
This does three jobs at once:

- **Liveness**: zero hits on a label that `list_labels` returned = **dead** label. Record it:
  `node scripts/catalog_tool.mjs dead <slug> "<Category>" "<Value>"`. 1-9 hits = **thin**.
  (`list_labels` returns values assigned to at least one clip, yet many retrieve nothing in search -
  the index and the label table disagree. Never assume a listed label returns clips.)
- **Sampling**: collect hit `clipSymbol`s, `rawVideoPublicId`s, `durationMs`, `categoriesAndLabels`
  into `clips.json` and group by `rawVideoPublicId` into `raw-videos.json` (one shoot = one source
  video; dedupe later by it).
- **Posters**: take the lowest-`cosineDistance` hit per label and fetch `get_clip_poster_image` for
  creators, products and scene types. Save to `images/` (use `catalog_tool.mjs images`).

Budget: parallel batches of ~10 searches. Stop at diminishing returns - a catalog of 150 well-labelled
clips beats an exhaustive crawl. Unlabelled clips exist; an unfiltered query finds them.
Brands with hundreds of creators (some libraries list 250+) get catalogs for creators that are live and
have 3+ clips; list the rest by name only.

## 3. Build each catalog

Only if the brand has the matching label category. Each `entries[]` row keeps `label` exactly as
Recharm spells it, so searches use the exact string.

**Product catalog** (`products.json`). Browse the product catalog on the brand's website (see
`brand-assets.md`): shop/collection pages, each product page. Per product: name, variants, price, the
claims printed on its page (with URL), packshot URL; then **map it to its Recharm label**: fuzzy-match
the website name to the label (sometimes one label covers two SKUs; sometimes a label has no website
product, e.g. discontinued - flag it and ask before building an ad on it). Save packshots to
`images/products/`. After a test search add how the product looks on camera and its best two queries.

**Creator catalog** (`creators.json`). Per creator label: live or dead (from the sweep), setting and
framing from the poster (describe only what an ad brief needs: setting, energy, framing), `talksToCamera`
(true only if verified from `Audio Type`, volumedetect or sprite - labels describe intent, not fact),
orientation, product(s) shown, poster path. Group them for the interview: faces camera and speaks /
faces camera silent / hands only / dead.

**Actor Type catalog** (`actor-types.json`). Per value (A-roll / B-roll / No Actor, or the brand's
variants): clip count from the sweep, what it means in this library, and the format rule (VO ->
B-roll + No Actor, muted; mashup -> A-roll; testimonial -> A-roll or a verified speaking creator).

**Audio Type catalog** (`audio-types.json`). Per value (Voice / Voice With Background Sound /
Background Sound / Robovoice...): meaning, counts, measured loudness on a few probed clips, and the
caveat that many clips labelled "Background Sound" are silent.

**Filters catalog** (`filters.json`). For every other category: what it filters on (`role`), the dead
and thin values, top clips. Cross-reference Scene Type and tags so each ad beat (hook, CTA, problem,
demo, proof) maps to the *live* label that finds it - names like `Hook` and `CTA` are often dead in
practice. `check_filters.mjs` enforces this at search time.

**Scene types** (`scene-types.json`): live/dead, narrative role, formats that use it, a sample poster.

**Website brand** (`website-brand.json`, `brand.json`): see `brand-assets.md`.

Finish with `catalog_tool.mjs status <slug>` and give the user a 5-line summary: products, live creators,
actor/audio coverage, key dead labels, and what the library is thin on.

## 4. Keep it honest

- A catalog field you could not verify stays `null`; never fill one by guessing.
- Dates go in every file (`updatedAt`). Stale rows mislead.
- If a live search returns labels or counts the catalog does not know, the library was re-labelled:
  re-validate those values, update the catalog, tell the user what changed.

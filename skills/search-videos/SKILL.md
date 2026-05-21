---
name: "search-videos"
description: "Analyzes briefs and/or descriptions of sections for content and suggests visual search phrases to find video content on Recharm. Returns URLs the user can visit to run each search themselves."
---

**Inputs**: this skill requires the user to provide a `brand` (e.g. `lululemon`) along with the brief/script. If it's missing, ask before proceeding. Let's just ask for a URL because really want the brand slug. So It'd look like: `https://app.recharm.com/app/lululemon`.

When given a brief or script and asked to find video content -- or find it on Recharm -- utilize these steps:

1. **Analyze Content**

- Recharm hosts a brand's library of raw videos and clips. Analyze the brief/script per-scene, and for each scene, think about what visual b-roll content would fit.

2. **Generate Visual Search Phrases**

- The library is searchable via short, visual descriptions (it's an embedding-based semantic search, not keyword/label search). Come up with ~5 short search phrases per scene.
- Phrases should describe what would visually appear on screen, not abstract concepts.

3. **Construct URLs**

- For each search phrase, build a URL using this placeholder pattern:
  https://app.recharm.com/app/[[[BRAND]]]/?utm_source=claude_skill_v2&section=virtual%3AVisual+Search%3ARawVideo%3[[[SEACH-TERM]]]

- `[[[BRAND]]]` is the brand name provided by the user (URL-encode it too if it contains special characters).
- `[[[URL_ENCODED_QUERY]]]` is the search phrase, URL-encoded (spaces become `%20` or `+`, special characters percent-encoded, etc.).
  Example: for brand `lwp_test` and query `woman putting on jacket`, the URL is:

```
https://app.recharm.com/app/lululemon/?utm_source=claude_skill_v2&section=virtual%3AVisual+Search%3ARawVideo%3Awoman%20putting%20on%20jacket

```

4. **Output**

- For each scene in the brief, output the scene description followed by its list of search phrases and the corresponding URLs.
- Keep the output compact: scene heading, then a bulleted list of `phrase — URL`.
- Don't show URLs, but instead hyperlink the search keywords so it is easy to understand your output.

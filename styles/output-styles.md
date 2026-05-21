---
name: Brief Summary Table First
description: Show a summary table that shows the search queries for every scene and the number of clips you evaluated before making the final recommendation in the brief.
---

# Brief Creator Output Style

## Purpose

This output style defines how the brief-creator skill presents results to the user. Follow this format precisely after completing all searches and clip selections. The goal is full transparency — the user should be able to see exactly what was searched, what was found, and why clips were chosen, without needing to re-open Recharm.

## Output Structure

### 1. Brief Header

Begin with a concise summary of the brief and what was accomplished.

```
# 🎬 [Brief Title]

**Concept:** [One sentence summary of the creative direction]
**Sections completed:** [N]
**Total clips selected:** [N]
**Searches performed:** [N]
```

### 2. Section Breakdown

For each section of the brief, output a dedicated block in this format:

```

## Section [N]: [Section Name]

**Creative direction:** [What this section needs to convey — pulled from the brief]

### 🔍 Searches Performed

| # | Query | Filters Applied | Clips Found | Clips Chosen |
|---|-------|----------------|-------------|--------------|
| 1 | "[search query]" | Label: [label], Duration: [range], etc. | [N] | [N] |
| 2 | "[search query]" | Label: [label] | [N] | [N] |

> **Why these queries?** [1–2 sentences explaining the search strategy for this section — what visual idea you were looking for and why you approached it this way.]

### 🎞️ Selected Clips

For each chosen clip:

**Clip [N]** — [clip title or ID]
- **Why selected:** [What made this clip the right fit — composition, motion, mood, subject match]
- **Suggested timing:** [Where in the section this clip works best, e.g. "opening shot", "cutaway", "closing hold"]
- [Recharm link or thumbnail if available]

> **What was skipped and why:** [Briefly note if many clips were found but few chosen — explain the selection criteria used, e.g. "Filtered out clips with logos visible" or "Preferred wide shots over close-ups for this section."]
```

Repeat this block for every section in the brief.

---

### 3. Full Brief Summary Table

After all sections, output a compact summary table the user can scan at a glance:

```

## 📋 Full Brief at a Glance

| Section | Clips Selected | Primary Query | Key Filter |
|---------|---------------|---------------|------------|
| [Name]  | [N]           | "[query]"     | [filter]   |
| [Name]  | [N]           | "[query]"     | [filter]   |
```

### 4. Recommendations

Always end with a recommendations block. This is not optional — it helps the user improve the brief before going into production.

```

## 💡 Recommendations to Strengthen This Brief

### Add more coverage for these sections
[List any sections where fewer than 2 clips were found, or where the search results were a weak match. Suggest alternative search angles or different filter combinations to try.]

### Queries to try next
- "[alternative query 1]" — [why this might surface better results]
- "[alternative query 2]" — [what different angle this covers]

### Consider broadening these filters
[If filters were narrow and resulted in low clip counts, name the specific filter and suggest loosening it, e.g. "The 'Duration: 5–10s' filter on Section 2 returned only 3 clips — try 3–15s for more options."]

### Gaps in the brief
[Note any sections of the creative concept that have no strong clip match in the library — flag these so the user knows to shoot new footage or source externally.]

### Production notes
- [Any observations about clip consistency across sections — e.g. color grading, aspect ratio mismatches]
- [Suggestions on sequencing — if a selected clip would work better in a different section]
- [Pacing notes — if too many similar clips were chosen back-to-back]
```

---

## Tone and Style Rules

- Be **specific, not vague** — "selected for the slow pull-back revealing the product" is better than "good composition"
- Keep section headers clean and scannable — the user should be able to skim the output and understand what happened
- Do not summarize what the skill did in abstract terms — show the actual queries and actual results
- If a search returned 0 results, say so clearly and explain what you tried instead
- The recommendations section should always contain **at least 3 actionable suggestions** — never leave it empty or generic

---

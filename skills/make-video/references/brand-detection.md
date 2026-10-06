# Detecting and confirming the brand

This skill is not tied to one brand. Before anything else, work out which Recharm brand the user
means, **then confirm it**. A wrong slug means every clip, claim and colour in the ad belongs to
someone else, so this is the one step that must never be guessed.

## 1. Collect signals (cheapest first)

1. **Who is logged in.** `whoami` -> `{id, email}`. The email domain is a hint (`@acme.com` ->
   "acme"), never proof: agencies and Recharm staff see many brands.
2. **What the user said.** A brand name, a product name, a URL, a slug, a competitor comparison
   ("make an ad for the Topside" -> Away). Product names often identify the brand by themselves.
3. **Where the session is.** If the working directory is a project, read `package.json` name,
   `README`, `CLAUDE.md`, git remote and any `brand`/`site` config for a company name. Skip this in
   a scratch workspace.
4. **What the account can see.** `list_brands` -> `[{name (slug), prettyName}]`. Always call it:
   slugs are not guessable.

## 2. Match against `list_brands`

- Normalise both sides: lower-case, strip `audit_`, punctuation and underscores
  (`audit_vital_proteins` == `audit_vitalproteins` == "Vital Proteins").
- **Duplicates are common.** The same company can appear under several slugs (underscored and
  non-underscored, a renamed `prettyName`, an old copy marked `(OLD)`). Where two or more slugs
  normalise to the same brand, probe each with `list_labels` and prefer the one with more categories
  and values. Show the user which one you picked and why.
- A `prettyName` that does not match its slug (e.g. slug `audit_nature_made`, prettyName
  `audit_novoslabs`) is a data quirk, not a different brand - trust the slug the user's intent maps
  to, and say so.
- Test, demo and eval slugs (`recharm_test_2`, `entitlement_testing`, `*_eval_*`, `selfserve_demo`)
  are only a match if the user names them.
- **The user says "Recharm" or "our brand".** Recharm is the platform, not the brand. Only the `marketing`
  slug ("Recharm Marketing") is Recharm's own library; offer it as one candidate and weight the product
  they describe (office chairs, cereal...) first. Never assume "our brand" means the Recharm slug.
- **Finding a brand by product type.** `list_brands` has no descriptions and `prettyName` is often just
  the slug (or wrong). Scan slugs for keywords from the user's product (furniture, chair, litter, protein,
  swim...), then call `get_brand_info` on the 2-4 best candidates and compare `description`/`vertical`.
  If no slug matches, say so and ask for the brand name or website rather than guessing.
- Never pull footage from a slug the user did not confirm. Every brand is a different company.

## 3. Decide: auto-propose or ask

| Situation | Do |
|---|---|
| User named one brand clearly | Propose it, confirm |
| Signals agree on one slug (email domain + a product they named) | Propose it, confirm |
| Two or three plausible slugs | Ask with the candidates (question tool if available, otherwise a numbered plain-text list: slug, prettyName, website, one-line description) |
| One strong content match but the user is unsure of the name | Propose it as the best guess alongside the other candidates and ask; do not auto-accept |
| Nothing matches | Show a short, relevant slice of `list_brands` (not all ~100) or ask for the brand name / website, then re-match |
| Account has exactly one brand | Propose it, still confirm |

## 4. Fetch the profile, then confirm

`get_brand_info(brandName)` returns only: `prettyName`, `description`, `vertical`, `website`
(unset fields omitted). It does **not** return clips, scene types or labels - those come from
`list_labels` and `search_clips_visually` (see `catalog-building.md`).

Confirm in one short message, for example:

> I think this is **Magic Spoon** (`magic_spoon`) - a high-protein, low-sugar cereal brand,
> magicspoon.com. Is that the brand, and is the website right? Reply "yes" or tell me the right one.

If `website` is empty, propose a guess built from the brand name (`drink<name>.com`, `<name>.com`; check it
loads) and ask the user to confirm or correct it.

Wait for the answer. If the user corrects the brand, restart at step 2 with their correction, and
discard anything fetched for the wrong slug. The website drives brand guidelines, claims and product images.

## 5. What to carry forward

Once confirmed, hold: `slug`, `prettyName`, `website`, `description`, `vertical`. Record them with
`catalog_tool.mjs info <slug> <info.json>`. From here on pass `slug` to every Recharm call.

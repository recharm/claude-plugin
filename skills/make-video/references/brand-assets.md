# Brand guidelines and assets

Ask the user first (interview question 6): "Do you have brand guidelines or assets - logo, colours,
fonts, product photos?" On a strictly motion-graphics ad, push for them; the design *is* the ad. What
they provide wins. Otherwise harvest from the brand's website and say so in the plan.

## Harvesting the website

`brand.json -> website` (from `get_brand_info`, confirmed by the user). Use the in-app browser
(`mcp__Claude_Browser__*`; Claude in Chrome only if the user asks for it) for anything that needs exact
wording, prices, colours or fonts: `WebFetch` only returns a model summary, so it cannot give hex values,
font names or verbatim claims (use it to locate pages), and it can be rate-limited (HTTP 429) - fall back
to the browser. If `https://www.<domain>` fails (DNS, 429), try the bare domain, and vice versa; if both
are blocked, say so and ask the user for guidelines rather than relying on third-party summaries.
Discover product URLs from the nav, `/collections/all`, `/sitemap.xml` or the site search - guessed paths
usually 404. Read in this order and stop when covered:

1. **Home page** - hero claim, tone of voice, nav (shows the product range), footer (legal, social).
2. **Shop / collection pages** and **each product page** - names, variants, prices, ingredient and spec
   lists, the claims printed there, review count and rating **exactly as displayed**, packshot URLs.
   Feeds `products.json`.
3. **About / our story / science / FAQ** - claims with their sources, founder story (only if the user
   wants a founder ad and it is the real story), disclaimers.
4. **Brand look** - run in the page: computed colours of the header, primary button, headings and
   background; `font-family` of headings and body (check `@font-face` sources and Google Fonts links);
   logo `<img>`/SVG URLs (header and footer); favicon; corner radius and button shape. Prefer values
   from CSS custom properties (`--color-*`).
5. **Offers** - banner/promo text. Record each with its page and the date: offers expire.

Record in `brand.json`: `palette` (named hex values with role: primary, secondary, accent, ground,
text), `fonts` (heading, body, source, licence status), `logo` (paths to saved files, light and dark
variants), `tone` (3 adjectives from the copy), `market` (country/accent, currency), `motif` (a
repeating shape from the logo or packaging). Record in `website-brand.json`: `claims[]` each with
`text`, `url`, `source note`; `offers[]`; `reviews`; `disclaimers[]`.

Save images (logos, packshots, lifestyle; 6-12 total) with `catalog_tool.mjs images`. Only what the
brand itself published; never save images from third-party sites.

## Fonts

Use the brand's face only if you can obtain a licensed or open file (Google Fonts / OFL, or a file the
user supplies); put it in `<brand>/fonts/` and point the EDL's `fontsDir` at it, and set
`captionStyle.font` to its family name. If the site uses a commercial face you cannot legally embed,
use the bundled Poppins (OFL) or the closest Google Font and say so in the plan.

## Source assets in this order

1. Assets the user provided or already on the brand website: logos, packshots, lifestyle imagery, and
   the library footage itself.
2. Assets generated natively in the composition: icons, shapes, backgrounds, bars, gradients, simple
   illustrations (CSS/SVG in Remotion, or ffmpeg drawbox/drawtext).
3. Web-sourced stock only when 1 and 2 cannot cover the need, and only from sources licensable for
   commercial ad use (confirm the licence per asset). **Flag every such asset in the delivery summary**
   (what, where from, licence) so it can be swapped before the final render.

Never fabricate a source. Never use an asset whose licence you cannot establish. Never generate or
retype the logo, packaging, or the brand's product and customers. Never use a competitor's marks.

## Claims discipline

- Only claims that appear on the website (`website-brand.json`) or that the user gave this session.
  Quote them faithfully, with the source note available for a small-type footnote.
- Regulated categories (supplements, skincare, pet health, finance): carry the site's disclaimer
  wherever the claim appears; use the site's own hedged phrasing ("may help"), never a flat medical claim.
- **A product with library footage but no page on the site** (404, absent from the nav) may be
  discontinued or regional: ask the user whether it is current before building an ad on it.
- Not on the site -> not in the ad: "#1", "doctor-recommended", invented review counts, "as seen in".
- Offers only if the user confirms they are live today. Old promos burned into library clips
  ("SAVE 20%") are out unless current.
- Competitors: categories yes, rival brand names or readable rival packaging no.

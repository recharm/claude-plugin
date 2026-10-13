# Animation library

Every animated segment in an ad, whether a motion-graphics scene, an animated insert in a footage ad or an
overlay, **draws something besides text**: the brand's objects pouring, a line crashing, a ring filling, a
card flipping, badges stamping, a packshot swinging in. Text explains the graphic. It is never the graphic.

This rule is enforced twice:
- **`mg_check.mjs`** blocks the plan before render.
- **The template refuses to render** a scene or overlay item whose only animation is text.

The components live in the brand project's `src/visuals.tsx` (from `assets/remotion-template/`). Their
shapes, colours and icons come from the brand's **`motifs.json`**, which is built from its website and library.

## 1. Learn the brand's motifs (once per brand, with Tier 1)

```bash
node scripts/brand_motifs.mjs --brand <slug> --write     # then: node scripts/mg_init.mjs --brand <slug> --aspect 9:16
```

It reads the brand cache and writes `<cache>/brands/<slug>/motifs.json`:

| Field | From | Drives |
|---|---|---|
| `category` | brand description, site title, product types and titles, label values | default props and problem objects |
| `style` | site wording and palette saturation: `playful`, `premium`, `clinical` or `bold` | springs, bounce, particle density |
| `props` | category, then **you confirm** | particles, pours and orbits (cereal loops, droplets, capsules...) |
| `problemObjects` | category, then **you confirm** | the problem half: what pours, piles up and shatters |
| `productColors` | colours sampled from the transparent packshots | particle colours (flavour colours) |
| `packshots` / `cutouts` | `catalog/images/products/` (transparent cut-outs first) | packshot, orbit, split, pour source, `image` particles |
| `icons` | the brand's own claim words, e.g. "gluten free" maps to `wheat` with a slash | badges, steps and list icons (automatic) |
| `claimVisuals` | each website claim, then the visual that carries it | the plan: which visual each claim gets |
| `actions` | live **Scene Type** labels in the library, e.g. "Pouring Product" maps to `pour` | match cuts between animation and footage |

**Confirm it before the first motion plan.** Look at two packshots and one sprite of the product in use (you
pull sprites in Step 4 anyway), then check three things:
- `props[0]` is what the product looks like out of the pack.
- `problemObjects` is what the brand removes, in its own words.
- `style` fits the site.

Then set `"confirmed": true` and re-run `mg_init`. A confirmed file keeps your edits when you re-run the script.
For a product that should fly as itself, set `props[0]` to `{"shape": "image", "image": "products/<cutout>.png"}`.

## 2. Let the planner choose (the default)

You don't pick animations one by one. Write the beats - the script's lines with their role and VO timing - and
let `mg_plan.mjs` choose a fitting, **different** animation for each:

```bash
node scripts/mg_plan.mjs beats.json --brand <slug> --out <project>/ads/<name>.json     # --seed N for another valid mix
```

```json
{"aspect": "9:16", "beats": [
  {"role": "hook", "line": "<VO line>", "start": 0, "end": 3.4, "text": "<on-screen heading>", "sourceLabel": "<the usual thing>"},
  {"role": "problem", "line": "<VO line>", "start": 3.9, "end": 8.5, "labels": ["<t1>", "<t2>", "<t3>", "<t4>"], "callouts": [{"i": 2, "text": "<CRASH>", "tone": "bad", "big": true}]},
  {"role": "pivot", "line": "Meet <brand>.", "start": 10.0, "end": 11.4, "footage": {"src": "clips/<clip>.mp4", "trimBefore": 2.0, "action": "<Scene Type>"}},
  {"role": "claim", "line": "<a number from the site>", "start": 11.6, "end": 13.0},
  {"role": "benefit", "line": "<attribute. attribute. attribute.>", "start": 19.2, "end": 22.1},
  {"role": "cta", "line": "<CTA line>", "start": 25.4, "end": 27.9, "cta": "<Shop now>"}
]}
```

Roles: `hook problem agitate pivot claim benefit how taste social offer cta`. Times are the VO's word timings
(`transcribe.mjs`). Optional per beat: `text`, `claim`, `items`, chart `labels` / `callouts` / `points`, `footage`,
`prefer: "<kind>"` (a nudge) and `avoid: [kinds]`.

How it chooses:
- **Fit first.** Every animation that could carry the beat is scored from the role, the claim's `claimVisuals`
  entry, the brand's attributes and icons, the packshots and the footage you gave the beat. A beat that states a
  number only gets animations that show it.
- **Then variety.** A kind already used in this ad loses points, and the same kind back to back loses many. So
  an ad uses many different animations without anyone listing them.
- **Then memory.** `<cache>/brands/<slug>/motion-history.json` remembers the last ads (written by
  `mg_check --record` after the final render). The next ad avoids their opening and their animation in each
  slot, so three ads from the same script come out different.
- **Then length.** Each animation has a minimum time to play out (a pour needs ~2.4s, badges ~0.7s each), so a
  short beat gets a quick device.
- **Transitions and backgrounds.** Chosen per role and the brand's style: quick whips and wipes in the problem
  half, a hard match cut at a footage pivot, springs, zooms and irises in the solution half, never the same
  transition twice running.

Each scene it writes has a `_plan` note (what it picked, why, and what else fitted). Read the plan, change
anything that reads wrong, then run `mg_check`. Its variety rules **block** the same animation leading two
scenes in a row, or more than two scenes in one ad.

## 3. Scenes carry visuals

Each scene in `ads/<name>.json` has `visuals: [...]`. Layers sit behind the text (`particles`, `rays`), in the
content box (everything else), or in front (`scribble`, `sparkles`). The content box is the safe area under the
heading when there is text on top (`textY` defaults to top whenever a scene has a main visual), otherwise the
whole safe area. Override with `box: {x, y, w, h}` as frame fractions. **Fractions are per aspect ratio: a box
written for 9:16 is wrong in 16:9**, so leave `box` out unless you need it.

All times (`at`, `times`, `stagger`, `items[].at`) are **seconds from the scene start**. Sync them to the VO word
timings.

| `kind` | Draws | Key fields | Carries |
|---|---|---|---|
| `pour` | A source tips and pours objects that bounce and pile into a container | `source`: a packshot path, `"box"` (with `sourceLabel`, unbranded) or `"none"`; `container`: `bowl`, `cup`, `jar` or `none`; `problem: true` uses the problem object; `count` | The problem piling up; the product's own abundance; the match cut into pour footage |
| `shatter` | Objects fly in and burst into shards and a shockwave | `problem` (default true), `count`, `popAt` | "0g", "free from", "no more X". Pair with a `counter` |
| `chart` | A line draws itself point by point. The tip dot rides it, callouts pop, a big callout shakes and flashes the frame | `points` (y 0..1), `labels`, `times` (one per point), `callouts: [{i, text, tone, big}]`, `title`, `meter` (battery), `tone` | Energy crashes, results over time, before/after trends |
| `gauge` | A ring fills to a value, with an orbiting tip and rising + marks | `value`, `fill` (0..1), `label`, `sub`, `layout`: `card` or `center` | Amounts and ranges (12-14g, 70%) |
| `counter` | Slot-machine digits roll onto the value | `value`, `label` | **Text-like**: it must have a real visual beside it (`shatter`, `icon`, `packshot`) |
| `card` | A 3D card flips up; rows slide in; one row is highlighted and circled by hand | `title`, `sub`, `rows: [{label, value, highlight}]` | Nutrition labels, spec sheets, ingredients, plan tiers |
| `badges` | Pills stamp in on the beat with a screen shake, dust ring and a self-drawing icon | `items: [{text, icon?, slash?, at?}]`, `stagger` | Attribute claims (keto, vegan, gluten free). Icons default to `motifs.icons` |
| `icon` | One big icon draws in a disc, rings burst, the brand's objects scatter | `icon`, `slash`, `label` | One idea, said loudly |
| `steps` | A dashed path draws through icon nodes; each step pops in | `items: [{text, icon?}]`, `stagger` | How it works, routines, delivery |
| `orbit` | Icons orbit the product packshot | `icons`, `center` (packshot) | Benefits around the thing that gives them |
| `packshot` | The website packshot swings in 3D with a glow, optional rays and an idle float | `src` (default: the first cut-out), `rays`, `swing` | Product reveal, CTA |
| `callouts` | The product in the middle; leader lines draw out to each attribute, each with its icon | `items: [{text, icon?}]`, `src`, `stagger` | Attributes "on" the product (keto, gluten free...) |
| `grid` | A unit chart: icons (or the brand's object) fill one by one, the highlighted ones in the accent | `total`, `highlight`, `icon` or `shape`, `label` | Percentages and "9 in 10" claims from the site |
| `split` | Two panels and a wiping divider; the bad side is greyed with ✕, the good side glows with ✓ | `a` and `b`: `{image or footage or icon, label, tone}` | Old way vs brand, before/after. **Never name a competitor** |
| `particles` | The brand's object drifting, falling, rising, bursting or orbiting, in depth | `mode`, `shape`/`image` (default: `props[0]`), `count`, `origin` | Ambience; celebration; under footage |
| `scribble` / `sparkles` / `rays` | Hand-drawn strike, underline, circle or arrow; twinkles; rotating rays | `style`, `box`, `at` | **Decoration only**: never the scene's only visual |

**Scene types** besides `scene` (background plus visuals):
- **`footage`** (a library clip with visuals over it). The clip itself counts as a visual.
- **`product`**.
- **`endcard`**.
- **`compare`** (bars).
- **`list`** with `marker: "icon"`, which draws as `steps`.
- **`custom`** (below).

`title` and `stat` render only if a visual is attached. Scene-level options:
- `glitch: true` (RGB-split heading).
- `shake: [seconds]`.

**Transitions**: `fade`, `slide`, `wipe`, `whip` (motion-blurred push), `zoom` (zoom-through) and `iris`
(circle reveal), plus a hard cut (no `transition`) on a beat.

**Overlays** (graphics laid over a testimonial): every item needs an `icon` or a `visual`. A lower third with a
star icon, or `{"type": "visual", "visual": {"kind": "gauge", ...}}`.

**Icons**: `check cross leaf seedling bolt heart shield star sparkle clock calendar drop waves flame snowflake
sun moon zzz wheat grain cube box bottle bowl spoon cup pill flask dumbbell brain smile eye paw users thumb medal
gift tag percent dollar cart truck recycle globe lock phone battery trendUp trendDown arrow scale`.

## 4. Choosing visuals that suit the brand (what the planner does, and what you check)

1. **Every claim gets the visual in `claimVisuals`** unless you have a better idea that is still literal:
   - A range or percentage gets a `gauge`.
   - "0g" or "no X" gets `shatter` plus a `counter`.
   - A list of things the product is free from gets `badges`.
   - A subjective claim gets a `packshot` or footage, never a chart.
2. **The problem is made of `problemObjects`; the solution of `props` and packshots.** Sugar cubes pour into
   the bowl in the hook; cereal loops pour in the solution. Rhyming the two is what makes it feel designed.
3. **Match cuts come from `actions`.** If the library has "Pouring Product" footage, end an animated `pour` on
   the falling motion and cut to the real pour at the same screen position. The best seams between animation and
   footage are shape and motion matches.
4. **Footage beats get a visual over them, not under a caption alone.** For example, a `gauge` over the spoon
   shot or a `card` over the milk pour, using `layout: "card"` or a `box` in the clip's empty area. Read the
   empty area off the sprite.
5. **Vary the device.** The same main visual three scenes running reads as a template (`mg_check` warns). Each
   device used once is the goal.
6. **Style sets the motion:**
   - `playful` brands bounce, and their particles are dense.
   - `premium` brands glide, use fewer particles, and prefer `fade`, `zoom` and `iris` over `whip`.
   - `clinical` brands prefer `card`, `chart` and `steps`, and use little decoration.
7. **Claims and numbers** on any visual follow the same rule as captions: from `website-brand.json` or the
   user's `approvedClaims` (`mg_check` blocks the rest). Clock labels on a chart axis are fine.

A worked set (Magic Spoon, cereal, playful):

| Beat | Visual |
|---|---|
| Hook | `pour` with sugar cubes from an unbranded "healthy" box |
| Problem | `chart` crash with a battery `meter` |
| Pivot | Library pour footage (match cut on the falling cube) |
| Claims | `shatter` + `counter` "0g"; a `gauge` "12-14g" over the spoon shot; a `card` with "4-5g" net carbs highlighted; `badges` for keto, gluten free and grain free |
| Taste | `packshot` with rays |
| CTA | End card with falling cereal loops |

## 5. Bespoke scenes

When an idea needs more than the library (a character, a custom physics gag), write a component in
`src/custom/` **out of the library pieces** (`Pour`, `Particles`, `Chart`, `Icon`, `ShapeEl`) and register it
in `src/custom/index.ts`. Then use `{"type": "custom", "component": "<Name>", "draws": "<what moves besides
text>"}`. `mg_init` never overwrites `src/custom/`. Load `remotion-best-practices` first.

## 6. Check, then render

```bash
node scripts/mg_check.mjs <project>/ads/<name>.json        # PASS required
# ... after the FINAL render, remember what this ad used so the next one varies:
node scripts/mg_check.mjs <project>/ads/<name>.json --record
npx remotion render src/index.ts Ad out/<name>.mp4 --props=ads/<name>.json --crf=16
```

Render a half-scale preview (`--scale=0.5`) and look at one frame per scene before the final render.

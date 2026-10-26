# Animation library

Every animated segment in an ad, whether a motion-graphics scene, an animated insert in a footage ad or an
overlay, **draws something besides text**: the brand's objects pouring, a line crashing, a ring filling, a
card flipping, badges stamping, a packshot swinging in. Text explains the graphic. It is never the graphic.

This rule is enforced twice:
- **`mg_check.mjs`** blocks the plan before render.
- **The runtime refuses to render** a scene or overlay item whose only animation is text.

The components live in the skill's runtime, `assets/hyperframes-runtime/src/visuals.tsx` (bundled into each project as
`assets/vendor/mv-runtime.js`; `hf_build.mjs` runs them inside HyperFrames). Their
shapes, colours and icons come from the brand's **`motifs.json`**, which is built from its website and library.

## 1. Learn the brand's motifs (once per brand, with Tier 1)

```bash
node scripts/brand_motifs.mjs --brand <slug> --write     # then: node scripts/hf_init.mjs --brand <slug> --aspect 9:16
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

Then set `"confirmed": true` and re-run `hf_init`. A confirmed file keeps your edits when you re-run the script.
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
- **Then chance.** Every beat type has two or three animations that fit about equally well (the table in §4).
  Among the options within 2.5 points of the best, the planner picks at random, weighted toward the better
  ones, with a **fresh seed every run**. The same script never comes out as the same ad twice. `--seed N`
  reproduces a plan (the seed is printed and stored in it), and `--best` always takes the top option.
- **Then memory.** `<cache>/brands/<slug>/motion-history.json` remembers the brand's last ads. **The planner writes
  the entry when it plans** (`--dry` skips that). A re-plan of the same ad replaces its own entry, and
  `mg_check --record` after the final render replaces it with what was rendered. The next ad avoids those ads'
  opening and their animation in each slot.
- **Memory in a fresh workspace.** A new claude.ai chat starts with no memory file. Ask once: "Have you made ads
  for this brand recently? Which animations did they use?" Briefs saved by this skill carry an `Animations:`
  line. Pass the answers as `--recent "pour,chart,gauge|split,icon,card"` (one ad per `|`, in scene order),
  or `"recent": [[...], ...]` in `beats.json`. Anything the user doesn't want goes in `--avoid pour,chart`
  (or `"avoid"`).
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
| `countdown` | A flip clock counting down; the cards flip each second, the digits pulse red under a minute | `from` ("HH:MM:SS", "MM:SS", "D:HH:MM:SS"), `label`, `speed` (>1 races it), `urgent` | A deadline **the user confirmed** - never invent one. `mg_check` warns every time |
| `phone` | A phone rises in and its screen does the job: `notify` (banners drop in), `chat` (bubbles, typing dots), `cart` (product, price, a finger taps "Add to cart" -> "Added", badge pops), `scroll` (a long screenshot scrolls) | `screen`, `items: [{title?, text, icon?, me?}]`, `image`, `title`, `price`, `cta`, `done`, `app`, `stagger`, `tilt` | Ordering, shipping, apps, DMs, reviews. Price from the site |
| `slider` | Before / after in ONE frame: a handle drags across wiping between them, then settles | `a`, `b`: `{image or footage, trimBefore?, label, tone}`, `settle` (0..1) | Before/After ads - same framing on both sides reads best. Real results only |
| `fill` | A `glass`, `bottle`, `jar` or `battery` filling with a waving surface and bubbles; a "NN%" value counts up with it; the battery goes red -> amber -> accent | `vessel`, `level` (0..1), `value`, `label`, `marks`, `color` | Hydration, servings, energy that lasts, percentages |
| `timeline` | Results over time: a track fills, a glowing dot travels through milestones that pop as it reaches them; the last is the goal. Vertical in a portrait box | `items: [{label, text?, icon?}]` (2-5), `stagger` | "Day 1 -> Week 2 -> Day 30" - results the brand actually claims |
| `scale` | A balance: the problem object piles onto pan `a`, the brand's object (or packshot) onto `b`; the beam tips with an overshoot | `a`, `b`: `{label, count?, image?, shape?, icon?, problem?}`, `heavier` (`a`/`b`) | Sugar vs none, cost vs value, "outweighs" |
| `checklist` | Rows slide in; the brand's highlighted column ticks each, the other column crosses them out. No `them` = a single list ticking itself off | `rows` (strings or `{text, us?, them?}`), `us`, `them`, `stagger` | "Us vs others" comparisons (**never name a competitor** - "Others", "Regular cereal"), a list of benefits |
| `stars` | Stars fill to the rating, the number rolls up, the review count under it | `rating` (the site's), `outOf`, `count`, `label` | Social proof - only the brand's real rating and count |
| `donut` | A donut draws its segments in turn, a legend beside it; the first segment is the brand's | `segments: [{label, value, color?}]`, `center` | What's inside, where the money goes, a breakdown the site states |
| `race` | Bars race to their values, re-ranking on the way; the brand's bar glows | `items: [{label, value, highlight}]`, `unit`, `seconds` | Comparisons with real figures (never name a competitor - "Granola", "Regular cereal") |
| `lottie` | A Lottie animation, frame-locked | `src` (`lottie/<file>.json` in assets/), `speed`, `loop` | The brand's object as a real character animation (see below) |
| `draw` | The product's outline traces round in one line, then it fills in for real with sparkles; or an `icon` / SVG `path` draws on and fills | `image` (default: the first cut-out), `icon`, `path` (100x100 viewBox), `label`, `color` | Reveals. Needs a transparent cut-out - on a photo with a background the outline is a box |
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

**Backgrounds - vary them.** `bg` picks the brand colour (`primary`, `secondary`, `dark`, `ground`); `bgStyle` picks how
it is drawn:
- `glow` - soft glows and floating dots (the original).
- `gradient` - a slow-turning two-tone sweep.
- `spotlight` - a dark stage with one beam from above.
- `grid` - a fine drifting grid (tech, clinical, data).
- `paper` - printed grain that boils, with a vignette (natural, craft, premium).
- `pattern` - the brand's own object tiled and scrolling, faint.
- `blur-footage` - a library clip blurred and toned behind the graphics; needs `bgClip: {src, trimBefore}`. Best next
  to a footage scene, on a dark tone.
- `split` - two tones meeting on a slowly sliding diagonal.
- **Shader backgrounds** (WebGL, in the brand's colours; a matching CSS gradient where WebGL is missing): `mesh` (a
  soft moving mesh gradient), `aurora` (light curtains in the accent), `marble` (veined stone), `liquid` (flowing
  paint), `godrays` (beams from above), `blobs` (merging soft blobs), `voronoi` (glowing cells), `smoke`. Premium
  brands draw mesh / marble / smoke / godrays; playful ones blobs / liquid / voronoi / mesh; clinical mesh / voronoi.

Never three scenes in a row on the same style (`mg_check` warns). `mg_plan` rotates them within the ad and against the
brand's last ads, from a pool that suits the brand's style (premium: glow, gradient, spotlight, paper, split; clinical:
grid, gradient, glow, split, spotlight; playful/bold: all of them).

**Light grounds.** A scene on a light colour (`ground`, or a cream `secondary`) draws every visual in dark ink - the
brand's darkest colour - and swaps a pale accent for the primary, so checklists, charts, timelines, fills, scales, cards
and gauges read on white (a gauge card keeps its own dark panel). `mg_plan` puts up to a third of the solution half on the
light colour, never two in a row and never the problem beats (pours, rain and shatter are white objects - keep them on dark).

**More transitions** (after the HyperFrames registry's transition blocks) - `{"type": "<name>"}`, each with its own default
length; all of them work on footage, packshots and the cut-out (they act on the live scene, not a picture of it):

| Type | What happens | Fits |
|---|---|---|
| `lightleak` | Warm light floods the frame; the cut hides in it | Solution, reveal, CTA - premium and playful |
| `ink` | Ink blots spread and merge into the next scene | Solution, a softer turn - premium |
| `torn` | The frame rips open along a ragged line | Problem beats, "break free" |
| `halftone` | Print dots swell across the frame | Playful, retro, clinical data |
| `glitch` | The picture tears into bands and colour channels, then swaps | Problem / agitate, tech, urgency (never premium) |
| `ripple` | A liquid ripple through the dissolve | Drinks, water, calm |
| `warp` | A stretched, pushing distortion | Energy, speed |
| `chromatic` | A punch-in that splits into colour channels | Reveals, bold |
| `vortex` | The next scene spins up out of the centre | Playful reveals |
| `collage` | Torn paper scraps slap down, then lift on the new scene | Playful, handmade, editorial |
| `burn` | A glowing ragged edge eats across | Problem -> solution, "burn the old way" |
| `flash` | Through white on a beat | A music hit, a hard pivot |
| `pixel` | The frame flips over cell by cell | Tech, clinical, games |

The planner rotates all of them with the others: rough ones (glitch, burn, torn, flash) in the problem half, bright and
smooth ones in the solution half, filtered by the brand's style, never repeated back to back, and steering away from the
joins the brand's last ads used.

**Carry transitions - a shape carries the eye into the next scene.** `{"type": "carry", "variant": ..., "at": {"x", "y"},
"color": "accent"|"primary"|"secondary"|"#hex"}`, 0.6s by default. The join is an object, not a frame move:
- `dot` - a dot of brand colour grows from `at` to fill the frame; the next scene opens out of it.
- `ring` - a ring expands from `at`; the next scene is seen through its hole.
- `flood` - a wave of colour rises over the frame and the next scene rises in behind a second wave.
- `bar` - a diagonal band sweeps across; the next scene is laid down in its wake.
- `object` - the brand's own prop (`motifs.json` props[0]: a cereal loop, a capsule, a leaf) flies at the camera
  and fills the frame; a ring-shaped prop becomes a zoom THROUGH its hole.

Put `at` where the eye already is (the last scene's subject, the number that just landed). Pick a `color` that
differs from BOTH scenes' backgrounds - a primary flood into a primary scene is invisible. Solution half and CTA
only; one or two per ad, never two variants in a row of the same kind. `mg_plan` puts them in its pools.

**Graphics behind the subject (cut-out).** A footage scene with `"cutout": "cutouts/<name>"` (made by
`separate.mjs`, `setup.md` -> Object separation) draws the person / product cut out of the clip ABOVE the scene's
`back` and `main` visuals - a number, a ring, rays behind a head or a bowl; text, `front` visuals and the ring
stay on top. The strongest shot in an ad: give it the hero claim. The cut-out must cover the scene's stretch of the
clip (`mg_check` warns when it doesn't).

**Motion blur (final renders only).** `hf_build.mjs ... --blur` renders at 60fps and blends each pair of frames down
to 30 - pops, stamps and whips stop strobing (about 2.5x the render time, so drafts never use it). It is a light
blur: a very fast whip still shows a double image for a frame. Footage barely changes (its frames repeat at 60fps),
and an After Effects layer export is never blurred (AE adds its own).

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

**Each beat type has several right answers** - the planner rotates through them, and so should a hand-written plan.
There is no single "correct" sequence to copy:

| Beat | Equally valid options |
|---|---|
| Hook / problem | `pour` of the problem object, `chart` crashing, `split` (the usual vs the brand), the problem object raining (`particles` fall), one big problem `icon`, `scale` tipping under the problem object |
| An amount or range ("12-14g") | `gauge`, `card` with that row highlighted, one big `icon` with the number, `grid` (percentages) |
| A zero / "free from" ("0g sugar") | `shatter` + `counter`, the problem `icon` slashed with the number, `split` (the usual vs the brand with the number), `card`, `scale` |
| A percentage, hydration, energy that lasts | `fill` (glass / bottle / jar / battery), `grid`, `gauge` |
| Us vs the others | `checklist` with a `them` column, `split`, `scale` |
| Results over time | `timeline` (beats.json `milestones`), `chart` climbing |
| Before / after | `slider` (beats.json `before` / `after`), `split` |
| Order, ship, app, DM | `phone` (`cart`, `notify`, `chat`, `scroll`) |
| A real deadline | `countdown` (beats.json `countdown`, confirmed by the user) |
| A list of attributes | `badges`, `callouts` from the product, `orbit` of icons, `steps`, `checklist` |
| Pivot / reveal | library footage (match cut), `packshot`, the product `pour`ing the brand's object, `orbit` of benefit icons, `draw` |
| Taste / feeling | footage, `packshot`, product `pour`, the brand's object bursting, `orbit` |
| CTA | end card (its particles' motion varies) |

**Lottie brand props.** A Lottie file (After Effects via Bodymovin, LottieFiles, or generated - e.g. the
diffusionstudio/lottie skill) in the brand project's `assets/lottie/` plays frame-locked as `{"kind": "lottie", "src":
"lottie/<file>.json"}`. List the brand's own in `motifs.json` as `"lottie": ["lottie/<file>.json"]` and the planner uses
them for product beats ("the brand's object, animated"). Use only animations the brand owns or that are licensed for
commercial use, in the brand's colours; keep them short (1-3 s) and loopable. Lottie plays through lottie-web (MIT).

**Camera moves on footage scenes** - `"camera"`: `pushin` (the default eased push), `pullback`, `drift` (a slow lateral
pan), `rack` (opens out of focus, racks sharp), `handheld` (a gentle hand-held sway), `punch` (a quick punch-in that
settles), `static`. The planner picks one per footage scene by its beat; the cut-out moves exactly with it.

**The ad's look** - one finishing layer over every scene: `"look": "film"` (moving grain, a vignette, a warm lift),
`"paper"` (printed-paper grain and fibres), `"print"` (a fine halftone screen), `"sweep"` (a sheen passes every few
seconds), or `"clean"`. Set it in the scene list (top level), or once for the brand in `motifs.json` (`"look"`).
Pick it with the user for a brand, then keep it - the look is part of the brand, the scenes vary under it.

## 5. Bespoke scenes

When an idea needs more than the library (a character, a custom physics gag), write it as a **HyperFrames
composition** - HTML + GSAP - in the brand project's `assets/custom/<file>.html` and use `{"type": "custom", "html":
"<file>.html", "draws": "<what moves besides text>"}` (`motion-graphics.md` section 3 has the rules; HyperFrames' own
skill and `npx hyperframes docs gsap` cover the API). Build it from the brand's motifs (`window.MV_MOTIFS`) and colours
(`window.MV_THEME.color`). `hf_init` never overwrites `assets/custom/`. A reusable bespoke component can instead go in
the runtime (`assets/hyperframes-runtime/src/custom/`, registered in `index.ts`, then `node build.mjs` and re-run
`hf_init`) and be used with `"component": "<Name>"`.

## 6. Check, then render

```bash
node scripts/mg_check.mjs <project>/ads/<name>.json        # PASS required
# ... after the FINAL render, remember what this ad used so the next one varies:
node scripts/mg_check.mjs <project>/ads/<name>.json --record
node scripts/hf_build.mjs <project>/ads/<name>.json --blur      # the final render
```

Render a draft first (`--draft`) and look at one frame per scene before the final render.

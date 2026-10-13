# Editing a testimonial / UGC ad

Read this for Testimonial, Unboxing, Skeptic, Founder and creator-led Day-in-the-Life ads, and for the
talking-head parts of a mixed ad. Captions, text animation, split edits and timing are in
`captions-and-timing.md`.

The rule under all of it: **a transition should serve the beat, never announce itself.**

## Jump cuts are the grammar

Cut testimonial and UGC footage **primarily with jump cuts.** They are the expected grammar of the
format and they reinforce authenticity: a testimonial that is transition-heavy reads as scripted and
corporate, which undercuts the trust the format exists to build. Polish is not a neutral addition
here - it is a cost.

**Use a jump cut whenever you trim** a pause, a filler word or a restart within a single take. That is
most of the work. In a Recharm library it means trimming inside one clip, or cutting between two clips
that share a `rawVideoPublicId` (same creator, same framing, a different moment):

```json
{ "clipSymbol": "<clip A>", "in": 2.0, "out": 5.0 },
{ "clipSymbol": "<clip B, same rawVideoPublicId>", "in": 1.5, "out": 4.5 }
```

Leave `transition` off, or set `"cut"`. Set the in/out points by hand from the word timings: cut in the middle
of a real pause, and end every line 0.3-0.5s after its last word so it never stops abruptly
(`render-and-deliver.md`).

## Match cuts only where something genuinely lines up

**Use a match cut only between two different takes or setups where an action, gesture or gaze
direction genuinely lines up** - a hand lifting a lid cutting to a hand setting down a plate; a look
off-frame left cutting to a look arriving from frame right. Find these by inspecting sprites, not by
hoping.

**Don't force one just to add polish.** If no natural match exists, a clean jump cut or hard cut is
more honest - an invented match reads as a mistake, because the eye notices the near-miss. When you do
land a real one, say so in the summary.

## Keep transitions invisible relative to the talent

Never let a transition effect upstage the person talking. **No swipes, wipes or camera-move
transitions between testimonial clips** - that vocabulary belongs to the product and demo cutaways.

A `move` (push-in, glide) inside a single testimonial clip is usually wrong too: it implies a camera
operator, which contradicts the phone-propped-on-a-shelf read. Reserve it for a product cutaway.

## Cutaways and split edits

Cut to the product **at the moment it is mentioned**, holding the speaker's audio across the cutaway
with an L-cut and bringing them back with a J-cut (`captions-and-timing.md` -> Split edits). **Never put
a split edit across a jump cut between two takes of the same person** - the jump is meant to be
visible, and smearing audio across it makes two takes sound like one bad recording.

## Supporting graphics: three jobs only

Add a graphic only when it is:

- **reinforcing a specific claim being spoken** - a stat callout, a before/after, a price;
- **cutting away from a lull or a stumble** where a jump cut would be jarring;
- **showing the product being used** at the moment it is mentioned.

If none apply, leave clean talking-head footage. **A testimonial over-decorated with graphics reads as
an ad pretending to be UGC, which is worse than plain UGC.**

## Captions

Caption every spoken line unless the clips have captions burned in - in which case add none
(`captions-and-timing.md`). In a hard-cut testimonial, `fadeup` plus at most one `punch` is enough;
sliding text fights the jump cuts.

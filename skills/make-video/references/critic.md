# The independent critic

The builder is never the judge. After the gate passes, a **separate subagent** that did not make the ad reviews
what is on screen and scores it against the rules for its format. It catches what the builder stops seeing:
a swipe between two talking heads, a caption arriving early, a second punch, a scene with nothing but text.
Pattern adapted from echris6/motion-video-kit (critic prompts and issue ledger) and Zane-0x5a/remotion-director
(the critic sees the render, not the plan) - both MIT.

**It is the user's choice.** Offer it with the plan (Step 5 of `SKILL.md`) and run it only if they say yes.
**Cost:** about **75k tokens per review** (measured: 73k and 75k on a 20s ad) and 1-2 minutes; at most **2 rounds**,
so up to ~150k. Longer ads with more captions cost a little more. When they decline, do the same review yourself
from the contact sheet against `qc-checklist.md` - no extra cost, but you are judging your own work.

Give the critic a contact sheet and measured numbers, not the video frame by frame. Run it on the draft when only
the cut is in question, on the final otherwise.

## 1. Build the packet

```bash
node scripts/critic_pack.mjs out/ad.mp4 --edl edl.json --brand <slug> --out critic/
```

It writes `critic/sheet.jpg` (one frame every 0.5s, timestamped), `critic/facts.md` (format, ratio, length,
loudness, cut times, transitions, caption timings and text, effects, overlays, gate result) and copies the
format's rules. It deliberately leaves out the script's intent and the plan's reasoning - the critic judges the
result, not the explanation.

## 2. Spawn the critic

Spawn a general-purpose subagent with this prompt (fill the <...>):

> You are an independent reviewer of a short paid-social ad. You did not make it. Judge only what is on screen
> and in the measured facts. Read: `<critic>/facts.md`, `<critic>/sheet.jpg` (frames every 0.5s, timestamped),
> and the rules in `<critic>/rules/`. The ad's format is <format>.
>
> Score each line 1-5 and cite timestamps as evidence:
> 1. Hook - does the first 1.5s stop the scroll (movement, a named pain, a question, a result)?
> 2. Format grammar - cuts/transitions follow the rules for this format (jump cuts for testimonial; swipes with
>    meaning, harder in the problem half, one match cut at the pivot for promo; per-beat transitions and easing
>    for motion graphics).
> 3. Text - captions synced to speech (none before the words), <= 4-5 words, readable, clear of faces and the
>    product; one scale-pop/punch; no text before its visual beat; no captions over burned-in text.
> 4. Graphics - each supporting graphic does a job (claim, lull, product as mentioned); motion graphics have a
>    non-product graphic in every scene; nothing decorative on a testimonial.
> 5. Variety - not the same transition/direction three times running; scene lengths vary with the beats.
> 6. Brand and claims - only on-brand colours and the logo as published; every number on screen is in facts.md's
>    approved claims list.
> 7. Close - the last beat carries a clear CTA (URL, offer or end card).
>
> Return: the seven scores; a list of ISSUES, each `[blocker|fix|nit] mm:ss - what's wrong - the rule - the
> smallest fix`; and a verdict: SHIP (no blockers, no score under 3) or FIX. Do not suggest new creative
> directions - only fixes against the rules. Be specific and brief.

## 3. Act on it

- **SHIP** - deliver.
- **FIX** - apply the blockers and fixes (not the nits unless trivial), re-render, re-run the gate, and run the
  critic once more. If round 2 still says FIX, deliver with the remaining issues listed for the user rather than
  looping - the user decides.
- Keep the issue list in the delivery summary ("critic: SHIP after 1 fix - moved the CTA caption off the box").

If subagents aren't available, do the same review yourself from the packet, before re-reading the plan.

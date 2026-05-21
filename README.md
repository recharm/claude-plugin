# Recharm Footage Brief — Plugin Tutorial

Turn any creative brief, script, or ad into a shot-by-shot **footage brief** with real clips pulled from your own Recharm library — automatically.

You give it a brief. It breaks the brief into scenes, searches your clip library for footage that fits each scene, actually _looks_ at the candidates, and hands you back a polished, shareable brief with the best clip for every beat.

---

## What it does

When you hand the plugin a brief, it runs this pipeline for you end to end:

1. **Finds your brand.** It checks which brands your Recharm account can access. You don't have to name one (see [Do I need to name my brand?](#do-i-need-to-name-my-brand)).
2. **Sections the brief.** It splits your script/brief into ordered scenes (hook, problem, product demo, testimonial, CTA, etc.), each with a short description of what should be on screen.
3. **Searches your library.** For each scene it generates several visual search phrases and runs them against your Recharm clips using semantic visual search.
4. **Reviews the footage.** It visually checks the top candidates — so picks are based on what actually happens in the clip, not just a filename or a single thumbnail.
5. **Picks the best 1–3 clips per scene**, with a one-line reason each one works.
6. **Builds a shareable brief.** It produces a clean HTML page — every clip shows a playable preview, links into the Recharm app, and lists the exact search phrase that found it — then uploads it and gives you a public share link.

---

## Before you start

- The **Recharm plugin** is installed in your Cowork / Claude workspace.
- You're **signed in to Recharm** with an account that has access to a clip library.
- You have a **brief to work from** — a script, storyboard, shot list, transcript, or even a rough paragraph describing the ad you want to make.

> Your brief can be pasted directly into the chat or uploaded as a file (e.g. a `.txt`, `.md`, or a transcript export). A transcript of an existing ad works great as a starting point.

---

## How to use it

It's a conversation, not a form. The basic flow:

1. **Give it your brief** and ask it to find matching footage.
2. **Confirm the scene breakdown** if it proposes one (optional — you can let it run).
3. **Get your brief back** as a shareable link plus an inline preview.

That's it. The searching and reviewing all happen for you.

### Example prompts

You don't need to mention your brand or know any clip names — just describe what you want.

```
Here's my ad script. Build a footage brief and find clips that match each scene.
[paste or attach the script]
```

```
I uploaded a storyboard. Break it into shots and pull footage from my library for each one.
```

```
Turn this brief into a shot-by-shot footage brief with the best matching clips.
[paste the brief]
```

```
Here's the transcript of an ad I like. Write a brief from it and find clips in my
library that could recreate each beat.
```

```
Find me footage for a 30-second skincare ad: a hook, two product demos, a
testimonial, and a CTA. Suggest the best clip for each.
```

> **Tip:** The more concrete your brief is about what's _on screen_ ("woman ties running shoes on a porch at dawn"), the better the matches. Abstract goals ("morning motivation") give the search less to work with.

---

## What you get back

A single, self-contained HTML brief you can open, share, or hand to an editor. For each scene it contains:

- **The scene heading** and its narrative role (hook / demo / testimonial / CTA …).
- **On screen:** a short description of what that beat needs.
- **Picks:** 1–3 clips, each with a playable inline preview, a link that opens the clip in the Recharm app, and a one-line reason it fits.
- **Notes:** anything useful — e.g. "no strong match for this beat; consider a custom shoot."
- **Search term:** the exact phrase that surfaced each clip, so you can re-run or widen the search yourself.

It ends with an **Overall notes** section: gaps in your library, footage worth shooting custom, and any cross-cutting style observations.

You also get a **public share link** (hosted by Recharm) so you can send the brief to teammates or clients.

---

## Key concepts

| Term                       | What it means                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| **Clip**                   | A curated, named segment of one of your raw videos.                                                |
| **clipName**               | How clips are referred to: `<symbol> - <sceneType>`, e.g. `AJJ - Problem` or `BUE - Finger Scoop`. |
| **Scene / beat / section** | One unit of the brief that needs footage (a shot or moment).                                       |
| **Footage brief**          | The final shareable output: scenes matched to clips.                                               |

---

## FAQ

### Do I need to name my brand?

No. Recharm detects the brands on your account automatically.

- If you have **one brand**, it's used without asking.
- If you have **several**, you'll be asked which one to use — or you can name it in your prompt (e.g. "…from my `acme` library") to skip the question.

### What if there's no good clip for a scene?

It won't pad the brief with weak matches. Instead it marks that scene as needing custom footage and tells you what to shoot — so the gaps are explicit rather than hidden.

### Can I use it on an existing ad I want to recreate?

Yes. Paste or upload the ad's transcript/script and ask it to write a brief and find matching clips. It will reverse-engineer the scene structure and match footage to each beat.

### Can I steer the picks?

Yes. You can ask for a specific aspect ratio (e.g. vertical 9×16), more options per scene, a particular product to be featured, or a re-search of any beat you're not happy with — just ask in the chat.

### Where does the shared brief live?

The HTML brief is uploaded to Recharm's public share storage and you get a link back. Each save creates a fresh link.

---

## A good workflow

1. Start from a real script or a transcript of an ad you admire.
2. Let the plugin section it, and skim the scene breakdown.
3. Review the picks in the returned brief — play the previews inline.
4. Ask it to re-search any beat that feels off, or to widen options.
5. Share the final link with your editor and use the **Overall notes** to plan any custom shoots.

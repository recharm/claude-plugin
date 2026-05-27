# Recharm MCP

Connect your Recharm clip library and brief output directly to Claude (and any other MCP-compatible AI tool) so you can turn briefs into shot-by-shot footage briefs without leaving the chat.

---

The Recharm MCP exposes your Recharm clip library and brief authoring through a read/write MCP server with **7 tools across four categories**, accessible from any MCP-compatible client. Once authenticated, your AI tool can list the brands you have access to, browse the label taxonomy your team has built, run semantic visual search across your clips, pull poster/sprite preview imagery, and publish a finished, shareable HTML brief — directly from a conversation.

Think of it as a bridge between Recharm and the AI tools you already use. Describe an ad you want to make and Claude can section it into scenes, search your library for footage that fits each beat, and hand you back a public share link to a polished brief — all powered by your actual account data.

MCP (Model Context Protocol) is an open standard that works across AI platforms. Connect once and you're good to go.

---

## What you can do with the Recharm MCP

The MCP gives your AI tool access to 7 specialized tools across four categories. Here's what that unlocks:

### Find and explore your library

Ask which brands are in your Recharm account, see the full label taxonomy your team has built (Scene Type, Creator, Product, Benefit, Food, Stove, Language, and more), and use those labels to constrain searches before you even start matching scenes.

### Run semantic visual search

Describe what you want on screen ("egg slides easily out of a nonstick pan", "metal spatula scraping inside the pan", "macro close-up of the hexagonal hybrid surface") and the MCP returns the clips that visually match, ranked by similarity. Pair the text query with label filters (e.g. Creator = Gordon Ramsay, Actor Type = Actor B-roll) to get tightly targeted results.

### Preview clips without leaving the chat

Pull a poster frame or a sprite (a strip of frames sampled across the clip) so Claude can confirm a candidate before it makes a pick — selections aren't based on a filename alone.

### Publish a shareable brief

When the scene-by-scene picks are final, save them as a single self-contained HTML brief. The server renders every clip's playable preview, links into the Recharm app, and the search phrase that surfaced it — then uploads the page and returns a public share link.

---

## Before you connect

- A **Recharm account** with access to at least one brand's clip library.
- An **MCP-compatible AI tool** (Claude, ChatGPT, Cursor, or anything else that speaks MCP).
- A **brief to work from** — a script, storyboard, shot list, transcript, or even a rough paragraph describing the ad you want to make.

> Your brief can be pasted directly into the chat or uploaded as a file. A transcript of an existing ad works great as a starting point — Claude will reverse-engineer the scene structure and pull matching footage.

---

## MCP Server URL

All connections use the same server URL:

```
https://mcp.recharm.com/mcp
```

Point any MCP-compatible client at this URL and complete the OAuth flow on first use.

---

## Get set up

The Recharm MCP is delivered as a Recharm plugin for Claude / Cowork. Once the plugin is installed in your workspace, the MCP server is available automatically and the tools are exposed to Claude.

### Connect to Claude

1. Install the Recharm plugin in your Claude / Cowork workspace — or add `https://mcp.recharm.com/mcp` as a custom connector in **Settings → Connectors**.
2. The first time you call a Recharm tool, Claude will walk you through the OAuth flow — sign in with your Recharm credentials.
3. Once you're connected, just start asking Claude to build briefs and find clips.

### Connect to ChatGPT, Cursor, or another MCP client

Any MCP-compatible client can connect to the Recharm MCP server by pointing at `https://mcp.recharm.com/mcp`. Most clients accept a configuration like:

```json
{
	"mcpServers": {
		"recharm": {
			"url": "https://mcp.recharm.com/mcp"
		}
	}
}
```

Your client will walk you through the OAuth flow on first use.

---

## Authentication and permissions

When you connect the Recharm MCP for the first time, you'll go through an OAuth flow where you log in to your Recharm account. This securely grants your AI tool access to your data without sharing your password.

Keep in mind:

- You need to authenticate with an existing Recharm account.
- Once authenticated, you have access to the brands and clip libraries your Recharm account is entitled to — the same data you can see in the Recharm app.
- Each user authenticates individually. Your AI tool only sees data you have permission to access.
- `save_brief` writes — it creates a new public share URL on Recharm-hosted storage. The other tools are read-only.

---

## Available tools

The Recharm MCP gives your AI tool access to 7 tools organized into four categories. Your AI tool calls these automatically based on your questions. You don't need to reference tool names directly.

### Auth and context

| Tool                  | What it does                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Whoami** (`whoami`) | Returns the authenticated user's identity and the Recharm account context. Useful for confirming who's connected before running other tools. |

### Library discovery

| Tool                            | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **List Brands** (`list_brands`) | Returns the brands your Recharm account can access. Call this first when you don't already know the brand slug. If you only have access to one brand, it can be used automatically.                                                                                                                                                                                                                                                         |
| **List Labels** (`list_labels`) | Returns the full label taxonomy for a brand, organised by category. Typical categories include `Scene Type`, `Creator`, `Product`, `Benefit`, `Food`, `Audio Type`, `Actor Type`, `Captions`, `Shot Position`, `Content`, `Language`, `Talent`, `Stove`, `Recording type`, `Usage`, `Shoot`, `Batch`, and more. Use the returned values as filter labels when searching — only labels that appear in this response are valid filter inputs. |

### Visual search

| Tool                                                | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Search Clips Visually** (`search_clips_visually`) | The primary search tool. Pass a text query describing what should literally be on screen (e.g. _"woman tying running shoes on porch"_) plus an optional `filters` object built from `list_labels` values. Returns matching clips ranked by `cosineDistance` (lower = closer) along with `clipSymbol`, `clipName`, `rawVideoPublicId`, `sceneType`, `durationMs`, and the top labels attached to each clip. Single-page response — no pagination. |

### Clip previews

| Tool                                                | What it does                                                                                                                                                                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Get Clip Poster Image** (`get_clip_poster_image`) | Returns a representative still frame for a clip. Use this when you want a quick visual confirmation of a single pick.                                                                                                  |
| **Get Clip Sprite Image** (`get_clip_sprite_image`) | Returns a sprite sheet — a strip of frames sampled across the clip's timeline — so the AI (or you) can see what actually happens in the clip end-to-end. Stronger signal than a single poster for fast-moving footage. |

### Brief authoring

| Tool                          | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Save Brief** (`save_brief`) | Publishes a finished footage brief. Accepts a slim v2 structured payload — `{ title, scenes: [{ name, description, clips: [{ clipSymbol, searchString, filters }] }] }` — and the server derives every clip's URLs, name, duration, and aspect ratio from its `clipSymbol`, renders the HTML, uploads it, and returns `{ url, briefId, s3Key }`. Each call mints a new shareable URL. Call this exactly once per brief, after all picks are final. |

---

## Thought starters to get you going

Below are prompts grouped around the typical Recharm workflow — describe a brief, get a footage brief back. Copy any of these directly into Claude, or use them as jumping-off points.

### Build a brief from a script

```
Here's my ad script. Build a footage brief and find clips that match each scene.
[paste or attach the script]
```

```
Turn this brief into a shot-by-shot footage brief with the best matching clips.
[paste the brief]
```

```
Here's the transcript of an ad I like. Write a brief from it and find clips in my
library that could recreate each beat.
```

### Constrain by creator, product, or language

```
Replicate this ad and suggest clips that match it. I prefer clips from
Gordon Ramsay.
[paste the transcript]
```

```
Find me footage for a 30-second skincare ad with a hook, two product demos,
a testimonial, and a CTA. Prefer UGC over studio.
```

```
Build a brief for our Hybrid Pan launch in Spanish — match each scene to a
clip from the Spanish-language section of the library.
```

### Explore the library before briefing

```
What brands do I have access to on Recharm?
```

```
List the Scene Type and Creator labels for hexclad so I know what's available
before I write the brief.
```

```
Show me Gordon Ramsay clips tagged Easy Clean Up.
```

### Re-search and iterate

```
The picks for Scene 4 feel weak — re-search with different phrasing and look
for macro close-ups of the pan surface specifically.
```

```
Widen the search for the egg-slide scene and include UGC creators, not just
studio shots.
```

---

## Tips for better results

**Describe what's literally on screen.** "Woman ties running shoes on a porch at dawn" gives the visual search more to work with than "morning motivation." Concrete subjects, framings, and environments produce better matches.

**Lean on labels.** Once Claude has called `list_labels`, ask it to filter by Scene Type, Creator, Product, Benefit, or Actor Type. Combining a few labels is a fast way to narrow a noisy result set — but stacking too many categories will starve the search of results.

**Constrain by Actor Type when you have a voiceover.** If you're handing Claude a script or transcript that will be read as VO, ask for `Actor B-roll` and `No Actor` clips so the visuals don't lip-sync conflict with the narration.

**Skim the scene breakdown before searches run.** Claude proposes a scene-by-scene breakdown before searching. Catching a misread scene at that point saves a round of searches.

**Call out gaps explicitly.** Recharm won't pad a brief with weak matches — it leaves a scene blank and flags it. Use those gaps to plan custom shoots.

---

## Troubleshooting

**I can't authenticate.** Make sure you're signing in with a Recharm account that has library access. Each user authenticates individually.

**Searches return nothing.** Most often this means the filters are too tight. Try dropping a category (e.g. remove the Creator constraint and keep only Scene Type), or rephrase the text query to describe what's literally on screen rather than an abstract concept.

**A label filter is rejected.** Only labels returned by `list_labels` for that brand are valid. If you (or Claude) guessed a label string, the API will reject it. Re-run `list_labels` and use the exact values.

**The brief link is missing clips I expected.** Each scene shows the clips Claude actually picked. If a clip you wanted isn't there, ask Claude to re-search that scene with different phrasing or different filters, then re-save the brief — every `save_brief` call mints a new URL.

**Same source video keeps appearing across scenes.** Clips that share a `rawVideoPublicId` come from the same underlying video and look near-identical. The MCP picks one per scene; if you want more variety, ask Claude to broaden the search or to dedupe more aggressively.

---

## Security and data privacy

The Recharm MCP uses OAuth for authentication. Your credentials are never shared with or stored by your AI tool.

Each user authenticates individually and can only access the brands and clips they have permissions for in Recharm.

Most of the MCP is read-only — `list_brands`, `list_labels`, `search_clips_visually`, `get_clip_poster_image`, `get_clip_sprite_image`, and `whoami` only retrieve data. `save_brief` is the only write operation: it publishes a new HTML brief to Recharm-hosted public share storage and returns a URL. It does not modify your clip library or account settings.

You can disconnect the MCP at any time from your AI tool's settings to revoke access immediately.

---

## FAQs

**Do I need to name my brand?**

No. Claude can call `list_brands` to see what's on your account. If you have one brand it's used automatically; if you have several, Claude will ask which one to use — or you can name it in your prompt (e.g. _"…from my `hexclad` library"_) to skip the question.

**Can I use it on an existing ad I want to recreate?**

Yes. Paste or upload the ad's transcript or script and ask Claude to write a brief and find matching clips. It will reverse-engineer the scene structure and match footage to each beat.

**What if there's no good clip for a scene?**

Claude won't pad the brief with weak matches. Instead it marks that scene as needing custom footage and explains what to shoot — so the gaps are explicit rather than hidden.

**Can I steer the picks?**

Yes. Ask for a specific creator, product, language, aspect ratio, or content style (UGC vs studio). You can also ask Claude to re-search any beat you're not happy with — just say so in chat.

**Where does the shared brief live?**

The HTML brief is uploaded to Recharm's public share storage and you get a link back. Each `save_brief` call creates a fresh URL.

**Which AI tools are supported?**

Any tool that supports the Model Context Protocol — Claude, ChatGPT, Cursor, and others. Recharm is delivered as a plugin for Claude / Cowork; other MCP clients can point at the Recharm MCP server directly.

**Can multiple team members connect?**

Yes. Each team member authenticates individually and has access based on their own Recharm permissions.

**How do I disconnect?**

Remove the Recharm connector / plugin from your AI tool's settings. This immediately revokes the AI tool's access to your Recharm data.

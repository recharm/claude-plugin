# Briefotron

A Claude Code plugin that turns a creative brief into a shot-by-shot brief with concrete footage picks from your [Recharm](https://recharm.com) library.

It bundles two things into a single one-step install:

1. A connection to the Recharm MCP server (`search_videos_visually`, `get_poster_image`, `list_brands`).
2. A skill (`briefotron`) that drives the loop: section the brief → search per section → visually review the candidates → produce a final brief with picks.

## Install

From a Claude Code session:

```
/plugin marketplace add recharm/claude-plugins
/plugin install briefotron@recharm
```

(Replace `recharm/claude-plugins` with wherever the marketplace is actually hosted.)

Or install directly from a local checkout for development:

```
/plugin install --dir /path/to/briefotron
```

You will be asked to authenticate with Recharm the first time the MCP server is invoked.

## Use

In any Claude Code session after install, paste or attach a brief and say something like:

> Here's a brief for our spring running campaign. Find me footage in our Recharm library for each section.

The skill will activate automatically.

## Layout

```
briefotron/
├── .claude-plugin/
│   ├── plugin.json          # plugin manifest
│   └── marketplace.json     # marketplace entry (for self-hosting)
├── .mcp.json                # Recharm MCP server connection
├── skills/
│   └── briefotron/
│       └── SKILL.md         # orchestration instructions
└── README.md
```

## Note for Claude.ai users

Plugins are a Claude Code (CLI / desktop) feature. They do not install in the Claude.ai web app. Claude.ai users should add the Recharm MCP connector directly and use the skill's instructions as a prompt template.

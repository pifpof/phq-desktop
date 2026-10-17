# PositioningHQ Desktop

Free, open-source desktop app that guides a founder through building a positioning and competitive-intelligence wiki, using your own AI API key. Everything is stored in a local folder you choose.

Made by [Parallel79°](https://parallel79.com). MIT licence.

## Develop

```
nvm use
npm install
npm run dev
```

Other commands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build:mac` (also `:win`, `:linux`).

## What it does

1. Connect your own Anthropic key (stored encrypted on this computer) and choose a folder.
2. Tell it about your company. Add any decks, case studies or notes you have.
3. Research runs: it reads your website, finds your social profiles, researches your market and competitors, and writes a seven-section **Positioning Playbook** and a critical **Messaging Analysis**. A typical run takes 5 to 10 minutes and costs a few dollars on your account, with a budget cap you set.
4. Your workspace is an **[llm-wiki](https://github.com/nvk/llm-wiki) topic wiki**: small articles in `wiki/` (the ideal customer profile, each value driver, each competitor) that cite their sources in `raw/` (your website, cited web pages, your own files, tagged `private`). The playbook and messaging analysis are assembled into `output/` from the articles. Edit an article in Obsidian or any editor, then Reassemble the playbook at no cost.
5. Chat with an assistant that reads the wiki index-first and cites the articles it used. Record positioning decisions; research never contradicts them.
6. Use the wiki outside the app: point Claude, ChatGPT, Cursor or any agent at the folder and tell it to read `README.md` first, export it as one file (private articles left out by default), or register it in your llm-wiki hub.

Workspaces from v1 convert to the wiki format in the app, after a verified backup.

## Wiki format

The format contract is `docs/v2/WIKI-FORMAT-SPEC.md` (format version 1, based on llm-wiki v0.25.x). `npm run wiki:lint -- <folder>` runs the official llm-wiki lint at the pinned tag; CI lints the test wikis with it.

## Skills

The positioning framework comes from the [PositioningHQ skill pack](https://github.com/pifpof/positioningHQ) (MIT), vendored in `resources/skills/` at a pinned commit. Update it with `npm run skills:sync -- --commit <sha>`. Skills written for this app sit beside it.

## Docs

Specs and acceptance records are in `docs/`.

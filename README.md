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
4. Everything is plain markdown in your folder, readable in Obsidian or any editor. Chat with an assistant grounded in your playbook.

## Skills

The positioning framework comes from the [PositioningHQ skill pack](https://github.com/pifpof/positioningHQ) (MIT), vendored in `resources/skills/` at a pinned commit. Update it with `npm run skills:sync -- --commit <sha>`. Skills written for this app sit beside it.

## Docs

Specs and acceptance records are in `docs/`.

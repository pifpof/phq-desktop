# PositioningHQ Desktop

Free, open-source (MIT) desktop app by Parallel79°. It guides a founder through building a positioning and competitive-intelligence wiki using their own LLM API key. Everything is stored in a local folder they choose.

**Current milestone: v0 scaffold.** Wizard (Welcome, Connect AI, Verify, Workspace, Done) into a working chat. Specs: `docs/REQUIREMENTS.md`. Build order: `docs/IMPLEMENTATION_PLAN.md`. Work the plan phase by phase; don't skip ahead, and don't add features outside v0 scope (REQUIREMENTS 2.2) without asking Shahed.

## Stack

Electron + electron-vite, React, TypeScript (strict), Tailwind v4, shadcn/ui, Zustand, zod, `@anthropic-ai/sdk`, electron-builder, Vitest. npm. Node LTS from `.nvmrc`.

## Commands

- `npm run dev`: run the app with hot reload
- `npm run typecheck` / `npm run lint` / `npm test`: run all three before every commit
- `npm run build:mac` (also `:win`, `:linux`): package unsigned artifacts into `dist/`

## Architecture rules (do not break)

1. **Main owns privilege.** The API key, every provider call, file system access and settings live in `src/main/`. The renderer is UI only and makes zero network requests.
2. **IPC goes through the contract.** Every channel is defined once in `src/shared/ipc-contract.ts` with zod schemas. Add a channel there first, then the handler, then the preload method. Handlers validate payloads and check the sender. Never throw raw errors across IPC; return `{ ok: false, error: { code, message } }`.
3. **Preload exposes `window.api` only.** Never expose `ipcRenderer`, `require` or Node APIs.
4. **The key never leaves main.** Never log it, put it in settings, return it to the renderer, include it in an error, or write it to disk except through `services/secrets.ts` (`safeStorage`). Display only the masked form.
5. **Never hardcode model IDs.** Models come from the provider's live models list. The default rule (newest `sonnet`) lives in the provider.
6. **Providers implement `src/main/providers/types.ts`.** Only Anthropic exists in v0. Nothing outside `providers/` imports a provider SDK.
7. **Chat runs in modes.** `ChatSession` takes a `modeId`; system prompts live in `src/main/modes/`. The renderer never sends a system prompt. Future interview flows are new modes, not new chat components.
8. **The workspace folder is the source of truth** for user content (later versions write markdown with YAML front matter there). Don't add a database that duplicates file content. v0 writes only `.positioninghq/workspace.json`.
9. **Cross-platform.** All `process.platform` branching lives in `src/main/platform/`. Use `app.getPath()` and `path.join`; never hardcode separators or home paths. CI builds macOS, Windows and Linux; keep it green.
10. **Security settings stay on:** `contextIsolation`, `sandbox`, no `nodeIntegration`, strict CSP, navigation lock, external links only via the allowlist in `ipc/shell.ts`.

## Design system

Match parallel79.com exactly. Source of truth, read these rather than guessing:

- Tokens and base type: `/Users/shahedkhalili/src/parallel79.com/p79/src/styles/globals.css`
- Button variants: `/Users/shahedkhalili/src/parallel79.com/p79/src/components/ui/button.tsx`
- Fonts: `/Users/shahedkhalili/src/parallel79.com/p79/src/fonts/` (copied into `src/renderer/src/assets/fonts/`)
- Spec and rationale: `/Users/shahedkhalili/src/parallel79.com/change-order-006-theme-and-typography.md`

Rules:

- Use tokens (`bg-primary`, `text-muted-foreground`, `border-border`), never raw hex in components.
- Headings, wordmark and numerals: DejaVu Serif 700. Everything else: Inter. No Google Fonts.
- Teal `#2e7a7f` for primary actions and links. `#499fa4` (`primary-light`) never for text under 24px.
- Radii: buttons and inputs 10px, cards 12px, wizard card, dialogs and menus 16px.
- Light only. No dark mode in v0.
- App sizes (REQUIREMENTS 6.2) replace the site's `clamp()` sizes.

## Copy rules

- **No em dashes** in any UI string. Use commas, colons or full stops.
- Plain, direct, short sentences. No marketing jargon.
- "PositioningHQ" (one word, capital HQ). "Parallel79°" with the degree sign.
- Use the exact copy in REQUIREMENTS section 3 where it's given.

## Verifying work

1. `npm run typecheck && npm run lint && npm test`.
2. Run the app and check the change by hand. Typecheck doesn't catch layout, streaming or IPC bugs.
3. For anything touching the key: confirm nothing with `sk-ant-` appears in logs, `settings.json`, or renderer DevTools (Console, Network, Application).
4. At the end of each phase, check the plan's **Done when** criteria and commit.

## Repo

Public GitHub repo `positioninghq-desktop`, MIT. Separate from the skill-pack repo `github.com/pifpof/positioningHQ`, which later supplies the positioning framework and templates.

# PositioningHQ Desktop

Free, open-source (MIT) desktop app by Parallel79°. It guides a founder through building a positioning and competitive-intelligence wiki using their own LLM API key. Everything is stored in a local folder they choose.

**Current milestone: v3 (wiki navigation: the Wiki pane's article tree).** v0, v1 and v2 are done and tested. Specs: `docs/v3/REQUIREMENTS-v3.md`. Build order: `docs/v3/IMPLEMENTATION_PLAN-v3.md`. Don't add features outside v3 scope (REQUIREMENTS-v3 1.1) without asking Shahed.

v2 still applies unless v3 changes it: `docs/v2/REQUIREMENTS-v2.md`, the format contract `docs/v2/WIKI-FORMAT-SPEC.md` (unchanged in v3, and it wins over the requirements if they disagree), and the Phase 0 findings in `docs/v2-assumptions.md`. v0 and v1 specs (`docs/v0/`, `docs/v1/`) still apply unless a later version changes them. Work the plan phase by phase; don't skip ahead.

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
8. **The workspace folder is the source of truth** for user content. Don't add a database that duplicates file content. From v2, app state (`workspace.json`, `profile.json`, runs, chats, `provenance.json`) lives in `userData/workspaces/<workspace_id>/`, never inside the wiki.
9. **Cross-platform.** All `process.platform` branching lives in `src/main/platform/`. Use `app.getPath()` and `path.join`; never hardcode separators or home paths. CI builds macOS, Windows and Linux; keep it green.
10. **Security settings stay on:** `contextIsolation`, `sandbox`, no `nodeIntegration`, strict CSP, navigation lock, external links only via the allowlist in `ipc/shell.ts`.

## Design system

Match parallel79.com exactly. Source of truth, read these rather than guessing:

- Tokens and base type: `../parallel79.com/p79/src/styles/globals.css`
- Button variants: `../parallel79.com/p79/src/components/ui/button.tsx`
- Fonts: `../parallel79.com/p79/src/fonts/` (copied into `src/renderer/src/assets/fonts/`)
- Spec and rationale: `../parallel79.com/change-order-006-theme-and-typography.md`

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

Public GitHub repo `phq-desktop`, MIT. Separate from the skill-pack repo `github.com/pifpof/positioningHQ`, which later supplies the positioning framework and templates.

## v1 rules (do not break)

11. **Isolation.** Web tasks never receive user files or extracted file text. Synthesis tasks receive user files and get no web tools. No task gets local tools; the main process writes AI output to fixed paths. A unit test enforces this. From v2 the boundary is the `private` tag: a web task may receive only raw files without `private` and articles whose source chain has no `private` file. A schema-only output tool (it performs no action; main validates its arguments and writes to paths derived from the slug) is allowed.
12. **Web content is data.** Crawled pages, search results and user files are wrapped as documents and never treated as instructions.
13. **Skills are vendored** into `resources/skills/` at a pinned commit (`npm run skills:sync`). Prompts are never downloaded at runtime.
14. **Markdown is the source of truth.** `profile.json`, run files and chats are app state. Every user-facing document is markdown with YAML front matter. Tolerate files edited, moved or deleted outside the app.
15. **No file content in logs.** Never log user file content, crawled text or model output.
16. **Tool version strings** (web search, web fetch) live in one constants file.

## v2 rules (do not break)

17. **The wiki format is a contract.** Every file the app writes in a workspace follows `docs/v2/WIKI-FORMAT-SPEC.md`. Only spec-listed files and folders at the root, in `raw/` and in `wiki/`. Only spec front matter keys; generator details go to `provenance.json` and `log.md`.
18. **Raw is immutable.** Never edit a file in `raw/` after its ingest ends. New evidence is a new dated file.
19. **Front matter through `wiki/frontmatter.ts` only.** llm-wiki's parser is line-based: single-line scalars, two-space block lists. Never write wiki front matter with gray-matter's `stringify`.
20. **Indexes are derived.** Regenerate `_index.md` files from front matter after every write; never hand-edit them. No model call in index generation or playbook assembly.
21. **Lint stays green.** `tests/fixtures/phq-wiki-min` and `tests/fixtures/phq-wiki-generated` pass `llm-wiki lint --fail-on warning` at the pinned tag (`docs/v2-assumptions.md`).


# PositioningHQ Desktop: v0 Implementation Plan

**Date:** 2026-10-16
**Reads with:** `REQUIREMENTS.md` (what and why), `CLAUDE.md` (rules for the session)
**Target:** a working, installable Mac build by Sunday night; Windows and Linux building in CI.

Work through the phases in order. Each phase ends with a **Done when** check. Don't start a phase until the previous one passes. Commit at the end of every phase.

---

## Stack (approved 2026-10-16)

| Layer           | Choice                                                            |
| --------------- | ----------------------------------------------------------------- |
| Shell           | Electron, current stable                                          |
| Build tooling   | electron-vite (Vite for main, preload and renderer)               |
| UI              | React, TypeScript (strict)                                        |
| Styling         | Tailwind CSS v4, shadcn/ui (new-york style, lucide icons)         |
| State           | Zustand (renderer)                                                |
| Validation      | zod (IPC boundary)                                                |
| Markdown        | react-markdown + remark-gfm                                       |
| Model SDK       | `@anthropic-ai/sdk` (main process only)                           |
| Secrets         | Electron `safeStorage`                                            |
| Packaging       | electron-builder                                                  |
| Tests           | Vitest (unit); Playwright for Electron later                      |
| Lint and format | ESLint (flat config), Prettier with `prettier-plugin-tailwindcss` |
| CI              | GitHub Actions, macOS + Windows + Linux matrix                    |
| Package manager | npm; Node current LTS pinned in `.nvmrc`                          |

Use the latest stable versions at install time. Don't pin to versions from memory; check `npm view <pkg> version` if unsure.

---

## Repo structure

```
phq-desktop/
├── CLAUDE.md
├── README.md
├── LICENSE                        MIT, copyright Parallel79°
├── .nvmrc
├── docs/
│   ├── REQUIREMENTS.md
│   └── IMPLEMENTATION_PLAN.md
├── electron.vite.config.ts
├── electron-builder.yml
├── package.json
├── tsconfig.json / tsconfig.node.json / tsconfig.web.json
├── eslint.config.mjs
├── .prettierrc
├── .github/workflows/build.yml
├── resources/                     app icons (icon.icns, icon.ico, icon.png)
├── src/
│   ├── shared/                    imported by main, preload and renderer; no Node or DOM APIs
│   │   ├── ipc-contract.ts        channel names + zod schemas + inferred types
│   │   ├── errors.ts              ProviderErrorCode union + display copy
│   │   └── types.ts               AppState, ModelInfo, ChatMessage, ChatStreamEvent, ModeId
│   ├── main/
│   │   ├── index.ts               app lifecycle, single-instance lock, menu
│   │   ├── window.ts              BrowserWindow creation, security settings, CSP, navigation lock
│   │   ├── launch.ts              computes the initial route (REQUIREMENTS 4.5)
│   │   ├── log.ts                 redacting logger to userData/logs
│   │   ├── ipc/
│   │   │   ├── register.ts        registers all handlers; sender check; zod parse
│   │   │   ├── app.ts
│   │   │   ├── provider.ts
│   │   │   ├── workspace.ts
│   │   │   ├── chat.ts            stream registry (streamId -> AbortController)
│   │   │   └── shell.ts           openExternal with allowlist
│   │   ├── services/
│   │   │   ├── settings.ts        settings.json read/write (atomic)
│   │   │   ├── secrets.ts         safeStorage wrapper, Linux backend check, session-only fallback
│   │   │   └── workspace.ts       default path, writability check, marker create/read
│   │   ├── providers/
│   │   │   ├── types.ts           Provider interface
│   │   │   ├── registry.ts        id -> Provider
│   │   │   └── anthropic.ts       verifyKey, listModels, streamChat, error mapping
│   │   ├── modes/
│   │   │   ├── index.ts           ModeId -> { title, systemPrompt }
│   │   │   └── general.ts         v0 system prompt
│   │   └── platform/
│   │       └── index.ts           ALL process.platform branching lives here
│   ├── preload/
│   │   └── index.ts               contextBridge.exposeInMainWorld('api', ...)
│   └── renderer/
│       ├── index.html             CSP meta tag
│       └── src/
│           ├── main.tsx
│           ├── App.tsx            route switch: onboarding | chat
│           ├── styles/globals.css copied tokens + @font-face + app overrides
│           ├── assets/fonts/      DejaVu Serif woff2 + licence
│           ├── lib/api.ts         typed wrapper around window.api
│           ├── lib/utils.ts       cn()
│           ├── store/app.ts       Zustand: app state, route
│           ├── store/chat.ts      Zustand: messages, streaming state
│           ├── components/ui/     shadcn primitives (restyled)
│           ├── components/        DragRegion, Wordmark, NumberedStep, Markdown
│           └── features/
│               ├── onboarding/    Welcome, ConnectAI, Verify, Workspace, Done, WizardShell
│               ├── chat/          ChatSession (takes a mode), MessageList, Message, Composer, EmptyState
│               └── settings/      SettingsSheet
└── tests/
    └── unit/                      secrets, settings, workspace, anthropic error mapping, ipc schemas
```

---

## Phase 0: Repo and scaffold (Sat morning, about 1 hour)

1. Create the GitHub repo `phq-desktop` (public, MIT). Clone it.
2. Scaffold with the electron-vite React + TypeScript template (`npm create @quick-start/electron@latest`, choose React and TypeScript), into the repo root.
3. Rearrange to match the structure above. Add `src/shared/`.
4. Add `.nvmrc` (current Node LTS), `LICENSE`, a short `README.md` (what it is, `npm install`, `npm run dev`).
5. Put `REQUIREMENTS.md` and `IMPLEMENTATION_PLAN.md` in `docs/` and `CLAUDE.md` at the root.
6. Set `appId: com.parallel79.positioninghq` and `productName: PositioningHQ` in `electron-builder.yml`.
7. Add scripts: `dev`, `build`, `build:mac`, `build:win`, `build:linux`, `lint`, `typecheck`, `test`, `format`.
8. Set the TypeScript path alias `@/` to `src/renderer/src/` for the renderer, and `@shared/` to `src/shared/` for all three targets.

**Done when:** `npm run dev` opens a window with the template page; `npm run typecheck` and `npm run lint` pass.

---

## Phase 1: Window hardening (Sat morning, about 45 minutes)

1. In `window.ts`: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `backgroundColor: '#ffffff'`, `show: false` then show on `ready-to-show`.
2. Window size 1100 x 760, minimum 820 x 600. Persist bounds in settings.
3. macOS: `titleBarStyle: 'hiddenInset'` (via `platform/index.ts`).
4. CSP via `<meta http-equiv="Content-Security-Policy">` in `index.html`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self'`. (`'unsafe-inline'` styles are needed by some Radix components; scripts stay strict.) Allow the Vite dev server only when `!app.isPackaged`.
5. Navigation lock: `will-navigate` prevented unless the URL is the app's own; `setWindowOpenHandler` returns `{ action: 'deny' }` and routes allowlisted https URLs to `shell.openExternal`.
6. Single-instance lock; a second launch focuses the existing window.
7. Menus: macOS app menu + Edit menu; Windows and Linux minimal menu. `Cmd/Ctrl+,` opens Settings (sends an event to the renderer).
8. `log.ts`: append-only file in `app.getPath('logs')`, rotate at 5 MB, with a `redact()` that strips anything matching `sk-ant-[A-Za-z0-9_-]+` before writing.

**Done when:** the app opens with no white flash; DevTools shows the CSP is active; clicking a test external link opens the browser; `window.open` from DevTools console is blocked.

---

## Phase 2: Design system (Sat midday, about 1.5 hours)

1. Install Tailwind v4 (`tailwindcss`, `@tailwindcss/vite`), `tw-animate-css`, `@fontsource-variable/inter`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`.
2. Run `npx shadcn@latest init` for the renderer (new-york style, neutral base, CSS variables, lucide). Point it at `src/renderer/src/styles/globals.css`.
3. Replace the generated tokens with the `:root` and `@theme inline` blocks from `../parallel79.com/p79/src/styles/globals.css`. Delete `.dark`. Copy the `@layer base` heading rules and the `eyebrow`, `lede`, `numeral`, `h3-list` utilities. Do not copy the `container` utility or the smooth-scroll rules.
4. Copy `dejavu-serif-400.woff2`, `dejavu-serif-700.woff2` and `LICENSE-DejaVu.txt` from `../parallel79.com/p79/src/fonts/` into `src/renderer/src/assets/fonts/`. Add `@font-face` rules for `"DejaVu Serif"` (400 and 700, `font-display: swap`) and set `--font-dejavu-serif: "DejaVu Serif";` in `:root`. Import `@fontsource-variable/inter` in `main.tsx`.
5. Override heading sizes for the app (REQUIREMENTS 6.2): replace the `clamp()` values with fixed app sizes.
6. Copy `../parallel79.com/p79/src/components/ui/button.tsx` into `components/ui/`. Add shadcn Input, Textarea, Label, Select, Dialog, Sheet, Badge, Tooltip, Separator, ScrollArea and restyle to REQUIREMENTS 6.3 (10px input radius, 16px dialog radius with `--shadow-menu`, pill badges).
7. Build small shared components: `Wordmark`, `DragRegion` (macOS only, 28px, `-webkit-app-region: drag`; interactive children set `no-drag`), `NumberedStep`.
8. Temporary `DesignCheck` screen rendering headings, lede, eyebrow, every button variant, input, badge, card and numbered steps. Remove it at the end of the phase.

**Done when:** the DesignCheck screen, side by side with parallel79.com in a browser, uses the same fonts, teal, borders and button shapes; DevTools Network shows no external font requests.

---

## Phase 3: IPC contract, settings and secrets (Sat afternoon, about 1.5 hours)

1. `shared/ipc-contract.ts`: one object listing every channel from REQUIREMENTS 4.2 with its zod request and response schemas. Export inferred types. This file is the single source of truth for IPC.
2. `preload/index.ts`: expose `window.api` with one method per invoke channel plus `onChatEvent(cb)` returning an unsubscribe function. Nothing else. Add the `Window` type declaration.
3. `ipc/register.ts`: a helper `handle(channel, fn)` that checks `event.senderFrame` is the app's own URL, parses the payload with the channel's zod schema, calls `fn`, and returns a typed result. Errors become `{ ok: false, error: { code, message } }`; never throw raw errors across IPC.
4. `services/settings.ts`: load with defaults; `schemaVersion: 1`; atomic save (write `settings.json.tmp`, then rename).
5. `services/secrets.ts`:
   - `isSecureStorageAvailable()`: `safeStorage.isEncryptionAvailable()`, and on Linux also `getSelectedStorageBackend() !== 'basic_text'` (call via `platform/`).
   - `saveKey(key)`: if secure, encrypt and write `secrets.bin`; otherwise hold in memory and return `{ persisted: false }`.
   - `loadKey()`: read and decrypt; return null on missing or decrypt failure (log the failure type, never the content).
   - `deleteKey()`, `maskedKey()` (returns `sk-ant-...` + last 4).
6. `launch.ts` implementing REQUIREMENTS 4.5; exposed through `app:getState`.
7. Unit tests: settings defaults and atomic write; secrets round trip with `safeStorage` mocked; secure-storage-unavailable path; masked key; launch routing for all four cases; every zod schema rejects a malformed payload.

**Done when:** tests pass; from DevTools, `await window.api.getState()` returns the expected shape and `window.require` is undefined.

---

## Phase 4: Anthropic provider (Sat afternoon, about 1.5 hours)

1. `providers/types.ts`: the `Provider` interface from REQUIREMENTS 4.3. `ModelInfo = { id, displayName, createdAt }`.
2. `providers/anthropic.ts` using `@anthropic-ai/sdk`:
   - `listModels(key)`: page through the Models API; map to `ModelInfo`. Keep the API's ordering (newest first).
   - `verifyKey(key)`: `listModels`, then a `messages.create` with `max_tokens: 1` and a one-word user message, using the default model chosen by the rule below. Return `{ ok: true, models, defaultModelId }` or a mapped error.
   - `streamChat(...)`: `client.messages.stream({ model, system, messages, max_tokens })` with the abort signal passed in the request options. Forward text deltas as `delta` events; on finish emit `usage` (input and output tokens from the final message) then `done`. `max_tokens` is 8192 for v0.
   - Default model rule: first model whose ID contains `sonnet`; else the first model.
   - Error mapping: SDK `AuthenticationError` -> `invalid_key`; `PermissionDeniedError` -> `no_permission`; 400 whose message mentions credit balance -> `no_credit`; `RateLimitError` -> `rate_limited`; status 529 or `overloaded_error` -> `overloaded`; `APIConnectionError` -> `network`; abort -> no error (stream ends as stopped); anything else -> `unknown` with the API error type only.
3. `shared/errors.ts`: display copy for each code (from REQUIREMENTS 3.3).
4. `modes/general.ts`: a short system prompt, for example: "You are PositioningHQ, a guide that helps founders articulate product positioning and competitive differentiation, in the tradition of April Dunford's Obviously Awesome. Be direct and concrete. Push back on vague claims and ask for evidence. Keep answers short unless asked for depth." (The full interview prompts arrive with the skill pack after v0.)
5. `ipc/provider.ts` and `ipc/chat.ts`: wire `provider:verifyKey`, `provider:listModels`, `chat:start` (creates a stream ID and AbortController, looks up the mode's system prompt in main, starts `streamChat`, sends `chat:event` to the sender's webContents), `chat:cancel`.
6. The renderer sends a `modeId` and messages, never a system prompt.
7. Unit tests for error mapping with the SDK's error classes constructed directly; a fake provider for the chat IPC test.

**Done when:** from DevTools, `window.api.verifyKey('<real key>')` returns models; a bad key returns `invalid_key`; a `chat:start` call streams deltas to an `onChatEvent` listener and `chat:cancel` stops it.

---

## Phase 5: Onboarding wizard (Sat evening or Sun morning, about 2 hours)

1. `store/app.ts`: route (`welcome | connect | verify | workspace | done | chat`), app state, and a `refresh()` that calls `getState`.
2. `WizardShell`: `#fafafa` backdrop, centred 560px card (16px radius, `--shadow-header`), step indicator ("Step 2 of 4"), Back button, drag region on macOS.
3. Screens per REQUIREMENTS 3.1 to 3.5, with the exact copy given there:
   - **Welcome**
   - **ConnectAI**: provider radio cards (Claude enabled; OpenAI and Gemini disabled with "Coming soon" badges), three `NumberedStep`s, Console button via `shell:openExternal`, key input with show/hide and the soft `sk-ant-` check.
   - **Verify**: runs `verifyKey`; renders every state in the 3.3 table; model `Select` on success. If secure storage is unavailable, show the session-only notice.
   - **Workspace**: default path card with "Use the default" and "Choose a folder..."; existing-workspace detection; writability error.
   - **Done**: summary and "Start a chat".
4. On Done, `onboardingComplete` is set in main and the route switches to chat.
5. Keyboard: Enter submits the current step's primary action; focus moves to each step's first control.

**Done when:** acceptance criteria 3, 4 and 6 pass by hand.

---

## Phase 6: Chat (Sun morning, about 2.5 hours)

1. `store/chat.ts`: messages (`{ id, role, content, status: 'streaming' | 'done' | 'stopped' | 'error', usage?, error? }`), active stream ID, `send`, `stop`, `retry`, `reset`.
2. `ChatSession({ modeId })`: the reusable component. Owns subscription to `onChatEvent` (filtered by stream ID; unsubscribe on unmount).
3. `MessageList` inside a `ScrollArea`: auto-scroll to the bottom while streaming unless the user has scrolled up. `aria-live="polite"` on the streaming message.
4. `Message`: user bubble vs assistant plain text (REQUIREMENTS 6.6). Assistant content renders through `Markdown`.
5. `Markdown` component: react-markdown + remark-gfm; headings in serif; links intercepted to `shell:openExternal` (and refused if not allowlisted, showing the URL as plain text); code blocks styled; no raw HTML rendering.
6. `Composer`: autosizing textarea (max 8 lines), Enter to send, Shift+Enter for newline, Send becomes Stop while streaming, disabled when empty.
7. `EmptyState`: H2 and the three starter prompts (fill the composer, don't auto-send).
8. Top bar: wordmark, model display name, New chat, Settings button.
9. Usage line under each finished assistant message; inline error with Retry for failed messages; "Stopped" marker for cancelled ones.

**Done when:** acceptance criterion 7 passes; a 2,000-word reply streams smoothly; stop and retry both work; Wi-Fi off gives the network error inline.

---

## Phase 7: Settings and relaunch (Sun midday, about 1 hour)

1. `SettingsSheet` per REQUIREMENTS 3.7: AI connection (masked key, Replace key, Disconnect with confirm dialog in destructive style), Model select (refreshed on open), Workspace (path, reveal, change), About (version, licence, links).
2. `Cmd/Ctrl+,` from the menu opens it.
3. Model change saves immediately and applies to the next message.
4. Verify every launch route in REQUIREMENTS 4.5 by hand (delete `secrets.bin`, delete the workspace folder, reset settings).

**Done when:** acceptance criteria 8 and 9 pass.

---

## Phase 8: Packaging and CI (Sun afternoon, about 1.5 hours)

1. `electron-builder.yml`:
   - mac: `dmg`, `arch: [arm64, x64]`, category `public.app-category.productivity`, `identity: null` (unsigned for v0).
   - win: `nsis` x64, one-click off, allow changing install directory.
   - linux: `AppImage` and `deb` x64, category `Office`.
   - Include `LICENSE` and the DejaVu licence in the bundle.
2. Placeholder icon: a 1024 x 1024 PNG with a white serif "P" on teal `#2e7a7f`; generate `.icns` and `.ico` from it (electron-builder can do this from `resources/icon.png`).
3. `.github/workflows/build.yml`: on push to `main` and on pull requests; matrix `macos-latest`, `windows-latest`, `ubuntu-latest`; steps: checkout, setup-node from `.nvmrc` with npm cache, `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm audit --audit-level=high`, `npm run build:<os>`, upload `dist/` artifacts. Set `CSC_IDENTITY_AUTO_DISCOVERY=false` so the Mac build doesn't look for a certificate.
4. Build the `.dmg` locally, install from it, and run through the full acceptance list.

**Done when:** acceptance criteria 2 and 14 pass.

---

## Phase 9: Final check (Sun evening, about 45 minutes)

1. Run all 15 acceptance criteria from REQUIREMENTS 9 and record pass or fail in `docs/v0-acceptance.md`.
2. Key-leak sweep: grep the logs directory, `settings.json` and the repo for `sk-ant-`; check renderer DevTools Application storage, Network and Console.
3. Copy sweep: grep `src/` for the em dash character; there should be none.
4. Remove any leftover template code and the DesignCheck screen.
5. Tag `v0.0.1` (no GitHub release).

---

## Timeline summary

| When                       | Phases                                       |
| -------------------------- | -------------------------------------------- |
| Sat morning                | 0 Scaffold, 1 Hardening                      |
| Sat midday                 | 2 Design system                              |
| Sat afternoon              | 3 IPC/settings/secrets, 4 Anthropic provider |
| Sat evening or Sun morning | 5 Wizard                                     |
| Sun morning                | 6 Chat                                       |
| Sun midday                 | 7 Settings                                   |
| Sun afternoon              | 8 Packaging and CI                           |
| Sun evening                | 9 Final check                                |

Total is about 14 to 15 focused hours. If time runs short, cut in this order: Linux `deb` target, window-bounds persistence, the "existing workspace" detection, the usage line. Never cut: key security (Phase 3 and REQUIREMENTS 5), the mode-based chat component, or CI.

---

## Risks

| Risk                                                                            | Mitigation                                                                                                                    |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| shadcn CLI assumes a Next.js or plain Vite layout and writes to the wrong paths | Set `components.json` aliases to the renderer paths before adding components; check where files land                          |
| `safeStorage` unavailable before `app.whenReady()`                              | Only touch secrets after ready                                                                                                |
| Dev-mode CSP blocks Vite HMR                                                    | Relax CSP only when `!app.isPackaged`                                                                                         |
| Credit-balance error shape changes                                              | Match on status 400 plus message text, fall back to `unknown` with the API's error type; the user still sees a useful message |
| Unsigned Mac build quarantined                                                  | Expected for v0; right-click Open, or `xattr -dr com.apple.quarantine` on your own Mac only                                   |
| Windows/Linux break silently while you test on Mac                              | CI matrix on every push                                                                                                       |

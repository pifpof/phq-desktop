# PositioningHQ Desktop: v0 Requirements

**Version:** v0 (scaffold), weekend build
**Date:** 2026-10-16
**Owner:** Shahed Khalili, Parallel79°
**Status:** Approved stack. Ready to build.
**Companion docs:** `IMPLEMENTATION_PLAN.md` (build order), `CLAUDE.md` (rules for the Claude Code session)

---

## 1. What this is

PositioningHQ Desktop is a free, open-source (MIT) desktop app that guides a founder through building a positioning and competitive-intelligence wiki, using the founder's own LLM API key. Everything lives in a local folder the founder chooses. The wiki becomes the grounding source for any other AI or human workflow (content agents, sales tools, Claude, ChatGPT, Cursor).

It replaces two earlier versions:

- **app.klarifi.ai** (hosted web app on GCP and Firebase). People liked it; nobody subscribed.
- **The PositioningHQ Claude skill pack** (`github.com/pifpof/positioningHQ`). Good framework, but too hard to set up for anyone who doesn't use Claude Code.

The desktop app keeps the skill pack's framework and templates and offers a guided, self-serve UX at no hosting cost to Parallel79.

### 1.1 Business model (context, not v0 scope)

- Free app drives leads: "get updates" sign-up and a community (Discord or similar).
- Later upsell: a hosted knowledge base the founder's tools connect to over MCP, about $4.99/month per repo, unlimited users.
- The metric the free app must eventually prove is **activation**: the share of installs that finish a wiki.

### 1.2 Primary user

A founder who is also the product marketer: responsible for producing the company's positioning, with no dedicated PMM. Non-technical enough that Claude Code is a barrier; capable of creating an API key with good instructions.

---

## 2. v0 scope

v0 is the scaffolding that every later feature plugs into. It proves one loop end to end:

> Install on a Mac, open the app, walk through a short setup wizard, connect a Claude API key, choose a workspace folder, land in a working chat.

### 2.1 In scope

1. Electron desktop app that runs on macOS (Apple Silicon) for v0, with code structured to run on Windows and Linux.
2. First-run wizard: Welcome, Connect AI, Verify and choose model, Choose workspace folder, Done.
3. Encrypted, OS-backed storage of the API key.
4. Chat screen with streamed responses, markdown rendering, a stop button, error handling and per-reply token usage.
5. Settings: change key, change model, change workspace folder, disconnect (delete key).
6. Returning-user launch: skips the wizard when setup is complete and valid.
7. Parallel79° visual design system (section 6).
8. CI that builds unsigned artifacts for macOS, Windows and Linux on every push.

### 2.2 Out of scope for v0 (explicitly)

- Guided positioning interview, wiki sections, Dunford exercises, skill-pack prompts.
- Web research and competitor fetching.
- OpenAI, Gemini or any provider other than Anthropic (the provider interface exists; only Anthropic is implemented).
- Writing wiki content to the workspace (v0 only creates the workspace marker; see 4.4).
- Lead capture, community link, telemetry or analytics of any kind.
- Code signing, notarization, auto-update, published releases.
- Dark mode (the brand is light-only, matching parallel79.com).
- Multiple products or packages.
- Cost estimates in dollars (token counts only in v0; dollar pricing tables go stale).

---

## 3. User flow

```
First launch:
  Welcome -> Connect AI -> Verify + model -> Workspace folder -> Done -> Chat

Later launches:
  setup complete AND key decrypts AND workspace folder exists -> Chat
  key missing or fails to decrypt                             -> Connect AI
  workspace folder missing                                    -> Workspace folder
```

The wizard shows progress (step 1 of 4, and so on) and has a Back button on every step after Welcome.

### 3.1 Welcome

- Wordmark: "PositioningHQ" in DejaVu Serif.
- H1: "Positioning your whole company can use."
- Lede: "Build your positioning and competitive intelligence with an AI guide. Free and open source. Your work stays on this computer."
- Primary button: "Get started".
- Small muted footer line: "Made by Parallel79°" linking to parallel79.com (opens in the default browser).

### 3.2 Connect AI

- H2: "Connect your AI".
- Body: "PositioningHQ uses your own AI account. You pay the provider directly for what you use, and your key is stored encrypted on this computer. It is never sent anywhere except to the provider."
- Provider selector: **Claude (Anthropic)** enabled and selected. **OpenAI** and **Gemini** shown disabled with a "Coming soon" badge.
- "How to get a key" panel with three numbered steps (numeral style, section 6.4):
  1. Open the Anthropic Console (button opens `https://console.anthropic.com/` in the default browser).
  2. Add credits under Billing. Pay-as-you-go; a few dollars is plenty to start.
  3. Create an API key and paste it below.
- Password-type input with a show/hide toggle. Paste-friendly. Trims whitespace.
- Soft format check: if the key does not start with `sk-ant-`, show an inline warning ("This doesn't look like an Anthropic key") but still allow verification.
- Primary button: "Verify key". Disabled while empty.

### 3.3 Verify and choose model

Verification runs in two calls from the main process:

1. **List models** (Anthropic Models API). Proves the key is valid. Costs nothing.
2. **One tiny message** (max 1 output token). Proves billing works. Costs a fraction of a cent. Tell the user: "We send one tiny test message to confirm your account has credit."

States:

| Result                                 | UI                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Checking                               | Spinner, "Checking your key..."                                                                                          |
| Success                                | "Connected." Model dropdown appears, populated from the models list. Primary button "Continue".                          |
| Invalid key (401)                      | "That key didn't work. Check you copied all of it." Back to input.                                                       |
| No permission (403)                    | "This key doesn't have access. Create a new key in the Console."                                                         |
| No credit                              | "Your key works, but your account has no credit. Add credits under Billing, then try again." Button re-runs step 2 only. |
| Rate limited (429) or overloaded (529) | "Anthropic is busy. Try again in a moment." Retry button.                                                                |
| Network failure                        | "Can't reach Anthropic. Check your internet connection." Retry button.                                                   |
| Anything else                          | Generic message plus the provider's error type (never the raw key). Retry button.                                        |

**Model selection rules:**

- Populate the dropdown from the live models list. Never hardcode model IDs in the UI.
- Show the model's display name. Sort newest first (the API returns them that way).
- Default selection: the newest model whose ID contains `sonnet`. If none, the first model in the list.
- The key is saved to encrypted storage only after verification succeeds.

### 3.4 Workspace folder

- H2: "Choose where your work lives".
- Body: "PositioningHQ saves everything as plain files in a folder you choose. Open them in Obsidian, put them in GitHub, or back them up however you like."
- Two options:
  - **"Use the default"**: `~/Documents/PositioningHQ` (via Electron's `app.getPath('documents')`), created if missing. Show the full path.
  - **"Choose a folder..."**: native folder picker allowing folder creation.
- Validation: folder must be writable. If not: "PositioningHQ can't write to that folder. Choose another."
- If the folder already contains `.positioninghq/workspace.json`, reuse it and say "Found an existing PositioningHQ workspace."
- On confirm, create the workspace marker (4.4).

### 3.5 Done

- H2: "You're set up."
- Summary: provider, model, workspace path.
- Primary button: "Start a chat".

### 3.6 Chat

Layout (section 6.6 for visuals):

- Top bar: "PositioningHQ" wordmark at left; model name at right; a settings button.
- Message list, centred, max width 760px.
- Composer pinned to the bottom.

Behaviour:

- **Enter** sends; **Shift+Enter** inserts a newline.
- Responses stream token by token.
- While streaming, the Send button becomes **Stop**, which cancels the request. Partial text stays visible, marked "Stopped".
- Assistant messages render markdown (headings, lists, bold, links, code blocks, tables). Links open in the default browser, never inside the app.
- Each assistant message shows token usage in small muted text ("1,204 in · 318 out").
- Errors appear inline under the failed message with a Retry button, using the same error copy as 3.3.
- A "New chat" button clears the conversation.
- Empty state: H2 "What are you working on?" and three starter prompts that fill the composer when clicked:
  - "Help me describe what my product does in one sentence."
  - "Who are my real competitors, including doing nothing?"
  - "What makes my product different, and why should a buyer care?"
- Conversation history is held in memory for v0. It does not persist across launches.

**The chat runs in a mode.** The chat screen is a reusable component that takes a mode (an ID, a title and a system prompt held in the main process). v0 ships one mode, `general`, with a short system prompt that introduces PositioningHQ as a positioning guide. Later, the guided interview for each wiki section is a different mode using the same component. Do not build the chat as a hardcoded generic client.

### 3.7 Settings

Opened from the chat top bar as a sheet or dialog:

- **AI connection**: provider, masked key (last 4 characters only), "Replace key" (runs Connect + Verify again), "Disconnect" (deletes the key, returns to Connect AI, with confirmation).
- **Model**: dropdown, refreshed from the models list when opened.
- **Workspace**: current path, "Show in Finder/Explorer", "Change folder" (runs the workspace step again).
- **About**: app version, MIT licence, links to the GitHub repo and parallel79.com.

---

## 4. Functional requirements

### 4.1 Process architecture

- **Main process** owns everything privileged: the API key, all network calls to the provider, file system access, settings.
- **Renderer** is UI only. It never sees the API key and makes no network requests.
- **Preload** exposes a small, typed `window.api` object via `contextBridge`. No raw `ipcRenderer` exposure.
- Every IPC payload is validated with zod in the main process before use.

### 4.2 IPC contract (v0)

| Channel                  | Direction        | Purpose                                                                                                      |
| ------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `app:getState`           | renderer -> main | Returns onboarding status, provider, model, workspace path, masked key, app version                          |
| `provider:verifyKey`     | renderer -> main | Takes a key; runs the two-step verification; returns models or a typed error. Saves the key only on success. |
| `provider:listModels`    | renderer -> main | Refreshes the models list using the stored key                                                               |
| `settings:setModel`      | renderer -> main | Saves the chosen model ID                                                                                    |
| `workspace:chooseFolder` | renderer -> main | Opens the native folder picker; returns the path or null                                                     |
| `workspace:useDefault`   | renderer -> main | Creates and returns the default workspace path                                                               |
| `workspace:confirm`      | renderer -> main | Validates, creates the marker, saves the path                                                                |
| `workspace:reveal`       | renderer -> main | Opens the workspace in Finder or Explorer                                                                    |
| `chat:start`             | renderer -> main | Takes mode ID and messages; returns a stream ID                                                              |
| `chat:event`             | main -> renderer | Stream events: `delta`, `usage`, `done`, `error`, keyed by stream ID                                         |
| `chat:cancel`            | renderer -> main | Aborts a stream by ID                                                                                        |
| `secrets:disconnect`     | renderer -> main | Deletes the stored key                                                                                       |
| `shell:openExternal`     | renderer -> main | Opens an allowlisted https URL in the default browser                                                        |

### 4.3 Provider interface

Defined in `src/main/providers/types.ts`. Anthropic is the only v0 implementation.

```ts
interface Provider {
  id: 'anthropic' | 'openai' | 'gemini'
  displayName: string
  verifyKey(key: string): Promise<VerifyResult> // models list + 1-token message
  listModels(key: string): Promise<ModelInfo[]>
  streamChat(args: {
    key: string
    model: string
    system: string
    messages: ChatMessage[]
    signal: AbortSignal
    onEvent: (e: ChatStreamEvent) => void
  }): Promise<void>
}
```

Provider errors map to one shared type: `invalid_key | no_permission | no_credit | rate_limited | overloaded | network | unknown`. The renderer only ever sees these codes plus safe display text.

Use the official `@anthropic-ai/sdk` package for the Anthropic implementation. Use its streaming helper and pass the abort signal through so Stop actually cancels the HTTP request.

### 4.4 Settings and workspace on disk

- **Settings** (not secret): `settings.json` in Electron's `userData` directory. Fields: `schemaVersion`, `onboardingComplete`, `provider`, `model`, `workspacePath`. Written atomically (write temp file, then rename).
- **Secret**: the encrypted key blob, `secrets.bin` in `userData`, produced by Electron `safeStorage`.
- **Workspace marker**: `<workspace>/.positioninghq/workspace.json` with `schemaVersion`, `createdAt`, `appVersion`. Nothing else is written to the workspace in v0.

**Design rule for later versions:** the workspace folder is the source of truth. Wiki content will be plain markdown files with YAML front matter (status, sources, last updated). The app derives its state from the files and must tolerate the user editing them in Obsidian or any other editor. Don't introduce a database that duplicates file content.

### 4.5 Launch logic

On startup, before showing a window's content, main computes the route:

1. No settings or `onboardingComplete` false: Welcome.
2. Key missing or fails to decrypt: Connect AI (with a note: "Reconnect your AI to continue").
3. Workspace path missing or not writable: Workspace step (with a note: "We couldn't find your workspace folder").
4. Otherwise: Chat.

Do not call the provider on launch. Validate the key lazily on the first chat or when the models list is refreshed.

### 4.6 Single instance

Only one instance runs at a time. Opening the app again focuses the existing window.

---

## 5. Security and privacy requirements

1. `BrowserWindow` uses `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
2. A strict Content Security Policy on the renderer: `default-src 'self'`; no remote scripts; `connect-src 'self'` (the renderer talks to nothing on the network); styles and fonts from self only. Vite dev mode may relax this for HMR only.
3. Navigation is locked: block `will-navigate` to anything other than the app's own content. `setWindowOpenHandler` denies all new windows; allowlisted https links go to `shell.openExternal`.
4. External link allowlist: `console.anthropic.com`, `docs.anthropic.com`, `docs.claude.com`, `parallel79.com`, `github.com`. Anything else is refused in v0.
5. IPC handlers check the sender frame belongs to the app before acting.
6. The API key:
   - is stored only via `safeStorage.encryptString` and read via `decryptString`;
   - is never written to logs, settings, crash reports, error messages or the renderer;
   - is displayed only as `sk-ant-...` plus the last 4 characters.
7. If `safeStorage.isEncryptionAvailable()` is false, do not store the key. Tell the user and keep the key in memory for this session only.
8. **Linux:** if `safeStorage.getSelectedStorageBackend()` returns `basic_text` (no keyring available), treat encryption as unavailable for the purposes of rule 7, and explain: "Your system has no keyring, so your key can't be stored securely. It will be kept for this session only."
9. Logs (main process only) go to `userData/logs`, contain no key and no message content, and rotate at 5 MB.
10. No telemetry, analytics or crash reporting in v0. The only outbound network destination is the provider's API.
11. Dependencies: no packages with native modules unless required; run `npm audit` in CI and fail on high-severity issues.

---

## 6. Design system: Parallel79° theme

**Source of truth:** `/Users/shahedkhalili/src/parallel79.com/p79/src/styles/globals.css` (tokens, base type, utilities) and `.../p79/src/components/ui/button.tsx` (button variants). Design spec: `/Users/shahedkhalili/src/parallel79.com/change-order-006-theme-and-typography.md`. Copy tokens from these files rather than retyping them. If anything in this section disagrees with `globals.css`, `globals.css` wins.

The site is a Next.js marketing site; the app is a desktop tool. Keep the tokens, type and component shapes identical. Adapt layout to an app (no marketing hero, no floating nav bar, denser chat surfaces).

### 6.1 Colour tokens

Copy the `:root` and `@theme inline` blocks from `globals.css` verbatim. Key values:

| Token                  | Hex                                     | Use                                                                            |
| ---------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| `--foreground` (ink)   | `#17181c`                               | Headings, body text                                                            |
| `--muted-foreground`   | `#5a5d66`                               | Secondary text, ledes, helper text                                             |
| `--primary` (teal)     | `#2e7a7f`                               | Primary buttons, links, eyebrows, active states                                |
| `--primary-hover`      | `#256469`                               | Hover for teal buttons and links                                               |
| `--primary-light`      | `#499fa4`                               | Outline-button border, numerals, focus ring, icons. **Never text under 24px.** |
| `--accent`             | `#f0f7f8`                               | Badge fill, outline-button hover, selected states                              |
| `--background`         | `#ffffff`                               | Main surfaces                                                                  |
| `--secondary`          | `#f5f5f4`                               | User message bubbles, hover fills                                              |
| `--muted`              | `#fafafa`                               | Bands: wizard backdrop, top bar, composer area                                 |
| `--border` / `--input` | `#e4e4e1`                               | All borders and dividers                                                       |
| `--ring`               | `#499fa4`                               | Focus ring                                                                     |
| `--destructive`        | `#b3191f`                               | Disconnect, errors                                                             |
| `--radius`             | `0.75rem` (12px)                        | Base radius                                                                    |
| `--shadow-header`      | `0 12px 32px -14px rgba(23,24,28,0.22)` | Wizard card                                                                    |
| `--shadow-menu`        | `0 28px 56px -24px rgba(23,24,28,0.28)` | Dropdowns, settings sheet                                                      |

Light only. Delete any `.dark` block the shadcn installer adds.

### 6.2 Typography

| Role                         | Font                         | Notes                                                                                                                                                                                                                                                                       |
| ---------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Headings, wordmark, numerals | **DejaVu Serif** 400 and 700 | Copy `dejavu-serif-400.woff2`, `dejavu-serif-700.woff2` and `LICENSE-DejaVu.txt` from `/Users/shahedkhalili/src/parallel79.com/p79/src/fonts/`. Load with `@font-face` (no `next/font` in Electron). Set `--font-dejavu-serif` so the copied `--font-serif` token resolves. |
| Body, UI, buttons, labels    | **Inter Variable**           | `@fontsource-variable/inter`, bundled. No Google Fonts requests.                                                                                                                                                                                                            |
| Code blocks in chat          | System mono stack            | `ui-monospace, SFMono-Regular, Menlo, monospace`                                                                                                                                                                                                                            |

Copy the `@layer base` heading rules and the `eyebrow`, `lede`, `numeral` and `h3-list` utilities from `globals.css`. App-specific sizes, since a desktop window is not a landing page:

| Element                  | Size       | Notes                              |
| ------------------------ | ---------- | ---------------------------------- |
| Wizard H1 (Welcome only) | 40px       | Serif 700, line height 1.08        |
| Wizard H2                | 28px       | Serif 700                          |
| Chat empty-state H2      | 28px       | Serif 700                          |
| Top-bar wordmark         | 18px       | Serif 700, -0.01em                 |
| Lede                     | 17px       | Inter, muted, line height 1.65     |
| Body and chat text       | 15 to 16px | Inter, line height 1.6             |
| Helper and usage text    | 13px       | Inter, muted                       |
| Eyebrow                  | 13px       | Inter 600, 0.14em, uppercase, teal |

Use fixed sizes for the app rather than the site's `clamp()` viewport scaling; the window is resizable but not a phone.

### 6.3 Components (shadcn/ui, restyled)

Copy `button.tsx` from the site as the starting point. Variants: `default` (teal fill), `outline` (1.5px teal-light border, teal text), `secondary`, `ghost`, `link`. Sizes: `default` h-10, `sm` h-8, `lg` h-14 with 8px radius, `icon`. Radius 10px. `active:scale-[0.97]`.

Add from shadcn as needed, restyled to the tokens: Input, Textarea, Label, Select, Dialog or Sheet, Badge, Tooltip, Separator, ScrollArea.

| Element                | Spec                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| Cards and panels       | White, 1px border, 12px radius, 24 to 28px padding                                                  |
| Wizard card            | White, 1px border, 16px radius, `--shadow-header`, max width 560px, centred on a `#fafafa` backdrop |
| Inputs                 | 40px tall, 1px border, 10px radius, teal-light focus ring                                           |
| Badges ("Coming soon") | Pill, 1px teal-light border, `--accent` fill, teal Inter 600 13px                                   |
| Dropdown menus         | White, 16px radius, `--shadow-menu`                                                                 |
| Icons                  | lucide-react, 1.8 stroke                                                                            |

### 6.4 Numbered steps

The "How to get a key" steps reuse the site's numbered-step pattern: a `numeral` (serif 700, teal-light, 24px+) followed by a short Inter title and muted description.

### 6.5 Window chrome

- **macOS:** `titleBarStyle: 'hiddenInset'`. Keep a 28px drag region at the top of every screen, clear of the traffic lights (left padding about 80px).
- **Windows and Linux:** native frame for v0.
- Default window 1100 x 760; minimum 820 x 600. Remember size and position between launches.
- Background colour set on `BrowserWindow` to `#ffffff` so there's no white-to-colour flash.

### 6.6 Chat layout

- Top bar: 52px, `#fafafa`, 1px bottom border. Wordmark left (after the macOS traffic-light inset), model name in muted 13px plus settings icon button at right.
- Message column: max width 760px, centred, 24px gaps between messages.
- User messages: right-aligned, `#f5f5f4` fill, 12px radius, 12px x 16px padding, max 85% width.
- Assistant messages: no bubble; plain text on white, full column width, markdown styled with the tokens (serif for markdown headings, teal links, `#f5f5f4` code blocks with 10px radius).
- Composer: `#fafafa` band with a 1px top border; inside, a white bordered textarea (12px radius, auto-grows to 8 lines) and a primary Send or Stop button.

### 6.7 Copy rules

- No em dashes in any UI text. Use commas, colons or full stops.
- Plain words, short sentences, no marketing jargon.
- Brand names: "PositioningHQ" (one word, capital HQ); "Parallel79°" with the degree sign.

### 6.8 Accessibility

- All text meets WCAG AA contrast. `#499fa4` is never used for text under 24px.
- Every control is reachable and operable by keyboard, with a visible focus ring.
- Streaming chat output sits in an `aria-live="polite"` region.
- Respect `prefers-reduced-motion`.

---

## 7. Cross-platform requirements

v0 is tested on macOS only, but must not block Windows and Linux.

1. Use `app.getPath()` for every system location and `path.join` for every path. No hardcoded separators or home-directory strings.
2. All OS-specific code lives in `src/main/platform/`. Nothing else branches on `process.platform`.
3. Menu: macOS app menu (About, Settings `Cmd+,`, Hide, Quit) plus Edit menu (so copy and paste work). Windows and Linux use a minimal menu with the same shortcuts on `Ctrl`.
4. "Show in Finder" reads "Show in Explorer" on Windows and "Show in file manager" on Linux.
5. electron-builder targets: macOS `dmg` (arm64 and x64), Windows `nsis` (x64), Linux `AppImage` and `deb` (x64).
6. CI builds all three on native runners on every push to `main` and on pull requests, and uploads the unsigned artifacts. No releases are published in v0.

---

## 8. Non-functional requirements

| Area      | Requirement                                                                                                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Startup   | Window visible within 2 seconds on an Apple Silicon Mac (no blocking network calls on launch)                                                                         |
| Streaming | First token renders as soon as it arrives; no batching delay over 50ms                                                                                                |
| Memory    | Idle under 300 MB                                                                                                                                                     |
| Offline   | App opens and shows the chat with a clear "can't reach Anthropic" error on send; no crash                                                                             |
| Repo      | Public GitHub repo `positioninghq-desktop` (separate from the existing skill-pack repo `pifpof/positioningHQ`), MIT licence, README with install and dev instructions |
| App ID    | `com.parallel79.positioninghq`; product name "PositioningHQ"                                                                                                          |

---

## 9. Acceptance criteria

v0 is done when every item passes on Shahed's Mac:

1. `npm install` then `npm run dev` opens the app with hot reload.
2. `npm run build:mac` produces a `.dmg` that installs and launches (Gatekeeper "unidentified developer" warning is expected and acceptable).
3. A first launch shows Welcome; the wizard completes with a real key and lands in Chat.
4. A wrong key shows the invalid-key message. A valid key on an account with no credit shows the no-credit message. Turning off Wi-Fi shows the network message.
5. The model dropdown is populated from the live API, defaults to the newest Sonnet, and contains no hardcoded IDs in source.
6. The workspace step creates `~/Documents/PositioningHQ/.positioninghq/workspace.json` by default; choosing an existing workspace folder is recognised.
7. A chat message streams a reply; Stop cancels it mid-stream; markdown renders; token usage shows under the reply.
8. Quit and relaunch goes straight to Chat. Deleting the workspace folder and relaunching routes to the workspace step.
9. Settings: Disconnect deletes the key and routes to Connect AI; Replace key works; model change takes effect on the next message.
10. Searching the logs, settings file and renderer DevTools (Application, Network, Console) finds no trace of the API key.
11. The renderer makes zero network requests (DevTools Network tab is empty apart from local assets).
12. Side by side with parallel79.com, buttons, type, colours and borders read as the same design system. No Google Fonts requests.
13. No em dashes appear in any UI string.
14. CI is green on macOS, Windows and Linux runners and uploads three sets of unsigned artifacts.
15. `npm run lint`, `npm run typecheck` and `npm test` pass.

---

## 10. What comes after v0 (for context, in rough order)

1. Wiki map home screen: the positioning sections from the skill pack, each with a status.
2. Interview mode per section, using the chat component with section prompts from the skill pack, plus a live draft panel that writes markdown to the workspace.
3. "Use this wiki" screen: folder path and connection snippets for Claude, ChatGPT and Cursor.
4. Lead capture at the value moment (after the first drafted section and at export): "Get updates" and "Join the community".
5. Competitor URL fetching, then web research.
6. OpenAI and Gemini providers.
7. Signing and notarization (Apple Developer account, Windows signing), auto-update, first public release.
8. Hosted KB with MCP access (the paid upsell).

---

## 11. Open items (owner: Shahed)

| #   | Item                                                                                             | Needed before          |
| --- | ------------------------------------------------------------------------------------------------ | ---------------------- |
| 1   | Create the public GitHub repo `positioninghq-desktop` (or confirm the name and org)              | Day 1                  |
| 2   | App icon (1024 x 1024 PNG). v0 can ship with a placeholder: the "P" in DejaVu Serif 700 on teal. | Optional for v0        |
| 3   | Apple Developer account ($99/year) for signing and notarization                                  | First outside download |
| 4   | Windows code signing (Azure Trusted Signing or a certificate)                                    | First Windows download |
| 5   | Community channel: Discord, GitHub Discussions or other                                          | Lead-capture feature   |

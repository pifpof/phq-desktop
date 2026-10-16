# PositioningHQ Desktop: v1 Requirements

**Version:** v1 (company onboarding, initial research, home screen)
**Date:** 2026-10-16
**Owner:** Shahed Khalili, Parallel79°
**Builds on:** v0 (`REQUIREMENTS.md`). Everything in v0 still applies unless this document changes it.
**Companion docs:** `IMPLEMENTATION_PLAN-v1.md`, `CLAUDE.md` (updated with v1 rules)
**Framework source:** `github.com/pifpof/positioningHQ` (MIT), skills `setup-positioning-vault`, `company-research`, `positioning-playbook`

---

## 1. What v1 adds

v0 ends in a plain chat. v1 turns the app into the product:

1. **Company onboarding.** After the workspace step, if the workspace is new, the wizard collects the company, product, user and goals, offers an updates sign-up, and takes the user's own files.
2. **Initial research.** A pipeline of AI tasks runs once, in parallel where possible: crawl the website, find social taglines, run the skill pack's company research, publish version 1 of the Positioning Playbook, and write a critical Messaging Analysis.
3. **Home screen.** A left-hand navigation like Claude Desktop with four views: Chat, Training Data, Positioning Playbook, Messaging Analysis.

The first moment of value is the published playbook and the messaging analysis. That's where v1 asks for the updates sign-up a second time.

### 1.1 Out of scope for v1

- Battlecards, call plans, product launch (the other skill-pack skills). The workspace layout leaves room for them.
- Editing generated documents inside the app (open in the user's editor instead).
- Re-running research on a schedule ("keep it fresh"). v1 allows a manual re-run only.
- OpenAI and Gemini providers. The interfaces must allow them; only Anthropic is implemented.
- Logging in to social networks, or any scraping that needs an account.
- Multiple products per workspace.

---

## 2. Onboarding (new wizard steps)

### 2.1 When the onboarding runs

After the v0 workspace step:

| Workspace state | Behaviour |
|---|---|
| Empty folder | Run company onboarding (2.2 to 2.6), then research |
| Contains a PositioningHQ workspace (`.positioninghq/workspace.json`) with research done | Skip to Home |
| Contains a PositioningHQ workspace with research incomplete | Skip to Home; show a "Finish setting up" banner that resumes onboarding or the research run |
| Contains a skill-pack vault (`vault.config.md`) but no `.positioninghq/` | Import: read company name and website from `vault.config.md`, prefill the profile, keep existing `memory/` files, then ask whether to run research or use what's there |
| Not empty and not a workspace | Warn: "This folder already has files in it. PositioningHQ will add its own folders alongside them." Options: "Use it anyway" or "Choose another folder" |

### 2.2 Step: Your company

- H2: "Tell us about your company"
- Fields:
  - **Company name** (required)
  - **Website** (required). Accept `acme.com` or a full URL; normalise to `https://`. Validate it resolves (HEAD or GET from main) before continuing; on failure: "We couldn't reach that website. Check the address." with an option to continue anyway.
  - **Product name** (optional, defaults to the company name)
  - **One-line description of what you sell** (optional). Helper: "Your best guess. We'll check it against your website."
  - **Main competitors** (optional, up to 5, as tags). Helper: "Leave blank and we'll find them."

The skill pack treats industry, a one-liner and competitors as required. The app makes them optional because research can derive them, but every field the user does fill in is passed to every task as ground truth.

### 2.3 Step: About you

- H2: "About you"
- **Your name** (required)
- **Your role**: select, with "Other" free text. Options: Founder or CEO, Product Marketing, Content Marketing, Marketing Leader (CMO, VP), Sales Leader (CRO, VP), Product Management, Other.
- **Company size**: select. Options: Just me, 2 to 10, 11 to 50, 51 to 200, 201 to 1,000, 1,000+.

### 2.4 Step: What you'll use it for

- H2: "What do you want to get done?"
- Multi-select cards (at least one):
  - Define or refresh our positioning
  - Fix our website and messaging
  - Understand our competitors
  - Get sales telling one story
  - Prepare a product launch
  - Give our AI tools the right context
  - Sharpen our fundraising story
- Stored in the profile. v1 uses it to order the Messaging Analysis recommendations and to choose the chat's starter prompts. Later versions use it to suggest next skills.

### 2.5 Step: Stay in the loop (optional)

- H2: "Stay in the loop"
- Body: "Get product updates and join other founders working on their positioning. Optional."
- Two actions, both open the default browser:
  - **"Get updates"**: opens the hosted sign-up form with the email prefilled from an optional email field on this step.
  - **"Join the community"**: opens the community invite link.
- "Skip" is as prominent as the actions. Nothing is sent from the app itself.
- The form and community URLs live in one config file (`src/shared/links.ts`) so they can change without code changes elsewhere. Both must be on the external-link allowlist.
- Store `updatesPrompted: true` and whether the user clicked, locally only.

No analytics or telemetry are added. The app does not send the email anywhere; the browser form does.

### 2.6 Step: Add your files (optional)

The skill pack asks for files after research. The app asks before research so they shape the playbook from the start, and still accepts files until the playbook stage begins.

- H2: "Add what you already have"
- Body: "Anything you add makes the playbook more accurate. Files are copied into your workspace and never leave this computer, except as text sent to your AI provider during research."
- One drop zone per skill-pack input category, each with a one-line hint:

| Category (workspace folder) | Hint |
|---|---|
| `inputs/sales collateral/` | Pitch deck, sales deck, one-pagers |
| `inputs/customer references/` | Case studies, testimonials, quotes |
| `inputs/competitive-intel/` | Competitor teardowns, win/loss notes, analyst reports |
| `inputs/company strategy/` | Board or investor decks, strategy docs |
| `inputs/roadmap/` | Roadmap, release notes |
| `inputs/help-docs/` | Product docs, FAQs |

- Accepted types: `.pdf`, `.docx`, `.pptx`, `.md`, `.txt`, `.csv`. Others are copied but marked "not read".
- Limits: 25 MB per file, 50 files total in v1. Over-limit files are refused with a message.
- Files are **copied**, never moved. Duplicate names get a numeric suffix.
- Primary button: "Start research". Secondary: "Skip for now".

### 2.7 Step: Start research

Before starting, show a confirmation card:

- What will happen, in four lines (website, social, market and competitor research, playbook and analysis).
- **Estimated cost** as a range (for example "about $1.50 to $4.00 on your Anthropic account") and estimated time (for example "10 to 20 minutes"). See 3.7.
- **Budget cap** (default $5, editable). Research pauses and asks before exceeding it.
- Primary: "Start research". Secondary: "Not now" (goes to Home with a "Finish setting up" banner).

---

## 3. Initial research

### 3.1 Pipeline

Research runs as a set of **tasks** with dependencies (a DAG). Independent tasks run at the same time, up to a concurrency limit. Each task writes exactly one output file to the workspace.

```
Stage 1 (start immediately, in parallel)
  T1  crawl-website           local crawler, no AI
  T2  extract-input-files     local text extraction, no AI
  T3  find-social-profiles    web search
  T4  research-02..07         six company-research steps, web search, in parallel
  T5  competitor-discovery    web search: confirm or find 3 to 5 competitors

Stage 2
  T6  website-positioning     needs T1          AI reads the crawl, no web tools
  T7  research-01-overview    needs T1, T6      AI, no web tools needed (has the crawl)
  T8  social-taglines         needs T3          web search + fetch, public pages only
  T9  competitor-profiles     needs T5          one task per competitor, web search + fetch
  T10 proof-gathering         needs T5          web search: reviews, G2, Reddit, analysts

Stage 3
  T11 research-08-competitive needs T9          AI, no web tools
  T12 research-09-synthesis   needs T4, T7, T11 AI, no web tools

Stage 4 (playbook; files added after this point wait for a re-run)
  T13 playbook-01-market      needs T12, T2
  T14 playbook-02-icp         needs T12, T2
  T15 playbook-06-competitive needs T9, T11, T2
  T16 playbook-07-proof       needs T10, T2
  T17 playbook-03-value       needs T14
  T18 playbook-04-moat        needs T17
  T19 playbook-05-statement   needs T13, T14, T17, T18, T15
  T20 playbook-assemble       needs T13 to T19  writes the playbook v1

Stage 5
  T21 messaging-analysis      needs T6, T8, T20, T2
```

The task list and its dependencies are data (one definition file), not hardcoded control flow, so tasks can be added or re-run individually.

### 3.2 The isolation rule (security requirement)

Web content is untrusted. User files may be confidential (board decks, win/loss notes). The two never meet in one AI call:

- **Web tasks** (T3, T4, T5, T8, T9, T10) get web search and web fetch. They receive only the company profile and public information. They never receive user files or extracted file text.
- **Synthesis tasks** (T6, T7, T11 to T21) receive user files and earlier task outputs. They get **no web tools**.
- No task gets local tools. Tasks return text; the main process writes it to a fixed path. No AI output chooses a file path or runs code.

This is why playbook sections 6 and 7, which the skill pack writes with web access, are split into a web "gather" task and a no-web "write" task.

### 3.3 Task details

**T1 crawl-website (local, no AI)**

- Runs in the main process. Starts at the homepage; reads `sitemap.xml` if present; follows same-origin links only.
- Honours `robots.txt`. One request per second. User agent: `PositioningHQ/<version> (+https://parallel79.com/positioninghq/)`.
- Page budget: 30 pages. Priority order: home, product and solution pages, pricing, about, customers and case studies, "why us" or comparison pages, then up to 3 recent blog posts. Skip legal, careers, login, docs subdomains.
- Fetch HTML; convert main content to markdown. If a page yields under 200 words of text (likely a JavaScript-rendered site), render it in a hidden, sandboxed Electron window (separate session partition, no preload, no Node) and extract the rendered text instead.
- Also capture per page: title, meta description, Open Graph title and description, H1 and H2s, and every outbound social link (LinkedIn, X, Instagram, Facebook, YouTube) found anywhere on the site.
- Output: `memory/research/website/pages/<slug>.md` per page and `memory/research/website/index.md` (page list, headings, social links found).

**T2 extract-input-files (local, no AI)**

- Extract text from `.pdf`, `.docx`, `.pptx`, `.md`, `.txt`, `.csv` using pure-JavaScript libraries (no native modules).
- Output: `memory/research/inputs-extracted/<category>/<file>.md` with front matter pointing to the original file. Large files are truncated at a configurable token budget with a note.

**T3 find-social-profiles (web search)**

- Uses social links from the crawl if T1 has already found them; otherwise searches for the company's LinkedIn, X, Instagram and Facebook profiles.
- Output: list of profile URLs with confidence. Feeds T8.

**T8 social-taglines (web search + web fetch, best effort)**

- For each profile: collect the headline, tagline, bio or "About" text from search result snippets and any page that web fetch can read. Social networks often block automated fetching; that is expected and not an error.
- Output: `memory/research/social-taglines.md`, a table of network, URL, tagline or bio text, source, and "found / not found". Not-found rows invite the user to paste the text in later (Training Data view, 4.3).

**T4 research-02 to research-07 (web search)**

- One task per skill-pack step: product analysis, market segment, customer segment, strengths, weaknesses, recent developments.
- Prompt = shared preamble (skill-pack `company-research/SKILL.md` role and format rules) + the step's asset file + the company profile.
- Output: `memory/company-research/steps/0N-<name>.md`.

**T5 competitor-discovery (web search)**

- If the user named competitors, confirm and describe them; otherwise find the 3 to 5 most relevant (direct and indirect, including the status quo).
- Output: `memory/research/competitors.md` (name, website, one line, type).

**T6 website-positioning (no web tools)**

- Reads the crawl. Extracts how the company positions itself today: homepage hero (H1, subhead, primary CTA), category claimed, audience named, value claims, proof shown, repeated phrases, tone.
- Output: `memory/research/website-positioning.md`.

**T7 research-01-overview, T11 research-08, T12 research-09**

- Skill-pack steps 1, 8 and 9, using earlier outputs instead of new web searches. Step 8 covers the single most direct competitor, chosen from T9.
- Output: `memory/company-research/steps/01-company-overview.md`, `.../08-competitive-analysis.md`, and the assembled `memory/company-research/<Company>.md` (all steps plus the synthesis, as the skill pack does).

**T9 competitor-profiles, T10 proof-gathering (web search + fetch)**

- T9: one task per competitor (parallel). Positioning, hero message, core features, pricing model, sentiment, GTM channels. Output: `memory/research/competitors/<name>.md`.
- T10: reviews and public sentiment about the user's company (G2, Capterra, Reddit, analyst mentions). Output: `memory/research/proof-public.md`.

**T13 to T20 playbook**

- One task per skill-pack section, using the section's asset file, `positioning-playbook/SKILL.md` instructions and `references/tone-style.md`, with dependencies as in 3.1.
- Inputs: company research, website positioning, competitor profiles, public proof, and extracted user files relevant to the section (for example `customer references/` for section 7, `competitive-intel/` for section 6).
- T20 assembles the sections with a table of contents, using `assets/sample-playbook-template.md` as the structure reference.
- Output: `memory/positioning-playbook/<Company>.md` (current) and `memory/positioning-playbook/versions/<Company>-v1-<YYYY-MM-DD>.md` (immutable copy). Each re-run writes `v2`, `v3` and updates the current file.

**T21 messaging-analysis (new skill, no web tools)**

A critical, evidence-based assessment of the company's current messaging, comparing what the company says (website, social) with what the research and playbook say it should be saying. Direct and specific. No cushioning.

Output structure (`memory/messaging-analysis/<Company>.md`):

1. **Verdict.** Three sentences: the overall state of the messaging and the single biggest problem.
2. **Scorecard.** Five dimensions scored 1 to 5, each with one line of evidence quoted from the site or social:
   - Clarity (can a buyer tell what it is and who it's for in 5 seconds?)
   - Differentiation (could a competitor say the same thing?)
   - Customer focus (outcomes and pains vs features and "we")
   - Proof (claims backed by numbers, logos, quotes)
   - Consistency (website, LinkedIn, X and others tell one story)
3. **What you say today.** Homepage hero, category claim, top claims, and each channel's tagline, quoted.
4. **Strengths.** What's working and why, with quotes.
5. **Weaknesses.** What's not working and why, with quotes. Include jargon, vague claims and "me too" lines that match competitors' language (from T9).
6. **Gap to the playbook.** Where current messaging differs from the playbook's positioning statement, ICP and value drivers.
7. **Top 5 fixes.** Prioritised, each with the problem, the recommended change, and a before-and-after example. Ordered by the user's goals from 2.4.

Lives in the app as a bundled skill (`resources/skills/messaging-analysis/`) written in the same format as the skill-pack skills, so it can be contributed back to the skill-pack repo.

### 3.4 Output format rules (all tasks)

- Markdown with YAML front matter: `title`, `task`, `run_id`, `model`, `created`, `status` (`draft`), `inputs` (list of files used), `sources` (URLs).
- Every web-sourced claim keeps its source. Each web task's output ends with a **Sources** section listing the URLs and titles the provider's citations returned. Anthropic requires citations to be shown when web search output is displayed to users.
- Apply the skill pack's format rules and tone (no filler, dense, 12th-grade English) and the app's copy rule (no em dashes in generated documents; instruct the model and post-process to replace any that slip through).
- When information is unavailable, say so. Never invent figures, customers or quotes.

### 3.5 Run behaviour

- **Progress screen.** After "Start research", a full screen titled "Building your positioning" lists every task grouped by stage, with status (waiting, running, done, failed, skipped), elapsed time, and running cost. The user can leave it ("Continue in the background") and go to Home; the sidebar shows a progress indicator ("Research 12 of 21").
- **Concurrency.** Default 3 AI tasks at once (configurable 1 to 6). On a 429 rate-limit response, wait for the `retry-after` header, halve concurrency for the rest of the run, and retry. New Anthropic accounts start with low limits; this must not fail the run.
- **Retries.** Up to 3 retries per task for rate limit, overload and network errors, with backoff. Invalid key, no credit, spend cap reached (`enforced_spend_limit_reached`) and web search disabled by the organisation pause the whole run with a clear message and a "Resume" action.
- **Long turns.** Handle the provider's `pause_turn` stop reason (server tools sometimes pause long turns) by continuing the same request until it ends.
- **Failure isolation.** A failed task marks only its dependents as blocked. Everything that can finish, finishes. A failed task can be retried on its own from the progress screen.
- **Resume.** Run state is saved to `.positioninghq/runs/<run_id>.json` after every task. If the app quits mid-run, the next launch offers "Resume research" and skips tasks whose output file exists and is complete.
- **Cancel.** "Stop research" cancels running tasks (abort the requests) and marks the rest as skipped. Completed outputs are kept.
- **Web search unavailable.** If the model or organisation does not support web search (check the Models API capabilities, or a 400 saying web search is not enabled), skip web tasks, mark them "skipped: web search unavailable", and run the rest using the crawl and the user's files. Tell the user what was missed and how to enable it.
- **Re-run.** From Home: "Re-run research" runs the full pipeline again, or the user can re-run a single task or just the playbook (for example after adding files). Re-runs never delete earlier playbook versions.
- **Notification.** When the run finishes and the window isn't focused, show an OS notification: "Your positioning playbook is ready."

### 3.6 Model selection per task

- Web tasks and synthesis tasks use the model chosen in settings by default.
- Optional setting "Use a faster model for web research" (off by default) lets web gather tasks use a cheaper model from the live models list (the newest whose ID contains `haiku`). Never hardcode model IDs.
- Check `capabilities` in the Models API response to confirm web search support for a model before assigning it a web task.

### 3.7 Cost

- Estimate before starting: a table of expected tokens and searches per task (in `src/main/research/estimates.ts`), times prices from a bundled `pricing.json` (per model family: input, output, cache read per million tokens; web search per 1,000). Show a low to high range.
- `pricing.json` is labelled approximate in the UI, has a `lastUpdated` date, and is editable in Settings. Fill its values from Anthropic's pricing page at build time; do not trust remembered prices.
- Track actual usage from each response (`usage`, including server tool use counts) and show the running total on the progress screen and in Settings.
- **Budget cap** (default $5, set at 2.7 and in Settings): when the running total reaches the cap, pause before starting the next task and ask: "Research has used $5.00. Continue up to $X more, or stop here?"
- Use prompt caching for content shared across many calls in one run (skill-pack preamble, company profile, crawl summary) to cut cost.

---

## 4. Home screen

### 4.1 Layout

Like Claude Desktop: a left sidebar and a main content area.

**Sidebar** (240px, `#fafafa`, 1px right border, collapsible to icons with `Cmd/Ctrl+B`):

- Top: "PositioningHQ" wordmark (after the macOS traffic-light inset), and the company name in muted 13px under it.
- Primary navigation (lucide icons, Inter 500 15px, 10px radius items, hover `#f5f5f4`, active `--accent` fill with teal text):
  - **Chat** (`MessageSquare`)
  - **Training Data** (`Database`)
  - **Positioning Playbook** (`BookOpen`)
  - **Messaging Analysis** (`Gauge`)
- Under Chat, a short list of recent chats (v1 persists chats, see 4.2).
- Research status pill when a run is active or incomplete ("Research 12 of 21", or "Finish setting up").
- Bottom: Settings (`Settings`), and the workspace folder name with "Show in Finder".

**Main area:** the selected view. Each document view has a header with the document title, a "Last updated" date, "Open in editor" (opens the file in the OS default app) and "Show in Finder" actions.

### 4.2 Chat

- The v0 chat component, now running in a new mode, `workspace`, which grounds answers in the workspace: the playbook, the company research synthesis, website positioning and the messaging analysis go into the system prompt (cached).
- The `general` mode stays available for before research finishes.
- Starter prompts come from the user's goals (2.4), for example "Rewrite our homepage hero using the playbook" or "How do we win against [top competitor]?"
- Chats persist to `.positioninghq/chats/<id>.json` in the workspace. New chat, rename, delete.
- The workspace mode never has web tools in v1 (it holds user files; isolation rule 3.2).

### 4.3 Training Data

Shows everything research produced and everything the user provided, grouped:

| Group | Contents |
|---|---|
| Your company | The profile from onboarding (editable form; changes mark the playbook "out of date") |
| Your website | Pages crawled (title, URL, word count), website positioning summary |
| Social | Taglines table; rows marked "not found" have a "Paste it" action that writes the text into `social-taglines.md` |
| Market and company research | The nine skill-pack steps and the synthesis |
| Competitors | One entry per competitor profile |
| Public proof | Reviews and sentiment |
| Your files | Files in `inputs/`, with "read" or "not read" status, plus "Add files" (same drop zones as 2.6) |

- Selecting an item shows its markdown rendered, with sources as clickable links (allowlist rules relaxed for research sources: any https URL from a document's `sources` front matter may open in the browser after a one-time "Open external links from research?" confirmation).
- Each item shows the task that produced it and a "Re-run" action.
- The view watches the workspace folder and refreshes when files change on disk (including edits made in Obsidian).

### 4.4 Positioning Playbook

- Renders `memory/positioning-playbook/<Company>.md`.
- Left: sticky table of contents of the seven sections. Main: the document.
- Version selector (v1, v2...) reading from `versions/`.
- Status line: "Version 1 · Generated 16 Oct 2026 · Draft". An "out of date" banner appears when the profile or input files changed after this version, with "Regenerate playbook".
- Actions: "Copy as markdown", "Open in editor", "Show in Finder", "Regenerate".
- Empty state while research runs: progress for the playbook tasks only.

### 4.5 Messaging Analysis

- Renders `memory/messaging-analysis/<Company>.md`.
- The scorecard is shown as five score tiles across the top (dimension, score out of 5, one-line evidence), parsed from a fenced `json` block the task writes at the top of the file. If parsing fails, render the markdown only.
- Then the rest of the document.
- After the user first opens a completed Messaging Analysis, show the updates and community prompt (2.5) once, as a dismissible card at the bottom, if the user skipped it during onboarding.

---

## 5. Workspace layout

Compatible with the skill pack's vault, so the same folder works with the Claude Desktop skills.

```
<workspace>/
├── vault.config.md                       skill-pack config: company, website, industry, status checkboxes (app keeps it updated)
├── .positioninghq/
│   ├── workspace.json                    schemaVersion, createdAt, appVersion
│   ├── profile.json                      onboarding answers (structured)
│   ├── runs/<run_id>.json                research run state
│   └── chats/<chat_id>.json              chat history
├── inputs/                               six skill-pack categories; user files copied here
├── memory/
│   ├── company-profile.md                onboarding answers, human-readable
│   ├── research/
│   │   ├── website/index.md, pages/*.md
│   │   ├── website-positioning.md
│   │   ├── social-taglines.md
│   │   ├── competitors.md, competitors/*.md
│   │   ├── proof-public.md
│   │   └── inputs-extracted/<category>/*.md
│   ├── company-research/<Company>.md, steps/01..09-*.md
│   ├── positioning-playbook/<Company>.md, versions/*.md
│   └── messaging-analysis/<Company>.md
└── outputs/                              battlecards/, call-plans/, launch/ (created empty, for later)
```

- The files are the source of truth. `profile.json` and run files are app state; every user-facing document is markdown.
- The app must tolerate files edited, moved or deleted outside the app: missing files show as "missing" with a re-run action; never crash.
- `<Company>` in file names is the company name with characters unsafe on any OS replaced (`/ \ : * ? " < > |`), trimmed, max 60 characters.

---

## 6. Skills inside the app

- The skill-pack skills used in v1 (`company-research`, `positioning-playbook`) are **vendored** into `resources/skills/` at a pinned commit, with the MIT licence and attribution kept. A script (`npm run skills:sync`) updates them from the repo; updates ship with app releases. The app does not download prompts at runtime in v1.
- New app skills (`messaging-analysis`, `website-positioning`, `social-taglines`) are written in the same folder format (`SKILL.md`, `assets/`, `references/`).
- A **task definition** (TypeScript) says which skill files make up a task's prompt, which earlier outputs and input categories it receives, whether it gets web tools (and `max_uses`), its output path and its dependencies. The prompt builder assembles: skill role and rules, the step asset, the company profile, and the inputs, in that order, with cache breakpoints after the shared parts.

---

## 7. Provider changes

Extend the v0 `Provider` interface (still only Anthropic implemented):

- `capabilities(modelId)`: returns `{ webSearch: boolean, webFetch: boolean }` from the Models API.
- `runTask({ model, system, messages, tools: { webSearch?: { maxUses }, webFetch?: { maxUses, maxContentTokens } }, cache, signal })`: non-streaming (or streaming with progress events), handles `pause_turn` continuation, returns `{ text, citations, usage }` where `usage` includes server tool use counts.
- Errors map to the v0 codes plus `web_search_disabled` and `spend_limit_reached`.
- Anthropic implementation uses the web search tool and the web fetch tool. Read the current tool type strings from Anthropic's docs at build time and keep them in one constant per tool; do not scatter version strings.

---

## 8. Security and privacy additions

1. The isolation rule (3.2) is mandatory and covered by a unit test that fails if any task definition gives web tools to a task that receives user files.
2. The hidden render window for crawling: separate session partition, `sandbox: true`, no preload, no Node, downloads blocked, permission requests denied, closed after each page, 15-second timeout.
3. The crawler only requests the user's own domain (and its subdomains other than those skipped). It never sends cookies or credentials.
4. Extracted text from user files is sent only to the configured provider and only in synthesis tasks.
5. The workspace may contain confidential files. Never write user file content to logs.
6. The onboarding sign-up sends nothing from the app (2.5).

---

## 9. Acceptance criteria

v1 is done when, on Shahed's Mac, with a real company:

1. A new empty folder triggers onboarding steps 2.2 to 2.7; an existing completed workspace goes straight to Home; a skill-pack vault is detected and prefilled.
2. An unreachable website is caught on the company step.
3. "Get updates" and "Join the community" open the browser; nothing is sent by the app (Network check in main-process logs).
4. Files dropped in 2.6 are copied (originals untouched) into the right `inputs/` subfolders and extracted.
5. The confirmation card shows a cost range and time estimate; the budget cap pauses the run when reached.
6. Research completes end to end and writes every file in section 5. Stage 1 tasks visibly run in parallel.
7. A run with concurrency forced to 6 on a low-limit key survives 429s by waiting and backing off.
8. Quitting mid-run and relaunching offers Resume, which skips finished tasks.
9. Turning web search off (simulate the 400) skips web tasks and still produces a playbook from the crawl and files, with a clear notice.
10. The playbook has all seven sections, a table of contents, and a `versions/` copy. Re-running creates v2 without touching v1.
11. The Messaging Analysis shows five score tiles with quoted evidence and five prioritised fixes.
12. Training Data lists every research output with working source links; pasting a missing social tagline updates the file.
13. Editing the playbook in another editor updates the in-app view within 2 seconds.
14. Chat in workspace mode answers "What is our positioning statement?" from the playbook.
15. The isolation unit test passes. No task with user files has web tools.
16. No em dashes in UI strings or generated documents.
17. CI green on macOS, Windows and Linux.

---

## 10. Open items (owner: Shahed)

| # | Item | Needed before |
|---|---|---|
| 1 | Updates sign-up form URL (Tally or similar, with an `email` prefill parameter) | Phase 2 of the plan |
| 2 | Community link (Discord, GitHub Discussions or other) | Phase 2 |
| 3 | Confirm the default budget cap ($5) and concurrency (3) | Phase 4 |
| 4 | Review and approve the Messaging Analysis skill prompt and scorecard | Phase 6 |
| 5 | Decide whether app skills (`messaging-analysis` and others) get contributed back to `pifpof/positioningHQ` | After v1 |

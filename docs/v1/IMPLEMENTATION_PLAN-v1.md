# PositioningHQ Desktop: v1 Implementation Plan

**Date:** 2026-10-16
**Reads with:** `REQUIREMENTS-v1.md` (what and why), `CLAUDE.md` (rules, updated for v1)
**Starts from:** a passing v0 (wizard, key storage, provider interface, mode-based chat, CI).

v1 is roughly three times the size of v0: about **48 focused hours** (31 for Milestone A, 17 for Milestone B). It is split into two milestones so there is a usable product at the halfway point.

- **Milestone A: "Playbook from a URL"** (Phases 1 to 7). Onboarding, files, crawl, task engine, company research, playbook v1, progress screen, a basic playbook view.
- **Milestone B: "The full home"** (Phases 8 to 11). Social taglines, messaging analysis, Training Data, Messaging Analysis view, grounded chat, polish.

Work phase by phase. Each phase ends with a **Done when** check and a commit.

---

## New dependencies

All pure JavaScript (no native modules), so CI builds stay simple on all three platforms. Use the latest stable versions at install time.

| Purpose | Package |
|---|---|
| Front matter read/write | `gray-matter` |
| Folder watching | `chokidar` |
| robots.txt | `robots-parser` |
| Sitemap XML | `fast-xml-parser` |
| HTML to DOM (no browser) | `linkedom` |
| Main-content extraction | `@mozilla/readability` |
| HTML to markdown | `turndown` (+ `turndown-plugin-gfm`) |
| PDF text | `unpdf` (or `pdfjs-dist` legacy build) |
| DOCX text | `mammoth` |
| PPTX text | `jszip` + `fast-xml-parser` (read `ppt/slides/*.xml` text runs) |
| Drag and drop zones | native HTML drag events (no library) |

No orchestration framework. The task engine is small and lives in `src/main/research/`.

---

## New source layout (additions to v0)

```
resources/
└── skills/
    ├── VENDORED.md                 source repo, pinned commit, licence note
    ├── company-research/           vendored from pifpof/positioningHQ (MIT)
    ├── positioning-playbook/       vendored
    ├── website-positioning/        app skill (new)
    ├── social-taglines/            app skill (new)
    ├── competitor-profile/         app skill (new, adapts company-research step 08)
    ├── proof-gathering/            app skill (new, adapts playbook section 07 research)
    └── messaging-analysis/         app skill (new)
scripts/
└── skills-sync.ts                  npm run skills:sync: pulls the pinned commit into resources/skills
src/
├── shared/
│   ├── links.ts                    sign-up form URL, community URL, docs URLs
│   ├── profile.ts                  zod schema for the company/user profile
│   └── research.ts                 TaskId, TaskStatus, RunState, RunEvent types
├── main/
│   ├── workspace/
│   │   ├── detect.ts               empty / phq workspace / skill-pack vault / non-empty (REQ 2.1)
│   │   ├── layout.ts               creates the folder tree (REQ 5); safe file names
│   │   ├── vault-config.ts         reads and writes vault.config.md
│   │   ├── profile.ts              profile.json + memory/company-profile.md
│   │   ├── inputs.ts               copy files into inputs/<category>/
│   │   ├── documents.ts            list/read markdown docs with front matter
│   │   └── watcher.ts              chokidar; emits doc-changed events to the renderer
│   ├── ingest/
│   │   ├── crawler.ts              T1
│   │   ├── render-window.ts        hidden sandboxed BrowserWindow for JS-rendered pages
│   │   ├── html-to-md.ts
│   │   └── extract.ts              T2: pdf, docx, pptx, md, txt, csv
│   ├── research/
│   │   ├── tasks.ts                task definitions (the DAG as data)
│   │   ├── prompt-builder.ts       skill files + profile + inputs -> system/messages with cache breakpoints
│   │   ├── engine.ts               scheduler: deps, concurrency, retries, budget, pause/resume/cancel
│   │   ├── run-store.ts            .positioninghq/runs/<id>.json
│   │   ├── estimates.ts            expected tokens/searches per task
│   │   ├── pricing.ts              loads pricing.json, computes cost from usage
│   │   ├── postprocess.ts          em dash replacement, front matter, Sources section, scorecard JSON check
│   │   └── assemble.ts             company-research and playbook assembly, versioning
│   ├── chat/
│   │   └── store.ts                .positioninghq/chats/<id>.json
│   └── modes/
│       └── workspace.ts            grounded chat system prompt built from workspace docs
└── renderer/src/features/
    ├── onboarding/                 + CompanyStep, AboutYouStep, GoalsStep, StayInLoopStep, FilesStep, StartResearchStep
    ├── research/                   ProgressScreen, TaskRow, CostMeter, BudgetDialog
    ├── shell/                      HomeShell, Sidebar, ResearchPill
    ├── documents/                  DocView (markdown + front matter + sources), Toc, VersionSelect
    ├── training-data/
    ├── playbook/
    ├── messaging/                  Scorecard tiles
    └── chat/                       + ChatList, persisted chats, workspace mode starter prompts
pricing.json                        bundled, approximate, lastUpdated
tests/unit/
    ├── isolation.test.ts           no task with user files gets web tools
    ├── dag.test.ts                 no cycles; every dependency exists; output paths unique
    ├── engine.test.ts              concurrency, 429 backoff, failure isolation, resume, cancel, budget pause
    ├── crawler.test.ts             robots, same-origin, budget, priority ordering (with a local test server)
    ├── extract.test.ts             fixture files of each type
    ├── detect.test.ts              four workspace states
    └── safe-names.test.ts
```

---

# Milestone A: Playbook from a URL

## Phase 1: Workspace model (about 3 hours)

1. `detect.ts`: return `empty | phq-complete | phq-incomplete | skillpack-vault | non-empty` per REQ 2.1. Hidden files (`.DS_Store`, `.git`) don't count as content.
2. `layout.ts`: create the REQ 5 tree idempotently. `safeName()` for `<Company>` (REQ 5 last bullet).
3. `vault-config.ts`: write a skill-pack-compatible `vault.config.md` and tick status checkboxes as stages complete. Parse an existing one for import.
4. `profile.ts`: zod schema in `shared/profile.ts`; write `profile.json` and a readable `memory/company-profile.md`.
5. `documents.ts`: list and read markdown with `gray-matter`; return `{ path, title, frontMatter, body, mtime }`.
6. `watcher.ts`: watch `memory/` and `inputs/`; debounce 300ms; send `workspace:changed` with the paths.
7. IPC (add to `ipc-contract.ts` first): `workspace:detect`, `workspace:createLayout`, `profile:get`, `profile:save`, `docs:list`, `docs:read`, `docs:openInEditor`, `workspace:changed` (event).
8. Update the v0 workspace step to call `workspace:detect` and route per REQ 2.1.

**Done when:** `detect.test.ts` and `safe-names.test.ts` pass; choosing an empty folder creates the full tree; choosing a folder with a skill-pack `vault.config.md` returns its company name and website.

## Phase 2: Onboarding steps (about 4 hours)

1. Steps per REQ 2.2 to 2.6 in `WizardShell`, with the exact copy. Step indicator now counts all steps.
2. Company step: website normalisation and a reachability check via a new `net:checkUrl` IPC (main does a GET with a 10-second timeout, follows redirects, returns the final URL).
3. Competitors field: tag input, max 5.
4. Goals: multi-select cards (Card + check state), at least one required.
5. Stay in the loop: optional email input; "Get updates" opens `links.signupFormUrl` with `?email=` prefilled via `shell:openExternal`; "Join the community" opens `links.communityUrl`. Add both hosts to the external allowlist.
6. Files step: six drop zones; `inputs:add` IPC copies files (main reads the dropped file paths via `webUtils.getPathForFile` in preload, validates type and size, copies with numeric suffix on clash). Show per-file chips with remove (deletes the copy only).
7. Save the profile at each step so quitting mid-onboarding resumes where the user left off.

**Done when:** acceptance criteria 1 (onboarding routing), 2 and 3 and 4 pass.

## Phase 3: Local ingestion (about 5 hours)

1. `crawler.ts` (T1) per REQ 3.3: robots via `robots-parser`; sitemap via `fast-xml-parser`; same-origin queue with the priority scoring (URL path keywords: `product`, `solution`, `platform`, `pricing`, `about`, `customer`, `case-stud`, `why`, `vs`, `compare`; then `blog`, max 3); skip patterns (`legal`, `privacy`, `terms`, `careers`, `jobs`, `login`, `signin`, `app.`, `docs.`); 1 request per second; 30 pages; 15-second timeout per page.
2. `html-to-md.ts`: `linkedom` DOM, `Readability` for main content, `turndown` with GFM tables; also return title, meta description, OG tags, H1 and H2s, social links (match hostnames for linkedin.com, x.com, twitter.com, instagram.com, facebook.com, youtube.com).
3. `render-window.ts`: when a page yields under 200 words, load it in a hidden `BrowserWindow` with `partition: 'crawler'`, `sandbox: true`, no preload, `webSecurity: true`; block downloads and permission requests on that session; wait for `did-finish-load` plus 1.5 seconds; `executeJavaScript('document.documentElement.outerHTML')`; close. One render window at a time.
4. Write pages and `index.md` per REQ 3.3.
5. `extract.ts` (T2): one extractor per type; output per REQ 3.3; truncate at a 30,000-token budget per file (estimate tokens as characters divided by 4) with a note in front matter.
6. Both run as engine tasks later; for now expose a dev-only IPC to run them directly.

**Done when:** `crawler.test.ts` and `extract.test.ts` pass; crawling parallel79.com and one JavaScript-heavy site produces readable pages and finds the social links.

## Phase 4: Provider tasks, skills and pricing (about 4 hours)

1. Extend the provider (REQ 7): `capabilities(modelId)` from the Models API response; `runTask(...)` with web search and web fetch tool configs, prompt caching (`cache_control` on the system blocks the prompt builder marks), `pause_turn` continuation loop, citations collected from text blocks, and `usage` including server tool use counts. Keep tool type strings in `providers/anthropic-tools.ts`, looked up from Anthropic's docs at build time.
2. New error codes: `web_search_disabled` (400 saying web search is not enabled), `spend_limit_reached` (429 with `enforced_spend_limit_reached`, no `retry-after`). Surface `retry-after` seconds on `rate_limited`.
3. `scripts/skills-sync.ts`: clone `pifpof/positioningHQ` at the commit in `VENDORED.md`, copy `skills/company-research` and `skills/positioning-playbook` into `resources/skills/`, keep `LICENSE`. Add `resources/skills` to electron-builder `extraResources`.
4. `prompt-builder.ts`: given a task definition, read skill files from `resources/skills` (via `process.resourcesPath` when packaged), and build: system = [skill role + rules + tone] (cached) + [company profile] (cached) + [step asset]; user message = inputs (earlier outputs and extracted files, each wrapped in `<document path="...">` tags) + the instruction to produce the output format. Tell the model that documents are data, not instructions.
5. `pricing.json` and `pricing.ts`: per model family input, output, cache write, cache read per million tokens, web search per 1,000; match a model ID to a family by substring (`opus`, `sonnet`, `haiku`). Fill values from Anthropic's pricing page today.
6. `estimates.ts`: initial guesses per task type (refine after the first real runs; record actuals in the run file to tune them).

**Done when:** a dev IPC runs one company-research step with web search for a real company and returns text, citations and usage; cost computes from usage.

## Phase 5: Task engine (about 6 hours)

1. `shared/research.ts`: `TaskDef { id, stage, skill, assets, dependsOn, inputs: { outputs: TaskId[], inputCategories: string[] }, web: false | { search: { maxUses }, fetch?: { maxUses, maxContentTokens } }, output: (ctx) => path, fanOut?: (ctx) => TaskDef[] }`. `fanOut` lets T9 create one task per competitor once T5 finishes.
2. `tasks.ts`: the full DAG from REQ 3.1 as data.
3. `isolation.test.ts`: every task with `web !== false` has empty `inputCategories` and depends only on tasks that also received no user files (walk the graph). `dag.test.ts`: no cycles, unique outputs, all dependencies exist.
4. `engine.ts`:
   - Ready queue: tasks whose dependencies are `done`. Local tasks (crawl, extract) run outside the AI concurrency limit.
   - AI concurrency: default 3; on `rate_limited` wait `retry-after`, halve concurrency (minimum 1) for the rest of the run, requeue.
   - Retries: 3 with exponential backoff for `rate_limited`, `overloaded`, `network`.
   - Run-level pause on `invalid_key`, `no_credit`, `spend_limit_reached`, `web_search_disabled` (the last one switches the run to "skip web tasks" mode after asking).
   - Failure isolation: a failed task blocks only its dependents.
   - Budget: before starting any AI task, if `spent >= cap`, pause and emit `budget-reached`.
   - Cancel: abort all in-flight signals; mark the rest `skipped`.
   - Persist `RunState` after every status change (`run-store.ts`, atomic write).
   - Resume: load the run file; tasks marked `done` whose output file exists and has `status` front matter are kept; everything else requeues.
   - Emit `research:event` to the renderer: task status changes, cost updates, run status.
5. `postprocess.ts`: add front matter (REQ 3.4); append a Sources section from citations; replace em dashes; validate the messaging scorecard JSON block (Phase 9).
6. IPC: `research:estimate`, `research:start`, `research:pause`, `research:resume`, `research:cancel`, `research:retryTask`, `research:getRun`, `research:setBudget`, `research:event` (event).

**Done when:** `engine.test.ts` passes with a fake provider: parallelism respected, 429 backoff halves concurrency, a failed task blocks only dependents, quitting and resuming skips finished tasks, cancel aborts, budget pauses.

## Phase 6: Research and playbook tasks (about 5 hours)

1. Wire T1 to T7, T9 to T20 as task definitions with their skills:
   - `company-research` steps 02 to 07 (T4), 01 (T7), 08 (T11, using `competitor-profile` outputs), 09 (T12) and the assembled `<Company>.md`.
   - `competitor-discovery` (T5) and `competitor-profile` (T9, fan-out) app skills.
   - `proof-gathering` (T10) app skill.
   - `website-positioning` (T6) app skill.
   - `positioning-playbook` sections (T13 to T19) and `assemble.ts` for T20 with versioning.
2. Write the four new app skills in the skill-pack format. Base `competitor-profile` on company-research step 08 and playbook section 06; base `proof-gathering` on playbook section 07's research sources. Keep the skill pack's tone and format rules.
3. Keep the skill pack's playbook constraint (no competitor brand names in the playbook) as written.
4. Update `vault.config.md` checkboxes as company research and playbook complete.

**Done when:** a full run for a real company (start with Parallel79 itself) produces the company research file, competitor profiles and playbook v1 with seven sections; a second run produces v2 and leaves v1 untouched.

## Phase 7: Start card, progress screen, basic playbook view (about 4 hours)

1. `StartResearchStep` (REQ 2.7): four-line summary, estimate range from `research:estimate`, time estimate, budget input, start and "Not now".
2. `ProgressScreen` (REQ 3.5): tasks grouped by stage with status icons, elapsed time, per-task cost; `CostMeter` with spent vs cap; Stop research; Retry on failed rows; "Continue in the background".
3. `BudgetDialog` for `budget-reached`; pause/resume dialogs for run-level errors, using the v0 error copy plus the new codes.
4. OS notification on completion when the window isn't focused.
5. Minimal `HomeShell` with the sidebar (Phase 10 completes it) and a first `DocView` for the playbook so Milestone A is usable.
6. Launch logic: if a run is in progress or incomplete, show "Resume research" on launch.

**Done when:** Milestone A acceptance: criteria 5, 6, 7, 8, 9 and 10 from REQ 9 pass.

---

# Milestone B: The full home

## Phase 8: Social taglines (about 3 hours)

1. T3 `find-social-profiles` and T8 `social-taglines` task definitions and the `social-taglines` app skill: prefer social links found by the crawl; search for the rest; collect taglines from search snippets and any page web fetch can read; output the table with found / not found.
2. Treat blocked social pages as "not found", never as task failure.

**Done when:** a run for Parallel79 lists the LinkedIn and other profiles linked from the site, with whatever taglines are publicly reachable, and clearly marks the rest.

## Phase 9: Messaging Analysis (about 4 hours)

1. Write `resources/skills/messaging-analysis/` (`SKILL.md`, `assets/` per output section, `references/scoring-rubric.md` defining 1 to 5 for each dimension with examples). Output structure per REQ 3.3 T21, starting with a fenced `json` scorecard block: `{ "scores": [{ "dimension": "Clarity", "score": 3, "evidence": "..." }, ...] }`.
2. Task T21 with inputs T6, T8, T20 and extracted files; no web tools; recommendations ordered by the profile's goals.
3. Postprocess validates the JSON block against a zod schema; on failure, retry the task once with the validation error, then fall back to rendering markdown only.
4. Send the skill prompt and a sample output to Shahed for review (Open item 4) before finalising wording.

**Done when:** acceptance criterion 11 passes for two different companies.

## Phase 10: Home shell and document views (about 6 hours)

1. `Sidebar` per REQ 4.1: wordmark and company name, four nav items, recent chats under Chat, `ResearchPill`, Settings and workspace at the bottom; collapsible with `Cmd/Ctrl+B`; persists collapsed state.
2. `DocView`: renders markdown with the v0 `Markdown` component; header with title, last updated (from front matter or mtime), "Open in editor", "Show in Finder"; sources list; refreshes on `workspace:changed`.
3. **Training Data** (REQ 4.3): grouped list from `docs:list` plus `profile:get` and `inputs/`; editable profile form (marks playbook out of date); "Paste it" for missing taglines (writes via a `social:setTagline` IPC that edits the table row); "Add files" reusing the Phase 2 drop zones; per-item "Re-run" via `research:retryTask` or a single-task run.
4. **Positioning Playbook** (REQ 4.4): sticky table of contents from H2s; `VersionSelect`; out-of-date banner (compare profile and inputs mtimes against the version's `created`); Copy as markdown; Regenerate (runs Stage 4 only, plus T21).
5. **Messaging Analysis** (REQ 4.5): `Scorecard` tiles (dimension, score as a serif numeral in teal, 5-dot meter, evidence in muted text) above the document; one-time updates/community card after first view if skipped during onboarding.
6. External links from research `sources` open after a one-time confirmation (REQ 4.3).

**Done when:** acceptance criteria 12 and 13 pass; every view has a sensible empty state during a run.

## Phase 11: Grounded chat and finish (about 4 hours)

1. `modes/workspace.ts`: system prompt = role + playbook + research synthesis + website positioning + messaging analysis (each in `<document>` tags, cached). Fall back to `general` mode if no playbook exists yet. No web tools.
2. Chat persistence (`chat/store.ts`): save after each completed reply; list, rename, delete; recent chats in the sidebar.
3. Starter prompts from goals (REQ 4.2).
4. Run the full REQ 9 acceptance list and record results in `docs/v1-acceptance.md`.
5. Sweeps: no em dashes in `src/` strings or generated docs; no user file content or keys in logs; isolation test green.
6. Tag `v0.1.0`.

**Done when:** all 17 acceptance criteria pass and CI is green on all three platforms.

---

## Timeline

| Block | Phases | Hours (approx.) |
|---|---|---|
| Milestone A, weekend 1 + evenings | 1 to 7 | 31 |
| Milestone B, weekend 2 | 8 to 11 | 17 |

If time runs short, cut in this order: hidden render window fallback (crawl static HTML only), PPTX extraction, chat persistence, version selector UI (keep the files), OS notification. Never cut: the isolation rule and its test, resume, budget cap, 429 handling, citations.

---

## Risks

| Risk | Mitigation |
|---|---|
| New Anthropic accounts have low rate limits; parallel tasks hit 429 | Adaptive concurrency and `retry-after` handling (Phase 5); default concurrency 3 |
| Social networks block automated access | Best effort by design; "not found" plus "Paste it" (Phase 8) |
| Cost surprises a founder | Estimate before start, live meter, budget cap pause (Phases 4, 5, 7) |
| Prompt injection from crawled or searched pages | Isolation rule; no local tools; documents marked as data; outputs written to fixed paths only |
| Skill-pack prompts were written for interactive Claude Desktop ("ask the user...") | Prompt builder strips or overrides interactive instructions; task prompts state that all inputs are provided and no questions can be asked |
| JavaScript-heavy sites yield empty crawls | Hidden render window fallback (Phase 3) |
| Generated scorecard JSON malformed | Schema validation, one retry, markdown fallback (Phase 9) |
| Web tool version strings change | One constants file, checked against Anthropic docs when upgrading |

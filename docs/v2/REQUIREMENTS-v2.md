# PositioningHQ Desktop: v2 Requirements

**Version:** v2 (workspace becomes an LLM wiki)
**Date:** 2026-10-17
**Owner:** Shahed Khalili, Parallel79°
**Builds on:** v0 and v1 (implemented). Everything in v1 still applies unless this document changes it.
**Format contract:** `WIKI-FORMAT-SPEC.md` (PositioningHQ Wiki Format, version 1, based on llm-wiki v0.25.x). This document says how the app adopts it; the spec says what the files look like. If they disagree, the spec wins.
**Companion docs:** `IMPLEMENTATION_PLAN-v2.md`, `PLUGIN-WIKI-MIGRATION.md` (the skill pack's matching change), `CLAUDE.md` (updated rules)

---

## 1. Why v2

The workspace is meant to be a data source any LLM can use: Claude, ChatGPT, Codex, Cursor, local models, and the user's own agents. v1 writes one large playbook file and a custom folder layout that only PositioningHQ understands. v2 makes the workspace a standard **llm-wiki topic wiki**:

- Small, single-purpose articles (the ICP, each value driver, each competitor) that an agent can load on their own.
- Every claim traceable to a source file.
- Indexes in every folder, so agents read summaries before files.
- A layout that llm-wiki tools, Obsidian, GitHub and plain editors all understand.

The playbook and messaging analysis become **assembled outputs** built from the articles, not the source of truth.

### 1.1 Out of scope for v2

- New research types or new skills beyond what v1 runs (messaging analysis stays as it is, just re-homed).
- Battlecards, call plans, launch plans in the app (the skill pack produces them in the new format; see `PLUGIN-WIKI-MIGRATION.md`).
- Git integration (allowed by the format, not built here).
- Multiple products per wiki (the format reserves the naming; the app still supports one product).
- The hosted MCP service.

---

## 2. Workspace layout (replaces REQUIREMENTS-v1 section 5)

The workspace root **is** the topic wiki root, laid out exactly as `WIKI-FORMAT-SPEC.md` section 2. Summary of where v1 content goes:

| v1 location | v2 location |
|---|---|
| `vault.config.md` | `config.md` (front matter: `title`, `description`, `created`, `format_version`) |
| `.positioninghq/workspace.json`, `profile.json`, `runs/`, `chats/` | App state folder outside the wiki (2.1) |
| `inputs/<category>/<file>` | Original copied to `inbox/`, ingested to `raw/papers/` or `raw/data/` or `raw/notes/` tagged `private` + category tag; original moved to `inbox/.processed/` |
| `memory/company-profile.md` | `wiki/references/company-profile.md` |
| `memory/research/website/pages/*.md` | `raw/articles/YYYY-MM-DD-<domain>-<page>.md` tagged `own-site` |
| `memory/research/website/index.md` | Not kept as a file; its facts feed `wiki/topics/current-messaging.md` and the raw index |
| `memory/research/website-positioning.md` | `wiki/topics/current-messaging.md` |
| `memory/research/social-taglines.md` | `raw/notes/YYYY-MM-DD-social-<network>.md` per profile + `wiki/references/social-taglines.md` |
| `memory/research/competitors.md`, `competitors/*.md` | `wiki/references/competitor-<x>.md` per competitor (+ competitor pages fetched in `raw/articles/` tagged `competitor-site`) |
| `memory/research/proof-public.md` | Citation records in `raw/articles/` + feeds `wiki/references/proof-points.md` |
| `memory/research/inputs-extracted/**` | `raw/papers/`, `raw/data/`, `raw/notes/` (the ingested user files) |
| `memory/company-research/steps/01..09` | `wiki/topics/company-overview`, `product-overview`, `market-segment`, `customer-segment`, `recent-developments`, `market-position-summary`; `wiki/references/strengths`, `weaknesses`; step 08 feeds the competitor articles |
| `memory/company-research/<Company>.md` | Not kept (the articles replace it) |
| `memory/positioning-playbook/<Company>.md` | Assembled `output/positioning-playbook-v<N>-<date>.md`; its sections become the articles in spec section 6 |
| `memory/positioning-playbook/versions/*` | `output/positioning-playbook-v<N>-<date>.md` |
| `memory/messaging-analysis/<Company>.md` | `output/messaging-analysis-v<N>-<date>.md` |
| `outputs/battlecards/`, `call-plans/`, `launch/` (empty) | Removed; future deliverables go in `output/` per the spec |

New root files the app creates: `README.md` (spec section 9), `_index.md`, `schema.md` (spec section 7), `log.md`.

### 2.1 App state outside the wiki

llm-wiki flags unknown folders at the wiki root, so the app no longer keeps `.positioninghq/` inside the workspace.

- App state lives in Electron `userData`: `workspaces/<workspace_id>/` with `workspace.json`, `profile.json`, `runs/`, `chats/`, `provenance.json`.
- `workspace_id` is a UUID written to the wiki's `config.md` body under a "PositioningHQ" heading (`Workspace ID: <uuid>`), not as a front matter key, so it survives moves and copies without adding unknown keys.
- `provenance.json` maps each generated file path to the task, run, model, timestamp and the inputs it received. It is the app's record of how a file was made; the wiki itself carries only spec-defined front matter plus the `log.md` entry.
- If the app opens a wiki it has no state for (copied from another machine, or made by the skill pack), it creates fresh state, reads the profile back from `wiki/references/company-profile.md`, and works normally. Chats and run history are per machine.

### 2.2 Workspace detection (replaces REQUIREMENTS-v1 section 2.1)

| Folder contents | Behaviour |
|---|---|
| Empty | New wiki: create the spec layout, then company onboarding (v1 section 2) |
| A PositioningHQ wiki (`config.md` with `format_version`) at the supported version | Open; go to Home |
| A PositioningHQ wiki at an older format version | Offer the format migration for that version (none exist yet; framework only) |
| A PositioningHQ wiki at a newer format version | Open read-only; banner: "This wiki was made by a newer version of PositioningHQ. Update the app to edit it." |
| A v1 app workspace (`.positioninghq/workspace.json` and `memory/`) | Offer the v1 migration (section 6) |
| An old skill-pack vault (`vault.config.md`, `memory/`, `inputs/`) | Offer the v1 migration (same converter) |
| Another llm-wiki topic wiki (has `_index.md`, `raw/`, `wiki/`, no PositioningHQ `config.md`) | Warn: "This is an llm-wiki about something else. Choose an empty folder or a PositioningHQ wiki." |
| Anything else non-empty | v1 behaviour (warn, use anyway or choose another) |

### 2.3 llm-wiki hub (optional)

When `~/.config/llm-wiki/config.json` exists (the llm-wiki hub config), the workspace step offers a third option: **"Create inside my llm-wiki hub"**, which uses `<hub>/topics/<company-slug>/` as the workspace and, with the user's consent, adds an entry to the hub's `wikis.json` and a line to the hub `log.md`. The hub path is read from `hub_path` (expand a leading `~` only). If the hub isn't readable, hide the option.

---

## 3. Research pipeline changes (amends REQUIREMENTS-v1 section 3)

The v1 task DAG, isolation rule, concurrency, budget, retries and resume all stay. What changes is what tasks read and write.

### 3.1 Ingest before compile

Three ingest steps write `raw/` before any AI task runs on that material:

- **Website ingest** (v1 T1): crawled pages go to `raw/articles/` with spec raw front matter (`source` = page URL, tags `own-site` plus page-type tags such as `pricing`, `about`, `customers`).
- **File ingest** (v1 T2): each user file is copied into `inbox/`, extracted to markdown in the right `raw/` type folder with tags `private` and its category tag, then the copy moves to `inbox/.processed/`. The user's original on their own disk is never touched.
- **Citation ingest** (new, runs inside every web task's post-processing): each unique URL the provider cited becomes a citation record in `raw/articles/` (spec section 4.4). Pages fetched in full via web fetch are stored in full instead. Duplicate URLs within one run share one raw file: the app adds excerpts to it while the run is in progress and treats it as final (never edited again) once the run ends. A later run that cites the same URL writes a new dated citation record, so raw files stay immutable after ingest.

### 3.2 Tasks produce articles, not documents

Every AI task that writes knowledge now returns **structured output**: a list of articles, each with `slug`, `category`, `title`, `summary`, `aliases`, `tags`, `confidence`, `body` and `sources` (raw paths it used). The main process validates and writes them. The task's prompt receives each input document wrapped with its path (`<document path="raw/articles/...">`), so the model can cite paths it was actually given.

Validation before writing (post-processing):

1. Slug and category match spec section 6 for that task (unknown slugs are rejected; the task retries once with the error).
2. Every `sources` path exists and was among the task's inputs or its own citation records. Paths that don't qualify are dropped; if none remain, `confidence` becomes `low` and the article gets `compiled-from: mixed`.
3. `confidence` is clamped by the spec 4.3 rule.
4. `private` tag added if any source is private.
5. Body has the abstract line, the section template headings, a See Also (if it links anything) and a Sources section generated from `sources` (the app writes Sources itself; it doesn't trust the model's).
6. All cross-references converted to two-form links; links to slugs that don't exist yet are kept as plain text and listed for the lint report.
7. Em dashes replaced; front matter limited to spec keys.

Structured output is carried by a single schema-only output tool (or the provider's structured-output feature). This does not break the v1 rule "no local tools": the output tool performs no action; the main process validates its arguments and writes files to paths derived from the slug.

### 3.3 Task to article mapping

| v1 task | v2 writes |
|---|---|
| T1 crawl-website | `raw/articles/*` (own-site) |
| T2 extract-input-files | `inbox/` -> `raw/papers|data|notes/*` (private) |
| T3 find-social-profiles + T8 social-taglines | `raw/notes/*-social-<network>.md`, `wiki/references/social-taglines` |
| T4 research-02..07 | `wiki/topics/product-overview`, `market-segment`, `customer-segment`, `recent-developments`; `wiki/references/strengths`, `weaknesses` |
| T5 competitor-discovery | Candidate list in the run state (no article); feeds T9 |
| T6 website-positioning | `wiki/topics/current-messaging` |
| T7 research-01 | `wiki/topics/company-overview` |
| T9 competitor-profiles (fan-out) | `raw/articles/*` (competitor-site, citations), `wiki/references/competitor-<x>` |
| T10 proof-gathering | `raw/articles/*` citation records (feeds T16) |
| T11 research-08 | Updates the top competitor's `competitor-<x>` with the step-08 sections (sales tactics, trap questions) |
| T12 research-09 | `wiki/topics/market-position-summary` |
| T13 playbook-01 | `wiki/topics/market-overview` |
| T14 playbook-02 | `wiki/topics/ideal-customer-profile` |
| T15 playbook-06 | `wiki/topics/competitive-landscape` (and adds SWOT and win stories to each `competitor-<x>`) |
| T16 playbook-07 | `wiki/references/proof-points` |
| T17 playbook-03 | `wiki/concepts/value-drivers` + three `value-driver-<x>` |
| T18 playbook-04 | Two or three `wiki/concepts/moat-<x>` |
| T19 playbook-05 | `wiki/concepts/positioning-statement` |
| T20 playbook-assemble | `output/positioning-playbook-v<N>-<date>.md` (no AI call: deterministic assembly from the articles, spec 4.5) |
| T21 messaging-analysis | `output/messaging-analysis-v<N>-<date>.md` (unchanged content, new home; cites wiki articles) |
| Onboarding | `wiki/references/company-profile` (`compiled-from: conversation`) |

The isolation rule now keys on the `private` tag: a web task's inputs may contain only raw files without `private` and articles whose source chain contains no `private` file. The v1 isolation test is updated to walk source chains.

### 3.4 Deterministic assembly

T20 builds the playbook from articles with no model call:

- Table of contents, then the seven sections in skill-pack order, each built from its article body (abstract line removed, headings demoted one level).
- Competitor brand names: the skill pack's rule says the playbook uses category terms. Articles keep real names. Assembly replaces each competitor's name and aliases with the category term from the `**Category term:**` line that every `competitor-<x>` article carries under its abstract (spec 6.3), for example "legacy forecasting suites". If the line is missing, the name is kept and the conformance report notes it.
- Front matter per spec 4.5, `sources` listing the articles used.
- Re-running assembly after a founder edits an article produces the next version. No AI cost.

### 3.5 Decisions

New in v2, small: when the user edits an article in the app's document view or tells the chat "make that our decision", the app writes a decision article (spec 6.4) after showing a preview. Every generation task receives all `decision-*` articles that link to its output slugs, with the instruction not to contradict them. v2 supports creating decisions from chat (a "Record as decision" action under an assistant reply) and from the playbook view ("Record a decision about this section").

### 3.6 Indexes and log

After every run, ingest, decision or migration, the app regenerates every affected `_index.md` (spec section 5) and appends to `log.md` (spec section 11). Index generation reads front matter only; it never calls a model.

---

## 4. Home screen changes (amends REQUIREMENTS-v1 section 4)

Navigation stays: Chat, Training Data, Positioning Playbook, Messaging Analysis. Add **Use your wiki** under them.

### 4.1 Training Data

Two tabs:

- **Knowledge** (`wiki/`): grouped as the spec's article map (Company, Market, Customers, Positioning, Competitors, Proof, Messaging, Decisions). Each article shows confidence, volatility, verified date and a `private` badge. The article view renders the body, then **Sources** (clickable, opens the raw file in the app), **Linked from** (backlinks computed from two-form links) and actions: Open in editor, Show in Finder, Re-run, Record a decision.
- **Sources** (`raw/`): grouped by type and tag (Your website, Competitor sites, Web citations, Social, Your files). Raw files are read-only in the app. "Add files" ingests into `inbox/` then `raw/`. Missing social taglines: "Paste it" writes a new `raw/notes/` file (not an edit of an existing raw file) and re-runs T8.

Profile edits rewrite `wiki/references/company-profile.md` (it's `compiled-from: conversation`, so editing it is legitimate) and mark dependent articles out of date.

### 4.2 Positioning Playbook

Renders the latest `output/positioning-playbook-v*.md`. Section headings link to their source articles ("Edit the source article"). "Regenerate" now has two options: **Reassemble** (free, deterministic, after article edits) and **Re-run playbook research** (v1 behaviour, costs money).

### 4.3 Messaging Analysis

Renders the latest `output/messaging-analysis-v*.md`. Unchanged otherwise.

### 4.4 Chat (workspace mode)

Grounding switches from "load whole documents" to **index-first**, mirroring llm-wiki's query-lite:

1. Always in context (cached): `README.md` reading rules, the master `_index.md`, and the "Start here" articles.
2. Per question: match the question against article titles, aliases and summaries from the indexes; load up to 6 matching articles (and their raw sources only if the user asks for evidence).
3. Answers cite wiki paths; citations render as links that open the article in Training Data.
4. Show "Answered from: <articles>" under each reply.

### 4.5 Use your wiki (new view)

Explains and enables use outside the app:

- **Any AI tool:** "Point it at this folder and tell it to read `README.md` first." Copy-ready prompt.
- **Claude Desktop / Claude Code:** add the folder as a project folder; copy-ready instruction.
- **ChatGPT, Gemini and others without folder access:** "Export as a single file" builds `output/wiki-export-YYYY-MM-DD.md` with the README rules, the master index and every non-private article (option to include private articles, off by default, with a warning). Also "Export as zip" of the whole wiki.
- **Obsidian:** "Open as an Obsidian vault" opens `obsidian://open?path=<workspace>` (allowlist the scheme).
- **llm-wiki:** if a hub exists and the wiki isn't registered, "Add to my llm-wiki hub" (section 2.3); shows the `/wiki:query` command to try.
- **Health:** last conformance check result (section 5) with counts and a "Check now" button.

---

## 5. Conformance

- The app ships a TypeScript conformance checker covering the llm-wiki checks that matter for us: C1 structure, C2 front matter, C3 index consistency, C4 link integrity, C4b source provenance, C11 placement, C12 unknown files, C18 missing sources; plus spec section 12 items 2 to 5.
- It runs after every run and migration and on demand. Findings show in **Use your wiki**; criticals also show a banner.
- The app auto-fixes only mechanical issues (regenerate indexes, move a misplaced generated file, re-add a missing `private` tag) and never edits raw files or user-edited articles to fix lint.
- CI runs the official `llm-wiki lint --fail-on warning` (llm-wiki v0.25.x, Python) against a fixture wiki generated by the app's pipeline with a fake provider, so drift from the real tool is caught before release.

---

## 6. Migrating v1 workspaces

v1 is implemented and in use, so v2 must convert existing workspaces safely.

### 6.1 Flow

1. Detect (section 2.2) and show: "This workspace uses the old PositioningHQ format. Convert it to the new wiki format?" with what changes, in four lines.
2. **Backup first:** zip the entire workspace into `userData/backups/<workspace_id>-v1-<timestamp>.zip`. Show the path and a "Show backup" action. Migration does not start without a verified backup (zip written and re-opened successfully).
3. Choose:
   - **Convert (free, recommended):** deterministic transformation (6.2) plus a small AI step to split the old playbook into articles (6.3).
   - **Rebuild with new research:** create the new layout, ingest the user's files and crawl again, then run the full v2 pipeline (costs as a full run).
4. Run, with a progress list like the research screen.
5. Run the conformance check. Show the result.
6. Ask before removing the old folders: "Conversion complete and checked. Remove the old `memory/`, `inputs/`, `outputs/` folders? Your backup stays in <path>." If the user says no, move them to `inbox/.unknown/v1-legacy/` so the wiki stays lint-clean.

### 6.2 Deterministic conversion

Follows the table in section 2. Specifics:

- User files: originals in `inputs/<category>/` are copied to `inbox/.processed/`, and their v1 extracted text (`memory/research/inputs-extracted/`) becomes the raw file with spec front matter (`private`, category tag, `ingested` = original file's mtime date). If extracted text is missing, extract now.
- Crawled pages: front matter rewritten to spec raw format; `source` from v1 front matter or the page's first URL line.
- v1 web-sourced documents: each `sources` URL in v1 front matter becomes a citation record (excerpt text: "Cited in v1 research; excerpt not retained").
- Company research steps: each step file becomes its article (section 2 table) with front matter mapped (`created` from v1 `created`, `sources` = the citation records made from its URLs, or, if the v1 step recorded none, a `raw/notes/YYYY-MM-DD-legacy-<step>.md` copy of the v1 step file tagged `legacy`; `confidence` by the spec rule, `volatility` by the spec table).
- Profile: `profile.json` to app state; `wiki/references/company-profile.md` rendered from it.
- Playbook and messaging analysis versions: copied to `output/` with spec output front matter. Content unchanged.
- Run history and chats: moved to app state.

### 6.3 Splitting the old playbook

The latest v1 playbook is split into section articles:

- Sections 1, 2, 5, 6, 7 map one-to-one to `market-overview`, `ideal-customer-profile`, `positioning-statement`, `competitive-landscape`, `proof-points` by their H2 headings (deterministic).
- Sections 3 and 4 (value drivers, moats) are split by their repeated headings (`#### Value Driver: ...`, moat headings) where present; if the headings aren't parseable, one small AI call (no web tools; the playbook may contain private material) splits them into `value-driver-<x>` and `moat-<x>` articles with the structured output from section 3.2.
- Before splitting, the whole v1 playbook is saved as a raw source, `raw/notes/YYYY-MM-DD-legacy-positioning-playbook.md` (tags `legacy`, plus `private` if the v1 run used any user files). Every article made by the split cites it, plus the raw files the v1 playbook run used (from v1 run state) where known. `compiled-from: mixed`; confidence by the spec rule. This keeps llm-wiki's missing-sources check (C18) clean and the provenance honest.

### 6.4 Safety

- Migration is resumable: progress written to app state after each step.
- Nothing is deleted before step 6, and nothing at all without the backup.
- If conversion fails, the workspace is restored from the backup automatically and the error is shown with "Send details" (copies a redacted report to the clipboard, no network).

---

## 7. Security and privacy additions

1. The `private` tag is the isolation boundary (section 3.3). The isolation test walks source chains.
2. Exports exclude `private` articles by default (section 4.5).
3. Writing to the llm-wiki hub (`wikis.json`, hub `log.md`) only with explicit consent, and only those two files.
4. The `obsidian://` scheme is added to the external allowlist; no other new schemes.
5. Migration backups are written to `userData` only, never uploaded.

---

## 8. Acceptance criteria

v2 is done when, on Shahed's Mac:

1. A new research run for a real company produces a wiki that passes `llm-wiki lint --fail-on warning` with llm-wiki v0.25.x installed locally, and the app's own conformance check agrees.
2. Every article in spec section 6 that the pipeline is meant to produce exists, with valid front matter and two-form links; the master `_index.md` "Start here" list resolves.
3. Every article's `sources` resolve to raw files; every web-sourced article cites at least one citation record or fetched page.
4. Any article built from a user file is tagged `private`; the isolation test passes on the full DAG.
5. The playbook output is assembled with no model call, cites the articles, and uses category terms instead of competitor names where the competitor article provides one.
6. Editing `wiki/concepts/positioning-statement.md` in Obsidian, then choosing Reassemble, produces playbook v(N+1) with the edit and costs $0.
7. Recording a decision from chat creates a valid decision article, and a subsequent playbook re-run does not contradict it.
8. Workspace chat answers "Who is our ICP?" citing `wiki/topics/ideal-customer-profile.md`, and loads no more than 6 articles for a single question.
9. Claude Code with the llm-wiki plugin, pointed at the wiki through a hub registration, answers "What is our positioning statement?" via `/wiki:query`, citing the article.
10. A model with no PositioningHQ knowledge, given only the folder and "read README.md first", answers three positioning questions with correct file citations (test with Claude and one non-Anthropic model).
11. A real v1 workspace converts with "Convert": backup zip verified, all v1 content accounted for (a conversion report lists every v1 file and where it went), lint clean, old folders removed only after confirmation.
12. A forced failure mid-conversion restores the workspace from backup.
13. A wiki produced by the updated skill pack (`PLUGIN-WIKI-MIGRATION.md`) opens in the app without conversion and passes the conformance check.
14. "Export as a single file" excludes private articles by default.
15. No em dashes in UI strings or generated files. CI green on all three platforms, including the official lint job.

---

## 9. Open items (owner: Shahed)

| # | Item | Needed before |
|---|---|---|
| 1 | Approve `WIKI-FORMAT-SPEC.md` as format version 1 and commit it to `pifpof/positioningHQ` as `docs/wiki-format.md` | Phase 1 |
| 2 | Confirm the article slugs in spec section 6 (they become a public contract) | Phase 1 |
| 3 | Decide whether to tell llm-wiki's maintainer (nvk) about PositioningHQ as a compatible producer; a mention in their README would be useful distribution | After v2 |
| 4 | Pick the non-Anthropic model for acceptance test 10 | Phase 8 |

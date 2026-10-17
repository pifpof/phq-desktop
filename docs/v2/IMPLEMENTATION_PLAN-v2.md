# PositioningHQ Desktop: v2 Implementation Plan

**Date:** 2026-10-17
**Reads with:** `REQUIREMENTS-v2.md`, `WIKI-FORMAT-SPEC.md` (the format contract), `CLAUDE.md` (updated rules)
**Starts from:** the implemented v1.
**Size:** about **52 focused hours**, in three milestones:

- **Milestone A, "Speaks llm-wiki" (Phases 0 to 4, about 22 hours):** format library, conformance checking, state moved out of the wiki, ingest into `raw/`.
- **Milestone B, "Articles, not documents" (Phases 5 to 8, about 21 hours):** structured article output, rewired tasks, deterministic playbook assembly, new views, index-first chat.
- **Milestone C, "Bring v1 users along" (Phases 9 and 10, about 9 hours):** v1 migration, acceptance and cross-tool tests.

Ship nothing to other users until Milestone C is done: a v2 app without migration would strand v1 workspaces.

Work phase by phase. Each phase ends with a **Done when** check and a commit.

---

## Phase 0: Verify assumptions (about 3 hours)

The v2 docs were written from the v1 spec, without reading the v1 code. Check before building:

1. Compare the actual v1 workspace layout, task IDs, output paths and front matter in the repo against `REQUIREMENTS-v1.md` section 5 and 3.1. Write any differences into `docs/v2-assumptions.md` and adjust the migration table (REQUIREMENTS-v2 section 2) to the real layout.
2. Install llm-wiki v0.25.x locally (`git clone https://github.com/nvk/llm-wiki` at the latest v0.25 tag; the lint helper is `scripts/llm-wiki`, Python 3). Pin the exact tag in `docs/v2-assumptions.md`.
3. Hand-write a tiny PositioningHQ wiki following `WIKI-FORMAT-SPEC.md` (two raw files, three articles, one output, all root files) in `tests/fixtures/phq-wiki-min/`. Run `scripts/llm-wiki lint --fail-on warning tests/fixtures/phq-wiki-min`. Fix the spec where lint disagrees, in particular:
   - Is `format_version` in `config.md` front matter accepted, or should it move to the body?
   - Is `README.md` at the root accepted (the C12 allowlist says yes)?
   - Are `sources` in `output/` front matter fine (C12 skips `output/`)?
   - Does lint accept our tags and the `**Category term:**` body line (it should; bodies aren't schema-checked)?
4. Record every spec change in the spec's own file and tell Shahed before Phase 1 (the spec is shared with the skill pack).

**Done when:** the minimal fixture passes the official lint with zero warnings, and `docs/v2-assumptions.md` lists the real v1 layout.

---

## New source layout (additions to v1)

```
docs/
├── wiki-format.md                  vendored WIKI-FORMAT-SPEC.md (from the skill-pack repo)
└── v2-assumptions.md
src/
├── shared/
│   └── wiki-types.ts               RawFrontMatter, ArticleFrontMatter, OutputFrontMatter (zod), Category, RawType
├── main/
│   ├── wiki/
│   │   ├── article-map.ts          spec section 6 as data: slug pattern -> category, volatility, template, producing task
│   │   ├── paths.ts                slugify, raw file naming, output versioning, safe joins inside the wiki root
│   │   ├── frontmatter.ts          read/write with gray-matter; spec key whitelist; quoting of paths with spaces
│   │   ├── links.ts                two-form link builder; parser for both forms; backlink scan
│   │   ├── confidence.ts           spec 4.3 rule
│   │   ├── index-gen.ts            _index.md per folder + master index (stats, Start here, navigation)
│   │   ├── log.ts                  append-only log.md writer (open for append, never rewrite)
│   │   ├── templates/              README.md, schema.md, config.md, empty-wiki skeleton
│   │   ├── conformance.ts          C1, C2, C3, C4, C4b, C11, C12, C18 + spec 12.2 to 12.5
│   │   └── hub.ts                  llm-wiki hub detection and opt-in registration
│   ├── state/
│   │   └── app-state.ts            userData/workspaces/<id>/ (moved from .positioninghq/)
│   ├── ingest/
│   │   ├── website-to-raw.ts       crawler output -> raw/articles
│   │   ├── files-to-raw.ts         inbox/ -> raw/papers|data|notes, originals to inbox/.processed
│   │   └── citations-to-raw.ts     provider citations and fetched pages -> raw/articles
│   ├── research/
│   │   ├── article-output.ts       output tool schema + validation pipeline (REQ-v2 3.2)
│   │   ├── assemble-playbook.ts    deterministic T20
│   │   └── decisions.ts            decision article writer + per-task decision lookup
│   ├── export/
│   │   ├── single-file.ts
│   │   └── zip.ts
│   └── migrate/
│       ├── detect-v1.ts
│       ├── backup.ts
│       ├── convert.ts              deterministic conversion (REQ-v2 6.2)
│       ├── split-playbook.ts       REQ-v2 6.3
│       └── report.ts               conversion report: every v1 file -> where it went
└── renderer/src/features/
    ├── training-data/              Knowledge and Sources tabs, ArticleView with badges and backlinks
    ├── playbook/                   + Reassemble, section -> source article links
    ├── decisions/                  RecordDecisionDialog
    ├── use-wiki/                   UseYourWiki view, exports, hub, health
    └── migrate/                    MigrationWizard
tests/
├── fixtures/phq-wiki-min/          hand-written spec fixture (Phase 0)
├── fixtures/phq-wiki-generated/    produced by the pipeline with the fake provider (Phase 6), committed
└── unit/
    ├── frontmatter.test.ts  links.test.ts  index-gen.test.ts  confidence.test.ts
    ├── conformance.test.ts         runs against llm-wiki's own defect fixtures where applicable
    ├── article-output.test.ts      validation pipeline cases
    ├── isolation.test.ts           updated: walks source chains via the private tag
    ├── assemble.test.ts            golden-file test for the playbook
    └── migrate.test.ts             v1 fixture -> v2, report completeness, failure restore
.github/workflows/build.yml         + job "llm-wiki-lint": Python, pinned llm-wiki tag, lint fixtures
```

---

# Milestone A: Speaks llm-wiki

## Phase 1: Format library (about 5 hours)

1. `wiki-types.ts`: zod schemas for raw, article and output front matter exactly as spec section 4; `Category = concept | topic | reference`; `RawType = articles | papers | repos | notes | data`.
2. `article-map.ts`: every slug and slug pattern from spec section 6 with its category, default volatility, the skill-pack asset file used as its section template, and the producing task.
3. `frontmatter.ts`: write only whitelisted keys, in a stable order; block-list YAML for `sources`; quote paths with spaces; dates as `YYYY-MM-DD`.
4. `links.ts`: `link(slug)` returns `[[slug|Title]] ([Title](relative/path.md))` with the relative path computed from the linking file; a parser that finds both forms; `backlinks(slug)`.
5. `confidence.ts`: spec 4.3 from the article's resolved sources (first-party = `own-site` or `private`).
6. `index-gen.ts`: folder indexes and the master index (spec section 5). Pure function of front matter; deterministic output (sorted) so git diffs stay small.
7. `log.ts`: `appendLog(op, text)` with `fs.appendFile`, spec 11 format.
8. `templates/`: `README.md` (spec 9, with the query-lite reading rules), `schema.md` (spec 7, `schema_state: advisory`), `config.md`, and `createSkeleton(root, profile)` that builds the full spec layout with indexes and an `init` log line.

**Done when:** unit tests pass; `createSkeleton` on an empty folder plus two fake articles passes the official lint.

## Phase 2: Conformance (about 4 hours)

1. `conformance.ts`: implement C1, C2, C3, C4, C4b, C11, C12, C18 as described in llm-wiki's `references/linting.md` (v0.25.x), plus spec 12.2 to 12.5. Return findings with severity, path and a fix hint.
2. Mechanical auto-fixes only (REQ-v2 section 5).
3. Copy llm-wiki's defect fixtures that apply (`bad-frontmatter`, `broken-link`, `dangling-source-ref`, `missing-index`, `missing-sources`, `misplaced-file`, `unknown-file`, `stale-index`) into `tests/fixtures/llm-wiki-defects/` (MIT, keep the licence note) and assert our checker flags the same defect class.
4. CI job `llm-wiki-lint`: set up Python, clone llm-wiki at the pinned tag, run `scripts/llm-wiki lint --fail-on warning` on `phq-wiki-min` (and later `phq-wiki-generated`).
5. IPC: `wiki:check`, `wiki:fix`.

**Done when:** our checker and the official lint agree on all copied defect fixtures and on the clean fixture.

## Phase 3: App state out of the wiki; detection; hub (about 4 hours)

1. `app-state.ts`: `userData/workspaces/<id>/` holding `workspace.json`, `profile.json`, `runs/`, `chats/`, `provenance.json`. Update every v1 reader and writer of `.positioninghq/` to use it.
2. Workspace ID in `config.md` body ("Workspace ID: <uuid>" under a "PositioningHQ" heading).
3. Opening a wiki with no local state: create state, rebuild the profile from `wiki/references/company-profile.md`.
4. Detection per REQ-v2 2.2 (extend v1 `detect.ts`), including the format-version gate and read-only mode.
5. `hub.ts`: read `~/.config/llm-wiki/config.json`, expand only a leading `~` in `hub_path`, verify `wikis.json` is readable; "Create inside my llm-wiki hub" option in the workspace step; on consent, add `{ "path": "topics/<slug>", "description": ... }` to `wikis.json` (atomic write, preserve all other content and formatting) and append one hub `log.md` line.
6. New-workspace path now calls `createSkeleton` instead of the v1 layout.

**Done when:** a new workspace is lint-clean before any research; opening the same folder after deleting app state works; the hub option appears only when a hub exists and registers correctly.

## Phase 4: Ingest into raw (about 6 hours)

1. `website-to-raw.ts`: v1 crawler output becomes raw files (spec 4.1) with `own-site` and page-type tags. The crawl index data (headings, social links) is kept in the run state, not as a file.
2. `files-to-raw.ts`: onboarding and Training Data "Add files" copy into `inbox/`; extraction (v1 extractors) writes `raw/papers|data|notes/YYYY-MM-DD-<slug>.md` with `private` + category tag; the copy moves to `inbox/.processed/` (append `-2`, `-3` on name clashes).
3. `citations-to-raw.ts`: after each web task, collect citations (`url`, `title`, `cited_text`) and any fetched documents from the provider response; one raw file per URL per run (REQ-v2 3.1); return the URL-to-path map for the task's article `sources`.
4. Update the provider's `runTask` result to expose fetched-document text (web fetch results) alongside citations.
5. Indexes and log after each ingest.

**Done when:** a research run up to the end of Stage 1 leaves a lint-clean wiki whose `raw/` contains own-site pages, private user files and citation records.

---

# Milestone B: Articles, not documents

## Phase 5: Structured article output (about 5 hours)

1. `article-output.ts`: the output tool schema (`articles: [{ slug, category, title, summary, aliases, tags, confidence, body, sources }]`) and the seven-step validation pipeline from REQ-v2 3.2. One automatic retry with the validation errors in the message; then write what's valid and mark the task "done with warnings".
2. Prompt builder: inputs wrapped as `<document path="...">`; the allowed slugs for the task (from `article-map.ts`); the section template from the skill-pack asset file; the spec's body shape; "cite only the paths you were given"; decisions that touch the task's slugs (from `decisions.ts`).
3. Provider: force the output tool (or use the provider's structured-output mode), handle `pause_turn` as in v1. Web tasks keep server tools plus the output tool.
4. Update `CLAUDE.md` rule 13 wording (done in the delivered `CLAUDE.md`): schema-only output tools are allowed.
5. `provenance.json` entry per written file.

**Done when:** `article-output.test.ts` covers wrong slug, wrong category, invented source path, missing private tag, model-written Sources section replaced, broken link kept as text.

## Phase 6: Rewire the tasks (about 7 hours)

1. Update every task definition to the REQ-v2 3.3 mapping: inputs become raw paths and article slugs; outputs become article slugs (validated against `article-map.ts`).
2. Isolation: compute each input's "private" status from tags and source chains; `isolation.test.ts` walks the DAG and the article map and fails if any web task can receive private material.
3. `assemble-playbook.ts` (T20): deterministic, golden-file tested; competitor names replaced from the `**Category term:**` line; front matter per spec 4.5; versioned file name.
4. T21 messaging analysis: inputs are now `current-messaging`, `social-taglines`, the positioning articles and private files (no web tools, unchanged); output to `output/messaging-analysis-v<N>-<date>.md` with `sources` listing articles. Keep its scorecard JSON block.
5. Onboarding writes `wiki/references/company-profile.md`.
6. After the run: regenerate all indexes, append the run summary to `log.md`, run conformance, store the result.
7. Generate `tests/fixtures/phq-wiki-generated/` with the fake provider and add it to the CI lint job.

**Done when:** a real run for Parallel79 produces every spec section 6 article the pipeline owns, a playbook v1 output and a messaging analysis output, and the official lint passes with zero warnings.

## Phase 7: Views and decisions (about 6 hours)

1. Training Data: Knowledge and Sources tabs (REQ-v2 4.1); `ArticleView` with confidence, volatility, verified and private badges, Sources (opens raw in-app), Linked from (backlinks), actions.
2. Playbook view: latest output; section links to source articles; **Reassemble** (calls T20 only) and **Re-run playbook research**.
3. Decisions: `RecordDecisionDialog` from a chat reply and from a playbook section; preview the article; write it; log it; mark affected articles in the UI.
4. Use your wiki view (REQ-v2 4.5): copy-ready prompts, single-file export (private excluded by default with a warning toggle), zip export, Obsidian open, hub registration, health panel with `wiki:check` results.

**Done when:** acceptance criteria 6, 7 and 14 pass.

## Phase 8: Index-first chat (about 3 hours)

1. Workspace mode system prompt: README reading rules + master index + Start here articles (cached).
2. Per question: score articles by title, alias and summary overlap with the question (simple token match plus alias exact match; no embeddings in v2); load the top 6; include raw sources only when the user asks for evidence.
3. Render wiki-path citations as links; "Answered from" line.

**Done when:** acceptance criterion 8 passes and token use per question is logged and lower than v1's whole-document grounding on the same questions.

---

# Milestone C: Bring v1 users along

## Phase 9: v1 migration (about 6 hours)

1. `detect-v1.ts`: v1 app workspace and old skill-pack vault (REQ-v2 2.2).
2. `backup.ts`: zip to `userData/backups/`, then re-open and verify entry count and sizes before continuing.
3. `convert.ts`: the REQ-v2 6.2 transformations, using the real v1 layout recorded in Phase 0.
4. `split-playbook.ts`: deterministic split by H2; value-driver and moat headings parsed; AI fallback (no web tools) with the Phase 5 output schema.
5. `report.ts`: every v1 file listed with its destination or "not carried over" and why; saved to the app-state folder and shown at the end.
6. `MigrationWizard`: explain, backup, choose Convert or Rebuild, progress, conformance result, removal prompt (or move to `inbox/.unknown/v1-legacy/`).
7. Failure handling: on any error, restore from the backup and show the error.
8. `migrate.test.ts` with a v1 fixture built from the real v1 output (copy one of Shahed's test workspaces with fake company data).

**Done when:** acceptance criteria 11 and 12 pass on a real v1 workspace.

## Phase 10: Acceptance and cross-tool checks (about 3 hours)

1. Run all 15 REQ-v2 acceptance criteria; record in `docs/v2-acceptance.md`.
2. Cross-tool: Claude Code with the llm-wiki plugin via hub registration (`/wiki:query`), and one non-Anthropic model given only the folder and "read README.md first" (criterion 10).
3. Skill-pack compatibility (criterion 13): requires the plugin change in `PLUGIN-WIKI-MIGRATION.md`; if it isn't done yet, test with the hand-written fixture and mark the criterion pending.
4. Sweeps: em dashes, keys and private content in logs, isolation test, CI green.
5. Tag `v0.2.0`.

---

## Timeline

| Block | Phases | Hours (approx.) |
|---|---|---|
| Milestone A | 0 to 4 | 22 |
| Milestone B | 5 to 8 | 21 |
| Milestone C | 9 and 10 | 9 |

If time runs short, cut in this order: hub registration, Obsidian button, zip export (keep single-file), backlinks panel, AI fallback in the playbook split (show "couldn't split, re-run research" instead). Never cut: backup before migration, conformance in CI, the private-tag isolation test, deterministic assembly.

---

## Risks

| Risk | Mitigation |
|---|---|
| llm-wiki changes its format (five releases in about six weeks) | Pin the tag; CI lint job against the pinned version; upgrade deliberately; the spec's `format_version` handles our side |
| Models produce slugs or categories outside the map | Validation and one retry; unknown slugs never reach disk |
| Models cite paths they weren't given | Paths outside the task's inputs and citation records are dropped; confidence falls to low |
| Migration loses user content | Verified backup first; conversion report accounts for every file; automatic restore on failure; nothing deleted without consent |
| Spec and skill pack drift apart | Spec lives in the skill-pack repo; the app vendors it; acceptance criterion 13 tests a skill-pack wiki in the app |
| Unknown-key warnings from llm-wiki lint | Front matter whitelist; generator details kept in `provenance.json` and `log.md` |
| Atomic articles cost more tokens than one big document | Shared context cached; deterministic assembly removes one model call per playbook; index-first chat cuts per-question tokens |

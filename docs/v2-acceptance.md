# v2 acceptance (REQUIREMENTS-v2 section 8)

Date: 2026-10-17. App 0.2.0. llm-wiki pinned at v0.25.1. Live checks on Shahed's Mac with his Anthropic key, on **Claude Haiku 5.5** to keep costs down (Shahed's instruction); Sonnet is the app's default.

## The run

A fresh research run for Parallel79 (https://www.parallel79.com) with one private file added:

| | |
|---|---|
| Result | 30 of 30 tasks done |
| Time | 7.1 minutes |
| Cost | $0.77 (Haiku) |
| Wiki | 26 articles, 52 raw sources, playbook v1, messaging analysis v1 |
| Official lint (`--fail-on warning`) | exit 0: 0 critical, 0 warnings, 2 suggestions (uncited raw files) |
| App conformance check | ok: 0 critical, 0 warnings |
| Key in any file (workspace, app data, log) | 0 |
| Em dashes outside code blocks (98 files) | 0 |

## Criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | New run passes official lint; app check agrees | **Pass** | See the run. |
| 2 | Every spec section 6 article the pipeline owns exists; front matter valid; two-form links; Start here resolves | **Pass** | All 17 fixed slugs, 3 value drivers, 2 moats, 4 competitors. No S12.5 (link form) or S5 (master index) findings. |
| 3 | Sources resolve to raw files; web-sourced articles cite a citation record or fetched page | **Pass** | 0 dangling sources. Every web article cites a web citation, own-site or competitor page. |
| 4 | Articles built from user files are tagged private; isolation test passes on the full DAG | **Pass** | 10 private articles, 0 articles citing a private file untagged. Graph test (`dag.test.ts`) and runtime refusal test (`executor.test.ts`) pass. |
| 5 | Playbook assembled with no model call, cites articles, uses category terms | **Pass** | `output/positioning-playbook-v1` cites 11 articles; no competitor names left in its prose. Golden-file test in `assemble-playbook.test.ts`. |
| 6 | Edit `positioning-statement.md` outside the app, Reassemble: v(N+1) with the edit, $0 | **Pass** | v2 contains the edit; spend unchanged. |
| 7 | Decision from chat creates a valid decision article; a playbook re-run does not contradict it | **Pass** | Decision "Lead with privacy, not price" recorded; positioning statement re-run ($0.01) builds a privacy-led version, says "Never lead with low price or discounts" and links the decision. |
| 8 | Chat answers "Who is our ICP?" citing the ICP article, loading at most 6 articles for the question | **Pass** | Cited `wiki/topics/ideal-customer-profile.md`; grounded in the 5 Start here articles plus 1 for the question. About 13,700 prompt tokens, against about 17,900 for v1-style whole-document grounding on the same wiki. |
| 9 | Claude Code with the llm-wiki plugin answers `/wiki:query` via hub registration, citing the article | **Partly verified** | Approximated: Claude (Haiku) following llm-wiki's own query-lite protocol (`profiles/query-lite/SKILL.md`) from a hub with the wiki registered read config, hub index, `wikis.json`, the wiki index and the positioning statement, and cited it. **Pending:** the real Claude Code plugin check (installing the plugin changes Shahed's Claude Code setup, so it is his to run). |
| 10 | A model with no PositioningHQ knowledge, given the folder and "read README.md first", answers three questions with correct citations (Claude and one non-Anthropic model) | **Pass for Claude; non-Anthropic pending** | Claude (Haiku) with only list/read tools read README.md first, then `_index.md`, and cited the positioning statement, ICP, competitive landscape and three competitor articles; every cited file exists. The non-Anthropic model is open item 4 (Shahed to pick). |
| 11 | A real v1 workspace converts: backup verified, every v1 file accounted for, lint clean, old folders removed only after confirmation | **Pass** | Real v1 workspace (Plausible Analytics) through the wizard: backup zip written and checked; 67 of 67 v1 files in the report (64 carried over, 3 not needed); 26 articles; official lint exit 0 after "Remove them". |
| 12 | A forced failure mid-conversion restores the workspace from backup | **Pass (test)** | `migrate.test.ts`: failure injected while splitting the playbook; the folder's contents hash identical afterwards and it is detected as v1 again. Interrupted conversions are restored at the next start. |
| 13 | A wiki made by the updated skill pack opens without conversion and passes the check | **Pending (skill pack)** | The skill-pack change is not done yet. With the hand-written spec fixture: opens without conversion, passes the check, profile rebuilt from its company profile article (`workspace.test.ts`). |
| 14 | Single-file export excludes private articles by default | **Pass** | 17 articles exported, all 10 private ones left out. |
| 15 | No em dashes in UI strings or generated files; CI green on all three platforms including the lint job | **Pass** | No em dashes in `src/` UI strings or in any generated file. CI green on macOS, Windows and Linux plus the llm-wiki lint job (github.com/pifpof/phq-desktop, run 39132798888, commit 84dccd0). The first runs found a too-small app icon, implicit publishing in electron-builder, and CRLF checkouts on Windows; all fixed. |

## Problems the live runs found and fixed

- The model refuses forced tool use (`tool_choice` "tool"/"any"). The output tool is now offered, never forced, with one follow-up if a task finishes without calling it.
- Models sometimes listed no sources. The schema now requires one; when none resolve, an article cites the pages its task cited or fetched (else the pages its searches returned, recorded as such), or the documents it was given.
- Fan-out receipts were outside their group's folder, so the competitive analysis and playbook section 6 saw no competitor articles.
- Links to a bare slug (`[x](competitor-y)`) were not converted to two-form links.
- Playbook version dates showed the previous day.
- A wiki written by another tool could not have its profile read back when labels were not bold.

## Spend on v2 testing

About $4.70 in all: $2.69 on the first Sonnet run (stopped by the forced-tool problem), the rest on Haiku (full runs $0.70 and $0.77, re-runs and checks about $0.55).

## Open

1. Real Claude Code plugin check for criterion 9 (Shahed).
2. A non-Anthropic model for criterion 10 (open item 4).
3. The skill-pack change (`PLUGIN-WIKI-MIGRATION.md`) for criterion 13.
4. From v1, still open: real sign-up and community URLs (`src/shared/links.ts`).

# v2 assumptions, checked (Phase 0)

Date: 2026-10-17. Checked against the v1 code at `v0.1.0` (commit `ec0678c`) and llm-wiki at the pinned tag below.

## 1. llm-wiki pin

- Repository: `https://github.com/nvk/llm-wiki`
- Tag: **`v0.25.1`**, commit `95a042c68998559305bc69ac8c482c4e1a415ad3`
- Lint helper: `scripts/llm-wiki lint --fail-on warning <wiki>` (Python 3.9 or newer, standard library only)
- `LLM_WIKI_TODAY=YYYY-MM-DD` fixes "today" for the freshness check. CI must set it to the fixture's date, or the fixture fails once its hot articles are 30 days old (see 3.2).

## 2. The real v1 layout

The v2 migration table (REQUIREMENTS-v2 section 2) was written from the v1 spec. The real v1 workspace differs in these places. Migration (Phase 9) uses this list, not the table.

| What | Real v1 path | Notes for migration |
|---|---|---|
| Vault config | `vault.config.md` | as the table says |
| App state | `.positioninghq/workspace.json`, `profile.json`, `runs/<run-id>.json`, `chats/<chat-id>.json` | as the table says |
| User files | `inputs/<category>/<file>` | Categories keep spaces: `sales collateral`, `customer references`, `company strategy`; and hyphens: `competitive-intel`, `roadmap`, `help-docs`. Tag = category with spaces turned into hyphens. |
| Extracted text | `memory/research/inputs-extracted/<category>/<file>.md` plus `index.md` | `index.md` is a status table, not content. Not carried over. |
| Company profile | `memory/company-profile.md` (rendered from `profile.json`) | regenerate from `profile.json` |
| Website crawl | `memory/research/website/pages/<slug>.md` plus `index.md` | Page front matter has `url`, `title`, `description`, `og_*`, `word_count`, `sources: [url]`. `source` comes from `url`. |
| Social profiles (T3) | `memory/research/social-profiles.md` | **Not in the table.** The list of profile URLs. Becomes a `legacy` raw note (it feeds `social-taglines`). |
| Social taglines (T8) | `memory/research/social-taglines.md` | as the table says |
| Competitor list | `memory/research/competitors.md` | as the table says |
| Competitor profiles | `memory/research/competitors/<Safe Name>.md` | **File names keep the display name** (spaces, capitals), so the slug must be derived: `competitor-<slugify(name)>`. |
| Public proof | `memory/research/proof-public.md` | as the table says |
| Research steps | `memory/company-research/steps/01-company-overview.md`, `02-product-analysis.md`, `03-market-segment.md`, `04-customer-segment.md`, `05-strengths.md`, `06-weaknesses.md`, `07-recent-developments.md`, `08-competitive-analysis.md`, `09-synthesis.md` | step 02 is `product-analysis`, not `product` |
| Assembled company research | `memory/company-research/<Company>.md` | not kept (the articles replace it) |
| Playbook sections | `memory/positioning-playbook/sections/01-market-overview.md`, `02-target-customers.md`, `03-value-drivers.md`, `04-distinct-advantages.md`, `05-positioning-statement.md`, `06-competitive-intelligence.md`, `07-customer-proof-points.md` | **Not in the table.** v1 keeps each section as its own file. The playbook split (REQ-v2 6.3) reads these directly, so only sections 03 and 04 need splitting inside the file. Fall back to splitting the assembled playbook by H2 only if the section files are missing. |
| Playbook, current | `memory/positioning-playbook/<Company>.md` | a copy of the latest version |
| Playbook versions | `memory/positioning-playbook/versions/<Company>-v<N>-<YYYY-MM-DD>.md` | copy each to `output/positioning-playbook-v<N>-<date>.md` |
| Messaging analysis | `memory/messaging-analysis/<Company>.md` | **No versions in v1.** One file, overwritten by each run. Becomes `output/messaging-analysis-v1-<date of its created>.md`. |
| Deliverable folders | `outputs/battlecards/`, `outputs/call-plans/`, `outputs/launch/` | always empty in v1 |
| Obsidian | `.obsidian/` (created by Obsidian when the user opens the vault) | keep; allowed at the wiki root |

v1 document front matter (all generated files): `title`, `task`, `run_id`, `created` (ISO date-time), `status`, `sources` (URLs). Generator keys (`task`, `run_id`, `status`) move to `provenance.json`, never into the wiki.

v1 task IDs, mapped to the REQ-v2 T numbers:

| T | v1 task ID |
|---|---|
| T1 | `crawl-website` |
| T2 | `extract-input-files` |
| T3 | `find-social-profiles` |
| T4 | `research-02-product`, `research-03-market-segment`, `research-04-customer-segment`, `research-05-strengths`, `research-06-weaknesses`, `research-07-recent-developments` |
| T5 | `competitor-discovery` |
| T6 | `website-positioning` |
| T7 | `research-01-overview` |
| T8 | `social-taglines` |
| T9 | `competitor-profiles` (fan-out: `competitor-profiles:<slug>`) |
| T10 | `proof-gathering` |
| T11 | `research-08-competitive` |
| T12 | `research-09-synthesis` (then the local step `assemble-company-research`) |
| T13 to T19 | `playbook-01-market`, `playbook-02-icp`, `playbook-06-competitive`, `playbook-07-proof`, `playbook-03-value`, `playbook-04-moat`, `playbook-05-statement` |
| T20 | `playbook-assemble` |
| T21 | `messaging-analysis` |

## 3. What the official lint actually checks

The local `scripts/llm-wiki lint` implements fewer checks than `references/linting.md` describes. What it does, at v0.25.1:

| Check | Severity | Notes |
|---|---|---|
| Master `_index.md`, `config.md` exist | critical | |
| `raw/{articles,papers,repos,notes,data}`, `wiki/{concepts,topics,references,theses}`, `output` exist with `_index.md` | critical | **`raw/repos/` and `wiki/theses/` are required even though we never use them.** |
| `inbox/` exists | warning | |
| `schema.md` exists | info | |
| Unknown entries at the root, in `raw/`, `wiki/`, and non-`.md` files in their subfolders | warning | `README.md` is allowed at the root. `inbox/` may hold anything. |
| Front matter present and terminated in every `.md` under `raw/` and `wiki/` | critical | `config.md` and `_index.md` are skipped; `output/`, root files and `inbox/` aren't schema-checked at all |
| Raw: `title`, `source`, `type`, `ingested`, `tags`, `summary` non-empty; `type` enum | critical | |
| Wiki: `title`, `category`, `created`, `updated`, `tags`, `summary` non-empty; `category` enum | critical | |
| `confidence`, `volatility` enums | warning | |
| `tags` is a non-empty list | warning | |
| Placement: raw `type` and wiki `category` match the folder | critical | |
| Each folder index links every `.md` in the folder; no dead links in any index | warning | Under `raw/`, `wiki/`, `output/`. `raw/_index.md` and `wiki/_index.md` must link each category `_index.md`. The master index is not checked. |
| Every local `.md` link in a wiki article resolves | warning | `[[wikilinks]]` are not checked |
| Wiki `sources` resolve to files, or `compiled-from` is `conversation` or `mixed` | warning | relative to the wiki root; slug fallback if exact path fails |
| A raw file's `source`, when it looks like a local path, exists | warning | "Looks like a path": contains `/`, no spaces, no URL scheme |
| Near-duplicate tags (`ml`/`machine-learning`, `ai`/`artificial-intelligence`, `llm`/`llms`) | warning | |
| Raw file cited by no article | suggestion | does not fail `--fail-on warning` |
| Freshness: days since `verified` (or `updated`) over 30 (hot), 180 (warm), 365 (cold) | warning | see 3.2 |
| `output/projects/<slug>/WHY.md` | warning | |

Not implemented by the script (described in `linting.md` only): unknown front matter keys (C13), bidirectional See Also (C4), tag hygiene beyond the three pairs (C5), master index statistics (C3). The app's own checker still enforces See Also reciprocity and the key whitelist, since the agentic `/wiki:lint` reads `linting.md`.

### 3.1 The front matter parser

The script parses YAML line by line: `key: value`, inline lists `[a, b]`, and block lists whose items start with exactly two spaces and a dash (`  - item`). Folded or multi-line scalars (`>-`, `|`), which `js-yaml` emits for long strings, are not understood. **The app must write front matter with its own serializer: one line per scalar, quoted strings, `  - ` block lists.** gray-matter's `stringify` is not safe for this.

### 3.2 Freshness

`--fail-on warning` fails once a `hot` article is more than 30 days past its `verified` date. Hot articles in our map: `recent-developments`, `competitive-landscape`, `current-messaging`, `competitor-*`, `social-taglines`. So a wiki passes lint clean right after a run and starts warning a month later. That is the intended signal ("refresh this"), not a defect. Consequences:

- Acceptance criterion 1 holds on the day of a run.
- CI lints fixtures with `LLM_WIKI_TODAY` set to the fixture date.
- The app's conformance view shows freshness separately ("3 articles need a refresh"), not as a format failure.

## 4. Spec questions from the plan, answered

| Question | Answer |
|---|---|
| Is `format_version` in `config.md` front matter accepted? | Yes. `config.md` front matter isn't schema-checked. Keep it there. |
| Is `README.md` at the root accepted? | Yes, it is in the root allowlist. |
| Are `sources` in `output/` front matter fine? | Yes. `output/` isn't schema-checked; only its index is. |
| Does lint accept our tags and the `**Category term:**` body line? | Yes. Tags are free-form; bodies aren't checked. |

## 5. Spec changes made (WIKI-FORMAT-SPEC.md, still format version 1)

1. **Layout:** `raw/repos/` and `wiki/theses/` added, each with an `_index.md`, kept empty. Lint fails without them.
2. **User-file raw sources:** `source` is `inbox/.processed/<original file name>`. Lint checks that path exists, so the original must stay there.
3. **Front matter syntax:** single-line scalars, double-quoted strings, block lists indented two spaces. No folded or multi-line YAML.
4. **See Also:** must be reciprocal (llm-wiki C4). Generators write See Also; the tool adds the missing back-links.
5. **Conformance 12.1:** clean at the time of generation. Freshness warnings that appear later as articles age are expected and mean "refresh", not "invalid".

## 6. Fixture

`tests/fixtures/phq-wiki-min/`: all root files, 2 raw files (one own-site page, one private user file), 4 articles (concept, topic, two references including a `compiled-from: conversation` profile and a competitor with a category term), 1 output. Result at v0.25.1 with `LLM_WIKI_TODAY=2026-10-17`: **0 critical, 0 warnings, 0 suggestions, 0 info.**

## 7. Other notes

- `PLUGIN-WIKI-MIGRATION.md` and the updated `CLAUDE.md` mentioned by the v2 docs were not in `docs/v2/`. `CLAUDE.md` is updated as part of v2 here; the plugin migration is out of scope for this repo.
- The two real v1 QA workspaces from the v1 acceptance run (Parallel79, Plausible) are still in the session scratch folder. Phase 9 builds its v1 fixture from a copy of one of them, with the company data replaced by fake data. `~/Documents/positioning-qa` is never modified.

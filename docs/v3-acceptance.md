# v3 acceptance (REQUIREMENTS-v3 section 6)

Date: 2026-10-18. App 0.3.0. Checked on Shahed's Mac against the Parallel79 test wiki from the v2 acceptance run (26 articles, 52 sources), with Playwright driving the built app, plus unit tests. No model calls: v3 changes the app, not the wiki.

## Changes from Shahed's review after Phase 3 (2026-10-18)

- **All section headings start collapsed.** Parents inside a section (Value Drivers, Moats, Decisions, Competitor Profiles) start expanded once their section is open.
- **No sources in the article tree.** The "N sources" count and the inline source list (REQUIREMENTS-v3 3.3 third row, 3.4) are removed. An article's sources stay at the end of the article, ordered as 3.4 says (first-party first, then social, competitor sites, web citations, legacy; newest first), with a kind icon, a lock for private files and "Missing: path" for files that are gone.
- **A real tooltip with help text** on every row, shown on hover and on keyboard focus: what the article or section is for (help text in the article map), the article's summary, each marker with what to do about it, and how to use the row.
- Following from the above, the Sources tab lists sources without a Cited by count toggle; each uncited source says "Not cited", and the Cited by list is in the source reader.

## Criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | No "Training Data" in UI strings; sidebar, pane and tabs read Wiki, Articles, Sources | **Pass** | `no-training-data-copy.test.ts` scans `src/`; screenshots. |
| 2 | Parallel79 wiki matches the 3.1 structure and order; Competitor Profiles is a collapsible parent | **Pass** | Printed tree and screenshots: Positioning (Statement, Value Drivers with 3, Moats with 2, Proof Points, Decisions), Customers, Competitors (Landscape, Competitor Profiles with 4, A to Z), Messaging today, Market (Why Now, Market Segment, Research Summary), Your company (Company Profile "What you told us", then 5). Golden test on the generated fixture in `wiki-tree.test.ts`. |
| 3 | No child label keeps its type prefix; no label truncates without a tooltip | **Pass** | Prefixes stripped (`stripPrefix` tests; none left on the Parallel79 wiki). Labels wrap to two lines, then ellipsis; every row has the tooltip with the full title. |
| 4 | Headings collapse and expand; state survives a restart; Expand all and Collapse all; Alt-click toggles all | **Pass** | Live: Positioning expanded, app quit and relaunched, Positioning expanded and the rest collapsed. Menu and Option-click checked live; row tests. |
| 5 | An article's sources are listed per 3.4; opening one shows a working Cited by | **Pass (as changed)** | Sources at the end of the article, ordered per 3.4 (live on the ICP article: own-site pages first). Opening a source shows Cited by with links back (live, BCG X citation: BCG X, Competitive Landscape, Positioning Statement). |
| 6 | Low confidence marker; touching a source shows Out of date; a collapsed section shows the amber dot | **Pass** | Live: touched a source of Customer Segment, which then read "Out of date: a source is newer"; Customers collapsed showed the dot. Changes made while an article's own run was going (citation records gain excerpts) don't count, so a fresh run is not flagged; see `wiki-tree.test.ts`. |
| 7 | A wiki without `moat-*` shows a dimmed placeholder under Moats with Generate | **Pass** | Live, with the moat articles moved aside: "Not generated yet" under Moats, dimmed, and its panel offers Generate (runs `playbook-04-moat`). |
| 8 | Searching a competitor's alias finds its profile and opens Competitor Profiles; clearing restores the state | **Pass** | Live: "McKinsey AI arm" (an alias) showed Competitors "1 of 5", Competitor Profiles, McKinsey QuantumBlack; Escape restored the previous expand state. |
| 9 | Fully keyboard operable; states announced correctly in VoiceOver | **Partly verified** | Arrows, Home, End, Enter, Space, type-ahead, Escape checked live. The accessibility tree reports role, level, expanded, position in set ("2 of 6") and the tooltip as description. **Pending:** a hands-on VoiceOver pass (Shahed). |
| 10 | A skill-pack wiki renders the same way; an unknown slug appears under Other | **Pass** | The hand-written spec fixture (`phq-wiki-min`) renders in the same sections with placeholders; unknown slugs go to Other, A to Z (`wiki-tree.test.ts`). |
| 11 | Sources tab: each source shows who cites it; an uncited user file shows "Not cited" | **Pass (as changed)** | "Not cited" under uncited sources (live: a BCG article citation); who cites it is in the tooltip and the reader. |
| 12 | Tree renders in under 100 ms for 200 articles and 1,000 sources | **Pass** | Live, with 180 synthetic competitors and 1,000 synthetic sources added for the test: Expand all drew 216 rows in 21 ms (Articles) and 1,062 rows in 55 ms (Sources). Building both trees in main: 18 ms for the real wiki; unit test under 100 ms for 200 and 1,000. |
| 13 | No em dashes in new UI strings; CI green | **Pass** | No em dash anywhere in `src/`. CI: see the run for the v0.3.0 commit. |

## Also fixed in v3

- The workspace watcher still watched the v1 folders (`memory/`, `inputs/`), so edits made outside the app to `raw/`, `wiki/` and `output/` never refreshed the app. It now watches the wiki folders.
- The scanner reads files in parallel and reuses unchanged files, so the trees rebuild quickly after each change.

## Open

1. A VoiceOver pass on the tree (criterion 9).
2. From v2: the real Claude Code plugin check, a non-Anthropic model test, the skill-pack change.
3. From v1: real sign-up and community URLs (`src/shared/links.ts`).

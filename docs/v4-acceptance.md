# v4 acceptance (REQUIREMENTS-v4 section 11)

Date: 2026-10-19. App 0.4.0. Checked against the Parallel79 test wiki with Playwright driving the built app, plus unit and pipeline tests (fake provider). One live run on **Claude Haiku 5.5** (Shahed's standing instruction to test on Haiku): adding key takeaways and gaps to the existing playbook, **under $0.01**.

## Live check (Haiku)

The test wiki's playbook was written before v4, so the page showed "Add key takeaways and gaps to this playbook." Add them opened the preview (six pages plus Distinct Advantages, estimate, no model call). Start ran one no-web call; the review opened by itself with before and after for the six articles and a playbook-only entry for Distinct Advantages. Keep wrote only the two new sections into each article, saved the Distinct Advantages pair in app state, logged `regenerate | key takeaways and gaps added to 6 pages`, and assembled playbook v3. The page then showed takeaways in every section, gap dots on the pills, the biggest gap on the overview and the messaging score chips. The official lint exited 0 at `--fail-on warning` (2 suggestions about uncited raw files, as before v4). No em dashes in the takeaways or gaps.

Haiku found a gap in all seven sections. For this wiki that is fair (thin evidence, low confidence, no client proof), but it is the model's judgement; see Decisions to review.

## Criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | No left table of contents; header, step pills with progress bar, content column and right panel | **Pass** | Screenshots at 1440px and 1000px (panel stacks below under 1100px; pills scroll and keep the current one in view). |
| 2 | Pill states (current, visited, not visited, gap); arrow keys; last step remembered | **Pass** | Screenshots; ArrowRight moved Value to Advantages; Home and End in `StepTabs`; visited and last step in `playbook-nav.json` (app state), per version. |
| 3 | Overview from front matter, no model call; missing pieces say "Not generated yet" | **Pass** | `playbook-view.test.ts` (overview with missing data returns nulls); screenshot. |
| 4 | Step count and reading time, takeaways box, lede, body, Back and Next | **Pass** | Screenshots; `playbook-view.test.ts` (lede taken without leaving an empty heading). |
| 5 | Expandable cards for value drivers, moats, competitors; first value driver open | **Pass** | Screenshots; competitor cards come from assembly (category terms only, decided 2026-10-19), so they show from the next assembled version. |
| 6 | Right panel: confidence, sources (filtered Sources tab), last changed, Open in Wiki, Make a change; copy and Ask Chat | **Pass** | Screenshots; `onlySources` test; Ask Chat pins the section's articles (`chats.test.ts`). |
| 7 | Gap box; score chip for mapped sections; biggest gap rule | **Pass** | Live screenshots (Differentiation 2 of 5 on Positioning); `biggestGap` tests for both rules. |
| 8 | Help plan; Ask for help opens the prefilled form, app sends nothing, no private text | **Pass** | Live screenshot of the sheet; `help.test.ts` (fragment holds personal details, private section text never in the link or copied details, length fallback). The page itself is not live yet (Open 1). |
| 9 | New runs produce takeaways for all seven sections and gaps only where justified; backfill through preview and review | **Pass** | Pipeline tests (fresh run; backfill keep and discard); live backfill above. |
| 10 | Takeaways and gaps in the assembled markdown; older versions still render | **Pass** | Golden file; `playbook-view.test.ts` renders a v2 output with doubled prefixes and no takeaways. |
| 11 | Value driver heading appears once | **Pass** | `assemble-playbook.test.ts` (also titles without a colon, as the fixture had). |
| 12 | Branded PDF: cover, overview, contents, sections, expanded cards, page numbers; private option works | **Pass** | Exported through the app: 33 pages, 34 live links (footer on every page plus the cover), DejaVu Serif and Inter embedded. With private material off: 16 pages, private sections and their overview pieces read "Private section omitted". |
| 13 | Lint clean after generation and backfill | **Pass** | `phq-wiki-generated` fixture (now with takeaways) and the live wiki after keep. |
| 14 | No em dashes in new UI strings or generated takeaways and gaps; CI green | **Pass** | None in `src/`; takeaways pass through `replaceEmDashes` and the pipeline test asserts it. CI: see the run for the v0.4.0 commit. |

## Problems found and fixed

- The value driver heading doubled because article titles already carry "Value Driver:" (and the test fixture's titles carried it with no colon).
- Zod 4 records keyed by an enum need every key, so the Distinct Advantages pair failed to load until the schema became a partial record.
- The takeaways check read `nextStep` while the model sends `next_step`, which forced a retry on every gap.
- Problem and Next step ran together in markdown viewers; they are now separate paragraphs.
- The PDF contents list spilled onto a third page; it now has its own page.

## Decisions to review

- **Competitor cards use category terms only**, one card per shared term (Shahed, 2026-10-19).
- **The backfill reads the section articles, not every raw source behind them.** Reading the sources would cost well over the $0.10 the banner promises; the articles already summarise and cite their evidence.
- **Regenerate playbook has its own small preview** (what runs, the estimate, a note about waiting changes) rather than the per-page v3.1 preview. A full re-run keeps to applied changes, as v3.1 decided.
- **The help link uses the URL fragment** for personal details and gaps, as REQUIREMENTS-v4 9 says (the implementation plan's "query parameters" is older wording). The onboarding email is never stored, so the link carries company and name only.
- **Gaps from private sections go as the section name only**, in the link and in Copy details.
- **"Gaps only where justified" depends on the model.** Haiku gave all seven sections a gap on a thin wiki. Worth watching on Sonnet with a fuller wiki.

## Open

1. The expert help page at `https://positioninghq.com/expert-help` must read the fragment fields (`company`, `name`, `email`, `sections`, `gaps`, `v`).
2. Confirm the scorecard mapping for the gap chip (Proof, Customer focus, Differentiation).
3. A VoiceOver pass on the tabs, cards and help sheet (keyboard checked; screen reader not run).
4. Carried over: the v2 plugin and non-Anthropic model checks, the v1 sign-up and community URLs.

**Skill pack (deferred to a future epic, decided 2026-10-19).** The skill-pack repo will be brought up to date with all the format changes in one go: the v3.1 change articles and Status line, the v4 Key takeaways and Gap to close sections (spec 6.6 addition) with single-prefix card headings, and the earlier v2 skill-pack change.

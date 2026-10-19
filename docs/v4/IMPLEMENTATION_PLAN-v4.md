# PositioningHQ Desktop: v4 Implementation Plan

**Date:** 2026-10-19
**Reads with:** `REQUIREMENTS-v4.md`, `WIKI-FORMAT-SPEC.md`, `CLAUDE.md`; design reference: the "Playbook Tabs Concepts" canvas, artboards B (tabs, overview) and C (takeaways, gap box, right panel)
**Starts from:** v3.1.
**Size:** about **23 focused hours**.

Work phase by phase. Each phase ends with a **Done when** check and a commit.

---

## Phase 1: Data and assembly (about 4 hours)

1. `article-map.ts`: add `stepLabel`, `stepOrder` and `scoreDimension` for the seven playbook sections; mark which articles carry takeaways and gaps.
2. Article parsing (`src/main/wiki/sections.ts`): read `## Key takeaways` (exactly three list items) and `## Gap to close` (`**Problem:**`, `**Next step:**`) from articles and from assembled outputs; tolerate their absence.
3. `assemble-playbook.ts`: copy takeaways and gap blocks under each section; fix the duplicate heading (drop an article H1 that equals or prefixes the section heading; strip "Value Driver:" and "Moat:" prefixes in sub-headings); update the golden-file test with a value driver case.
4. Add the additive section to `WIKI-FORMAT-SPEC.md` 6.6 (and the skill-pack copy): optional Key takeaways and Gap to close sections on playbook section articles.
5. `playbook-view.ts` (main): build the page model from the selected output version: sections (title, words, lede, body blocks, cards for drivers, moats, competitors), takeaways, gaps; plus live metadata from source articles (confidence, sources count, last changed, waiting changes); plus the overview model (spec section 5) and Biggest gap (6.3). IPC `playbook:view` (version id) and `playbook:versions`.

**Done when:** unit tests cover parsing, assembly with and without takeaways, the heading fix, the overview builder with missing data, and the Biggest gap rule; lint passes on a wiki with the new sections.

## Phase 2: Generation and backfill (about 3 hours)

1. Prompt builder: add the takeaways and gap instructions and rules (REQ-v4 7.3) to playbook section tasks T13 to T19; output schema gains `takeaways` and optional `gap`; validation: exactly three takeaways, each 12 words or fewer, no em dashes; gap fields both present if any.
2. Moat takeaways and gap come from the T18 task and are written into the assembled output only (no parent article).
3. Backfill task `playbook-takeaways` (no web tools; inputs: the section articles and their sources; output: takeaways and gaps only, merged into articles without changing other body text). Route through the v3.1 regenerate preview and keep-or-discard review. Banner on the page when any section lacks takeaways.
4. Isolation test: the new task is no-web; extend the test to cover it.

**Done when:** a fresh run and a backfill both produce valid takeaways for all sections and gaps only where justified, and lint passes.

## Phase 3: Page shell, tabs and overview (about 5 hours)

1. Replace the current playbook view: remove the left table of contents and per-section Source/Change links.
2. Header: title, metadata, version select (with old-version banner and disabled actions), Export PDF, More menu (Copy as markdown, Open in editor, Show in Finder, Reassemble), Regenerate (v3.1 preview).
3. Step pills (`StepTabs.tsx`) per REQ-v4 4.1: states, gap dot, ARIA tabs, arrow keys, progress bar; visited and last-step state in app state per workspace and version (`playbook:getNavState`, `playbook:setNavState`); deep-link support (`?step=`).
4. Overview (`PlaybookOverview.tsx`) per REQ-v4 5: statement card, three driver cards (click to step 3 with that card expanded), who it's for, up against, biggest gap (link to its gap box), Start button, "Not generated yet" placeholders with Generate.
5. Add `--warning` and `--warning-bg` tokens if v3 didn't already; check contrast.

**Done when:** acceptance criteria 1, 2 and 3 pass, compared side by side with artboard B.

## Phase 4: Section view and right panel (about 5 hours)

1. `PlaybookSection.tsx`: eyebrow with reading time, title, Key takeaways box, lede, body, Back and Next.
2. Section renderers: expandable cards for value drivers (first expanded), moats and competitors; positioning statement as a definition table plus copyable variation cards; markdown for the rest.
3. Gap box per REQ-v4 6.3 with the score chip where `scoreDimension` maps and a Messaging Analysis exists.
4. Right panel (`SectionPanel.tsx`): This section (confidence, sources linking to the filtered Sources tab, last changed, waiting changes, Open in Wiki, Make a change) and Use it (Copy this section, Ask Chat about it with the section article loaded in workspace mode).
5. Responsive: panel stacks below content under 1100px.

**Done when:** acceptance criteria 4, 5, 6, 7 and 11 pass, compared side by side with artboard C.

## Phase 5: Help plan (about 2 hours)

1. App state `helpPlan: [{ section, problem, nextStep, addedAt }]` per workspace; IPC `help:get`, `help:add`, `help:remove`, `help:markRequested`.
2. Header chip "Help plan N"; side sheet with the list, Remove, Ask for help with these, Copy details.
3. Build the prefilled URL from `links.helpRequestUrl` (`https://positioninghq.com/expert-help`) with query parameters `company`, `name`, `email`, `sections`, `gaps` (section names and problems only); fall back to names plus Copy details when too long; open via `shell:openExternal`; add `positioninghq.com` to the allowlist.
4. Test: no private-tagged body text ever appears in the URL.

**Done when:** acceptance criterion 8 passes.

## Phase 6: Export PDF (about 2.5 hours)

1. Print route `PlaybookPrint.tsx`: cover (with a positioninghq.com link), overview, contents, all sections with takeaways and gaps, cards expanded, page breaks, footer with page numbers and a live positioninghq.com link.
2. Export dialog: paper size (default by locale), Include gaps, Include private material (with the warning when any section is private).
3. Main: hidden window loads the print route with the chosen options, `printToPDF`, save dialog, then close the window. Fonts bundled, so the PDF matches the app.

**Done when:** acceptance criterion 12 passes on a Parallel79 wiki and a wiki with private sections.

## Phase 7: Check and ship (about 1.5 hours)

1. Run all 14 acceptance criteria; record in `docs/v4-acceptance.md`.
2. Keyboard and VoiceOver pass on tabs, cards and the help sheet.
3. Em dash sweep, lint, CI green.
4. Tag the release.

---

## Risks

| Risk | Mitigation |
|---|---|
| Takeaways repeat the lede or are generic | Prompt rule "supported by the body, no restatement of the title"; review them during the backfill keep-or-discard step |
| Gaps feel like a sales pitch and erode trust | Gaps only where sources show a weakness; the next step is free, concrete advice that works without buying anything; the help buttons are secondary in tone, not a modal |
| Old versions lack takeaways and gaps | Boxes hidden when absent; version banner explains |
| PDF fonts substitute | Bundle DejaVu Serif and Inter in the print view; check the PDF's embedded fonts in acceptance |
| Overview summaries are too long for cards | Clamp to two lines with the full text in a tooltip; tighten the `summary` length rule in the prompt (one sentence, at most 25 words) for new runs |

# PositioningHQ Desktop: v3 Requirements

**Version:** v3 (Wiki navigation)
**Date:** 2026-10-18
**Owner:** Shahed Khalili, Parallel79°
**Builds on:** v2 (implemented). Everything in v2 still applies unless this document changes it.
**Companion docs:** `IMPLEMENTATION_PLAN-v3.md`, `CLAUDE.md`

---

## 1. What v3 changes

The Training Data pane works, but it's organised by how the research pipeline produced files, not by what a founder wants to find. v3:

1. Renames **Training Data** to **Wiki**.
2. Rebuilds the article list as a **collapsible tree**, ordered answer-first: positioning conclusions at the top, the evidence behind them below.
3. Nests related articles (value drivers, moats, competitor profiles) under expandable parents, and drops the repeated prefixes that were truncating titles.
4. Shows each article's **sources inline** under it in the tree, and keeps the **Sources** tab for browsing all sources.
5. Shows status in the list: low confidence, private, out of date, decision applies.
6. Adds search.

Decided by Shahed on 2026-10-18: name "Wiki"; the topic grouping proposed in the design session; competitor profiles as a collapsible heading; Sources stays a separate tab and sources also show inline under each article; every section is a collapsible heading.

### 1.1 Out of scope

- Editing articles in the app.
- Changes to the wiki format or article slugs (`WIKI-FORMAT-SPEC.md` is unchanged).
- Changes to the other navigation items (Chat, Positioning Playbook, Messaging Analysis, Use your wiki).

---

## 2. Rename to Wiki

- Sidebar item: **Wiki** (icon `BookText` or keep `Database`; prefer `BookText`, since "database" reinforces the training-data reading).
- Pane title: **Wiki**.
- Tabs: **Articles** | **Sources** (were Knowledge | Sources).
- Replace "Training Data" everywhere in UI strings, empty states, onboarding copy, tooltips, notifications, Settings and the README template's mention of the app (if any). Add a test that fails if "Training Data" or "training data" appears in `src/` UI strings.
- "Use your wiki" keeps its name; it now reads as the companion of "Wiki".

---

## 3. Articles tab: the tree

### 3.1 Structure

Sections in this fixed order. Each section is a collapsible heading. Within a section, items appear in the order listed, never alphabetically (except where noted).

```
POSITIONING
  Positioning Statement
  ▾ Value Drivers                 (parent: the value-drivers article, children: value-driver-*)
      <driver 1>
      <driver 2>
      <driver 3>
  ▾ Moats                         (virtual parent, children: moat-*)
      <moat 1> ...
  Proof Points
  ▾ Decisions                     (virtual parent, children: decision-*, newest first)
CUSTOMERS
  Ideal Customer Profile
  Customer Segment
COMPETITORS
  Competitive Landscape
  ▾ Competitor Profiles           (virtual parent, children: competitor-*, alphabetical)
      <competitor A> ...
MESSAGING TODAY
  Current Messaging
  Social Taglines
MARKET
  Why Now                         (slug market-overview)
  Market Segment
  Research Summary                (slug market-position-summary)
YOUR COMPANY
  Company Profile                 (subtitle: "What you told us")
  Company Overview
  Product Overview
  Recent Developments
  Strengths
  Weaknesses
OTHER                             (only shown if present: articles whose slug isn't in the article map,
                                   e.g. ones a user or another tool added; alphabetical)
```

Notes:

- **Value Drivers** is a real article (the summary). Clicking its label opens that article; clicking its chevron expands or collapses its children.
- **Moats**, **Decisions** and **Competitor Profiles** are virtual parents (no article of their own). Clicking the label toggles them.
- Children order: value drivers and moats in the order the value-drivers article and playbook list them (fall back to `created`, then title); decisions newest first; competitors alphabetical.
- The order of items within a section follows the positioning logic above. The app must not re-sort by title.

### 3.2 Labels

- Each article map entry gets a short **nav label** (the names in 3.1, for example "Why Now" for `market-overview`, "Research Summary" for `market-position-summary`).
- Children drop their type prefix: an article titled "Value Driver: Faster Ramp, One Standard" shows as "Faster Ramp, One Standard" under Value Drivers. Same for "Moat:", "Competitor:" and "Decision:". If a title has no prefix, show it as is.
- Long labels wrap to a second line, then truncate with an ellipsis. Hovering shows the full title and the article's summary in a tooltip.

### 3.3 Three kinds of expand and collapse

| Level | Control | Default |
|---|---|---|
| Section heading (POSITIONING, CUSTOMERS...) | Chevron to the left of the eyebrow-style heading; whole heading row clickable | Expanded |
| Parent item (Value Drivers, Moats, Decisions, Competitor Profiles) | Chevron to the left of the label | Expanded |
| An article's sources | A small "3 sources" count to the right of the article label, which toggles the sources list beneath it | Collapsed |

Using a count rather than a third chevron keeps the tree from becoming a wall of arrows and makes the difference between "this has child articles" and "this has sources" visible.

- Section headings show a count of the articles inside (for example "COMPETITORS 6").
- Expand and collapse states are remembered per workspace (app state, not the wiki).
- **Collapse all** and **Expand all** actions in a small menu at the top of the tree.
- Option/Alt-click on a section chevron expands or collapses every section (macOS convention; Alt on Windows and Linux).

### 3.4 Inline sources

When an article's source count is expanded:

- Its sources are listed indented under it, one row each: a type icon (web page, citation, file, social, legacy), the source title (truncated, full title on hover), and a lock if `private`.
- Order: first-party sources first (own site, user files), then competitor sites, then web citations, then legacy; newest first within each.
- Clicking a source opens it in the reader (main area) with a **Cited by** list that links back to every article citing it.
- If an article cites more than 8 sources, show 8 and "Show all N".
- Broken source paths (file missing) show in red as "Missing: <path>" with a tooltip suggesting a re-run.

### 3.5 Status markers

Shown at the right of each article row, before the source count. At most two icons per row; if more apply, show the highest-priority two and the rest in the tooltip. Priority order:

| Marker | When | Icon (lucide) | Colour |
|---|---|---|---|
| Missing | Expected by the article map but not generated yet | `CircleDashed` | muted |
| Out of date | A source, a linked decision, or an article it depends on is newer than this article's `updated` | `Clock` | amber |
| Low confidence | `confidence: low` | `CircleAlert` | amber |
| Decision applies | A `decision-*` article links to it | `Scale` | teal |
| Private | Tagged `private` | `Lock` | muted |

- "Out of date" uses the article map's dependency list (which articles feed which) plus the `sources` list. It's computed from front matter and file times only, no model call.
- Parent and section rows show a single amber dot if any child is out of date or low confidence, so collapsed sections still signal problems.
- Every marker has a text equivalent for screen readers and in the tooltip ("Low confidence: one third-party source").
- Missing articles appear dimmed at their place in the tree with a "Generate" action in the reader, so the founder can see what's expected and absent.

Colours come from the design tokens: amber needs a new token pair (`--warning: #a15c07` on white, 4.5:1 minimum; `--warning-bg: #fdf4e6`). Teal and muted already exist.

### 3.6 Search

- A search box at the top of the Articles tab (`Cmd/Ctrl+F` when the pane has focus).
- Matches article title, nav label, aliases and summary, case-insensitive.
- While searching: non-matching items are hidden, sections and parents containing matches auto-expand, matched text is highlighted, and section counts show matches ("COMPETITORS 2 of 6").
- Clearing the search restores the previous expand and collapse state.
- Empty result: "No articles match. Try the Sources tab, or ask in Chat."

### 3.7 Keyboard and accessibility

- The tree uses ARIA tree semantics (`role="tree"`, `treeitem`, `group`, `aria-expanded`, `aria-level`, `aria-selected`).
- Keys: Up and Down move; Right expands (or moves to the first child); Left collapses (or moves to the parent); Enter opens; Home and End jump; typing a letter jumps to the next item starting with it.
- The selected article stays highlighted (current teal-tinted row) and scrolls into view when opened from elsewhere (for example a link in the playbook).
- Focus ring follows the design system.

### 3.8 Pane width

- Resizable by dragging its right edge, between 240 and 420 px; default 280. Remembered per machine.
- Double-click the edge to reset to the default.

---

## 4. Sources tab

Same tree behaviour (collapsible section headings, counts, search, keyboard), with these sections:

```
YOUR WEBSITE          raw files tagged own-site
YOUR FILES            tagged private (subgrouped by category tag: Sales collateral, Customer references, ...)
COMPETITOR SITES      tagged competitor-site (subgrouped by competitor)
WEB CITATIONS         tagged web-citation
SOCIAL                tagged social
LEGACY                tagged legacy (only if present)
```

- Each source row shows a **Cited by N** count that toggles the list of citing articles beneath it (the mirror of 3.4).
- A source cited by no article shows "Not cited" in muted text (useful for spotting user files the research ignored).
- Keep the existing "Add files" action at the top of YOUR FILES.

---

## 5. Data source for the tree

The tree is built from data, not hardcoded:

- Extend `article-map.ts` entries with `navSection`, `navOrder`, `navLabel`, `navParent` (slug or virtual parent id), `labelPrefix` (to strip from children), and `dependsOn` (slugs that feed it, for "out of date").
- A wiki made by the skill pack renders the same way, because the map is keyed on the spec's fixed slugs.
- Unknown slugs fall into OTHER.
- The tree model is computed in the main process from front matter and file times (`wiki:tree` IPC) and pushed to the renderer on `workspace:changed`, so large wikis don't make the renderer read every file.

---

## 6. Acceptance criteria

1. No UI string contains "Training Data"; the sidebar, pane title and tabs read Wiki, Articles, Sources.
2. For the Parallel79 test wiki, the Articles tab matches the 3.1 structure and order exactly, with Competitor Profiles as a collapsible parent.
3. No child label contains its type prefix; no label truncates on one line at the default width without a tooltip.
4. Every section heading collapses and expands; states survive an app restart; Collapse all and Expand all work; Alt-click toggles all.
5. Expanding "N sources" under an article lists exactly the files in its `sources`, ordered per 3.4; clicking one opens it with a working Cited by list.
6. An article with `confidence: low` shows the low-confidence marker; adding a newer source to one of its sources' ingest (simulate by touching a source file) shows Out of date; a collapsed section containing it shows the amber dot.
7. A wiki missing `moat-*` articles shows a dimmed placeholder under Moats with Generate.
8. Search for a competitor's alias finds its profile and expands Competitor Profiles; clearing restores the previous state.
9. The tree is fully operable by keyboard and announces states correctly in VoiceOver.
10. A wiki produced by the skill pack renders in the same structure; an extra article with an unknown slug appears under OTHER.
11. Sources tab: every source shows Cited by N; an uncited user file shows "Not cited".
12. Tree renders in under 100 ms for a wiki with 200 articles and 1,000 sources.
13. No em dashes in new UI strings. CI green.

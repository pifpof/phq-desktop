# PositioningHQ Desktop: v3 Implementation Plan

**Date:** 2026-10-18
**Reads with:** `REQUIREMENTS-v3.md`, `CLAUDE.md`
**Starts from:** the implemented v2.
**Size:** about **14 focused hours**, one milestone.

Work phase by phase. Each phase ends with a **Done when** check and a commit.

---

## Phase 1: Rename (about 1 hour)

1. Replace "Training Data" with "Wiki" in every UI string, route name and component name (`features/training-data/` becomes `features/wiki/`; keep a redirect for any persisted route state).
2. Tabs: Articles | Sources.
3. Sidebar icon `BookText`.
4. Add `tests/unit/no-training-data-copy.test.ts`: fails if `/training data/i` appears in `src/renderer` strings.

**Done when:** acceptance criterion 1 passes.

## Phase 2: Tree model in main (about 3 hours)

1. Extend `article-map.ts` entries: `navSection`, `navOrder`, `navLabel`, `navParent`, `labelPrefix`, `dependsOn` (REQ-v3 5). Fill them for every slug and slug pattern per REQ-v3 3.1.
2. Define virtual parents: `moats`, `decisions`, `competitor-profiles`.
3. `src/main/wiki/tree.ts`: build `WikiTree` from front matter and file mtimes:
   - sections -> items -> children, in map order; OTHER for unknown slugs;
   - placeholders for expected-but-missing slugs;
   - per item: label (prefix stripped), full title, summary, aliases, confidence, private, decisionApplies, outOfDate (any source mtime, linked decision `created`, or `dependsOn` article `updated` newer than this article's `updated`), sources (resolved, sorted per REQ-v3 3.4, missing ones flagged);
   - roll-up flags on parents and sections.
4. `src/main/wiki/sources-tree.ts`: the Sources tab model (REQ-v3 4) with Cited by lists.
5. Cache the trees per workspace; rebuild incrementally on `workspace:changed` (only affected items), then push `wiki:treeChanged`.
6. IPC: `wiki:tree`, `wiki:sourcesTree`, `wiki:treeChanged` (event). Add to `ipc-contract.ts` first.
7. Unit tests: ordering, prefix stripping, virtual parents, placeholders, out-of-date rules, unknown slugs to OTHER, a skill-pack-made fixture, and a 200-article / 1,000-source performance fixture (build under 100 ms).

**Done when:** tests pass and the tree for the Parallel79 wiki matches REQ-v3 3.1 when printed.

## Phase 3: Tree component (about 4 hours)

1. `features/wiki/Tree.tsx`: a single accessible tree component used by both tabs. ARIA tree roles; roving tabindex; keyboard map per REQ-v3 3.7; type-ahead.
2. Row types: section heading (eyebrow style, chevron, count, roll-up dot), parent item (chevron + label, clickable label opens the article if it's real), article item (label, markers, source count toggle), source item (icon, title, lock), placeholder item (dimmed).
3. Markers per REQ-v3 3.5, max two with priority, tooltip with full list and text equivalents. Add `--warning` and `--warning-bg` tokens to `globals.css` (check 4.5:1 contrast for `--warning` on white and on the pane background).
4. Labels: two-line clamp, tooltip with full title and summary.
5. Expand state: Zustand store persisted to app state per workspace via IPC (`wiki:getNavState`, `wiki:setNavState`); Collapse all / Expand all menu; Alt-click on section chevrons toggles all.
6. Virtualise rows when the flattened tree exceeds 300 visible rows.

**Done when:** acceptance criteria 2, 3, 4 and 9 pass.

## Phase 4: Inline sources and Sources tab (about 3 hours)

1. Article row "N sources" toggle renders source children (max 8, "Show all N").
2. Source reader: opening a raw file in the main area with a **Cited by** list linking to articles; missing-file state.
3. Sources tab using the same `Tree` with `wiki:sourcesTree`; Cited by N toggles; "Not cited" state; "Add files" kept under YOUR FILES.

**Done when:** acceptance criteria 5 and 11 pass.

## Phase 5: Search, placeholders, pane width (about 2 hours)

1. Search box with `Cmd/Ctrl+F`; filter over label, title, aliases, summary; auto-expand matches; highlight; "x of y" section counts; restore previous expand state on clear; empty state copy.
2. Placeholder items open a reader panel with "Not generated yet" and **Generate** (runs the producing task from the article map via the existing single-task run).
3. Resizable pane (240 to 420 px, default 280, double-click reset), width stored per machine.

**Done when:** acceptance criteria 7, 8 and 12 pass.

## Phase 6: Check and ship (about 1 hour)

1. Run all 13 acceptance criteria; record in `docs/v3-acceptance.md`.
2. VoiceOver pass on the tree.
3. Em dash sweep; CI green.
4. Tag `v0.3.0`.

---

## Risks

| Risk | Mitigation |
|---|---|
| Three levels of expand controls feel busy | Sources use a count toggle, not a chevron (REQ-v3 3.3); review with a screenshot after Phase 3 before polishing |
| "Out of date" fires too often after every run | Compare against `updated`, not file mtime, for articles; only sources and decisions newer than the article count; tune after first use |
| Value driver and moat order differs from the playbook | Order children from the value-drivers article's own list; fall back to `created` |
| Large wikis slow the renderer | Tree built and cached in main; incremental rebuild; virtualised rows |

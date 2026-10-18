# PositioningHQ Desktop: v3.1 Requirements

**Version:** v3.1 (Make a change, and preview before regenerating)
**Date:** 2026-10-18
**Owner:** Shahed Khalili, Parallel79°
**Builds on:** v3 (Wiki navigation). Independent of v3's tree work; can ship before or after it.
**Companion docs:** `IMPLEMENTATION_PLAN-v3.1.md`, `WIKI-FORMAT-SPEC.md` (small addition, section 6), `CLAUDE.md`

---

## 1. What v3.1 changes

The v2 "Record a decision" feature is confusing (see the 2026-10-18 screenshot review): it asks the founder to pick affected articles from an unordered list of every article, its text fields look like empty space, and "decision" isn't how founders think. Founders think: "this is wrong, change it."

v3.1:

1. Replaces **Record a decision** with **Make a change**. The founder says what to change, why, and with what. The change is logged immediately as a pending change.
2. After each change, the founder chooses to **add another change** or **review and regenerate**.
3. Replaces the instant **Re-run** with a **Regenerate preview**: before anything runs, the founder sees every change, decision and wiki update that will shape the new version, plus cost. Then they start it.
4. After regenerating, the founder **reviews the result** (before and after) and keeps or reverts it.

Decided by Shahed on 2026-10-18: the rename; tracking what, why and with what; logging the change as soon as it's submitted; asking "regenerate or add another" after each change; regenerating from the changes plus any other wiki updates; a preview before the run starts. Claudia added the result review (section 5) and conflict warnings; review and cut if unwanted.

### 1.1 Out of scope

- Editing article text directly in the app (open in editor still exists).
- Changes that span many pages at once from a single dialog (each change belongs to one page; it can affect others, see 3.4).
- Undoing a change after its result was kept (make a new change instead).

---

## 2. Concepts

| Term (UI) | What it is | Stored as |
|---|---|---|
| **Change** | A founder's instruction to change a page: what, why, with what | A decision article, `wiki/references/decision-YYYY-MM-DD-<slug>.md`, with `Status: Pending` (spec 6.4, addition in section 6 below) |
| **Pending change** | Saved, not yet applied by a regeneration | `Status: Pending` |
| **Applied change** | A regeneration included it and the founder kept the result | `Status: Applied`, with the date and page |
| **Withdrawn change** | Cancelled by the founder before it was applied | `Status: Withdrawn`, kept for the record |
| **Wiki update** | Anything else that changed since the page was last generated: new or newer sources, edited dependent pages, profile edits, other applied changes | Computed from front matter and file times; not stored |

In the UI the word is always "change". The file keeps the spec's `decision-` slug so the format contract and the skill pack stay valid. Applied changes keep working as decisions: every later regeneration must respect them.

---

## 3. Make a change

### 3.1 Entry points

- **Page header:** the "Record a decision" action becomes **Make a change** (icon `PencilLine`).
- **Section level:** hovering an H2 in an article shows a small "Change this section" action; it opens the dialog with that section preselected.
- **Positioning Playbook view:** each section heading gets "Change this section", which maps to the source article and section.
- **Chat:** under an assistant reply in workspace mode, "Make this a change" opens the dialog with the reply's suggestion prefilled in "Change to" and the page it refers to preselected (the page cited in the reply; if several, the founder picks).

### 3.2 The dialog

Title: **Make a change to <Page name>**
Subtitle: "Tell us what to change. It's saved right away and applied the next time you regenerate this page."

| Field | Control | Required | Notes |
|---|---|---|---|
| **What to change** | Select: "The whole page" or one of the page's sections (its H2 headings), plus an optional quote box ("Quote the part you mean") | Yes (defaults to the section it was opened from, else "The whole page") | Quoting a sentence makes the instruction precise |
| **Why** | Multi-line text, 3 rows visible | Yes | Placeholder: "What's wrong with it? For example: our buyers are heads of sales, not founders." |
| **Change it to** | Multi-line text, 4 rows visible | Yes | Placeholder: "What it should say or focus on instead. Rough notes are fine." |
| **Based on** (optional) | Pick existing sources (searchable list from the Sources tab), **Add a file** (ingested as a private raw source), or **Paste notes** (saved as a private `raw/notes/` file) | No | This is the "with what": evidence the regeneration should use. Shown as chips |
| **Also affects** | Read-only list computed by the app (3.4), with a "Change" link to add or remove pages | No | Replaces the v2 checkbox wall |

Visual requirements: every text area has a visible 1px border, 10px radius, and the focus ring (fixes the v2 borderless fields). Placeholders use the founder's own page content where possible, never the spec's sample company. Width 640px; the dialog scrolls inside, buttons stay pinned.

Buttons: **Cancel** and **Save change** (primary). Save is disabled until the three required fields are filled.

### 3.3 After saving

The change is written immediately as a decision article with `Status: Pending` and logged in `log.md` (`## [date] change | requested: <short name> (<page>)`).

The dialog then shows a confirmation step, not a new screen:

> **Change saved.** It will be applied when you regenerate <Page name>.
> [ Add another change ]  [ Review and regenerate ]

- **Add another change** clears the fields and keeps the same page selected.
- **Review and regenerate** closes the dialog and opens the Regenerate preview (section 4).
- Closing the dialog keeps the change pending.

### 3.4 What a change affects

The app computes the pages a change affects, so the founder never has to pick from every article:

1. The page it was made on (always).
2. Pages that depend on it, from `dependsOn` in `article-map.ts` (for example, a change to the ICP affects value drivers, the positioning statement and the playbook output).
3. The assembled outputs that include the page (playbook, messaging analysis).

These are shown as "Also affects: Value Drivers, Positioning Statement, Positioning Playbook". They become **out of date** (v3 marker) when the change is applied, not when it's saved, so the tree doesn't light up for pending changes. The founder can add or remove affected pages through "Change"; additions are stored as links in the change article.

### 3.5 Pending changes on the page

- A banner under the page header: "**2 changes waiting.** They'll be applied when you regenerate." with **Review and regenerate**.
- Expanding it lists each pending change (short name, section, why, change to), with **Edit** and **Withdraw** per change.
- Withdrawing sets `Status: Withdrawn`, logs it, and removes it from the banner.
- The v3 tree shows a pending-change marker on the page (`PencilLine`, teal) at the same priority as "decision applies".

### 3.6 Change log in the Wiki pane (replaces "Decisions" in the article tree)

v3 shipped Decisions as a collapsible parent under POSITIONING, listing each decision article by name (the 2026-10-18 screenshot shows "Decisions > test"). That's the wrong shape: changes aren't positioning content, they span every section, and their value is the history (what changed, when, why, is it done). v3.1 moves them into a change log.

**Placement:** a third tab in the Wiki pane: **Articles | Sources | Changes**. The Changes tab shows a count badge when changes are waiting ("Changes 2"). The Decisions parent is removed from the Articles tree (this supersedes REQUIREMENTS-v3 section 3.1 for Decisions). A log is chronological and a tree is topical; mixing them in one list made both worse.

**Layout, newest first:**

```
[ All | Waiting 2 | Applied | Withdrawn ]      Show regenerations [ ]

WAITING
  ✎ Lead with heads of sales, not founders
    Ideal Customer Profile · Buyer roles · 18 Oct
  ✎ Drop "AI 101" as a named alternative
    Market Overview · whole page · 18 Oct
TODAY
  ✓ Moat 2 is governance, not "control"
    Applied to Moats on 18 Oct
  ↻ Regenerated Positioning Statement (2 changes applied)      [only with Show regenerations]
THIS WEEK
  ✓ ...
EARLIER
  ✕ Withdrawn: Position against spreadsheets        (muted, struck through)
```

- **Waiting** is always pinned at the top, regardless of filter "All", so pending work can't scroll out of sight.
- Applied and withdrawn entries are grouped by date: Today, This week, Earlier.
- Each entry shows a status icon (`PencilLine` waiting, `Check` applied, `X` withdrawn, `RefreshCw` regeneration), the short name, and a second line with the page and section (waiting) or "Applied to <page> on <date>" (applied).
- Legacy decision articles (no Status line) show as applied, dated by `created`.
- **Show regenerations** (off by default) adds regeneration events from `log.md` (`regenerate` lines), so the log reads as a full history of how the wiki changed. Off by default to keep the founder's own changes prominent.
- Search (v3 behaviour) works in this tab over short name, why and change to.

**Selecting an entry** opens the change in the reader (main area), not the raw decision file:

- Header: status chip, short name, date, page link.
- Body: What to change, Why, Change it to, Based on (source links), Affects (page links).
- Applied: a "What changed" link that opens the before and after from that regeneration (from app-state history, while it's retained).
- Actions: Waiting changes get **Edit**, **Withdraw** and **Review and regenerate** (opens the preview for its page); applied and withdrawn changes are read-only, with **Make a related change** (opens the dialog prefilled with the same page and section).

**From the Articles tree:** a page with waiting changes shows the pending marker (3.5); clicking the marker opens the Changes tab filtered to that page.

**From the main sidebar:** the Wiki nav item shows the waiting count ("Wiki 2") so pending changes are visible from anywhere in the app.

---

## 4. Regenerate preview (replaces the instant Re-run)

Every "Re-run" or "Regenerate" action in the app (page header, banner, Wiki tree, research screen) opens this preview first. Nothing runs and nothing is spent until the founder presses Start.

### 4.1 Layout

Title: **Regenerate <Page name>**
Intro: "Here's what will shape the new version. Nothing changes until you start."

Sections, in this order (empty sections are hidden):

1. **Your changes** (pending, for this page): each with short name, section, why and change to; checkbox per change, all checked by default (unchecking leaves it pending for later). Edit and Withdraw inline.
2. **Changes from other pages** that affect this one (pending changes made elsewhere whose "also affects" includes this page): same layout, unchecked by default, with "Include".
3. **Decisions it will respect**: applied changes linked to this page, collapsed to a count ("Respects 3 earlier changes"), expandable.
4. **Updates since this page was last generated**, grouped:
   - New sources: user files added, new web citations, new crawl pages (title, date, type icon).
   - Updated pages it depends on: page name, when updated, and why if known (for example "ICP updated 18 Oct after your change").
   - Company profile edits: which fields changed.
   - Each item links to the thing it describes.
5. **Options**:
   - "Also refresh web research for this page" (off by default). Only shown for pages whose task uses web tools. Explains it costs more and takes longer.
   - "Then update pages that depend on this" (off by default), listing the dependent pages it would regenerate after this one, and noting "The playbook will be reassembled at no cost" when relevant.
6. **Estimate**: time and cost range for the selected options (v1 estimate model), and the budget cap.
7. **Warnings** (if any, section 4.2).

Buttons: **Cancel** and **Start regenerating** (primary). If nothing is selected and there are no updates: "Nothing new to apply. Regenerate anyway?" with the same button.

### 4.2 Warnings

Shown in the preview, never blocking:

- Two included changes target the same section with different instructions: "These two changes both rewrite <section>. The newer one wins unless you edit them."
- An included change contradicts an applied change (detected only when they target the same section): "This may undo an earlier change (<name>, <date>). If you continue, the earlier change will be marked as replaced."
- A change cites a source marked `private` and the page feeds a public export: informational note.
- The page was edited outside the app since it was last generated (file `updated` newer than the last run's write): "You edited this page in another editor. Regenerating will replace those edits unless you turn them into a change." with **Turn my edits into a change** (creates a pending change with "Change it to" = the diff summary).

### 4.3 What the regeneration does

- Runs the page's task (and dependents if chosen) with the v2 pipeline, adding to the prompt:
  - **Must apply:** the included changes, each with what, why, change to, and the "based on" sources (whose raw files become task inputs; private sources respect the isolation rule, so a web task never receives them and the app runs the gather and write steps separately as in v2).
  - **Must respect:** applied changes linked to the page.
  - **Inputs:** the current versions of everything listed in "Updates since".
- The structured article output gains a `changeReport` field: for each included change, `applied: yes | partly | no` and a one-line note of where and how. Validation rejects outputs that omit a change from the report.
- The new article is written to a **staging** location in app state, not the wiki, until the founder keeps it (section 5).

---

## 5. Review the result

When a regeneration finishes, the page opens in review mode:

- **Before and after** view: side by side on wide windows, inline diff (additions highlighted, removals struck through) on narrow ones. Toggle between them.
- **Change report**: each change with its applied status and note; "partly" and "no" shown in amber with the model's reason.
- Buttons: **Keep this version** (primary) and **Discard**. Plus "Keep, and make another change" for the common case of "close, but".

On **Keep**:

- The staged article replaces the wiki article; indexes and log update (`## [date] regenerate | <page> applying N changes`).
- Each included change with `applied: yes` or `partly` gets `Status: Applied` with the date and page, and becomes a decision future runs respect. Changes reported `no` stay pending, and the founder is told.
- Dependent pages become out of date (v3 marker); if the founder chose "update pages that depend on this", those runs start, each with its own review.
- The previous article version is kept in app state history (last 10 per page) for reference.

On **Discard**: the staged version is deleted; changes stay pending; nothing in the wiki changes. Cost is still shown (it was spent).

---

## 6. Format spec addition (decision articles)

Additive, no format version change. In `WIKI-FORMAT-SPEC.md` section 6.4, decision article bodies use these headings (the app writes them; the skill pack should too):

```markdown
# Change: <short name>

> <one-line summary>

**Status:** Pending | Applied 2026-10-18 to [[positioning-statement|Positioning Statement]] (...) | Withdrawn 2026-10-18

## What to change
<page and section, plus the quoted text if given>

## Why
<founder's words>

## Change it to
<founder's words>

## Based on
- [Source title](../../raw/notes/2026-10-18-pricing-call-notes.md)

## Affects
- [[value-drivers|Value Drivers]] ([Value Drivers](../concepts/value-drivers.md))
```

- Title prefix changes from "Decision:" to "Change:" for new articles; existing "Decision:" articles stay valid and are treated as Applied.
- `sources` front matter lists the "Based on" raw files; a change with no evidence uses `compiled-from: conversation`.
- Generators treat `Status: Applied` (and legacy decisions with no status) as must-respect; `Pending` only when included in a run; `Withdrawn` never.

Tell the skill pack: `PLUGIN-WIKI-MIGRATION.md` section 6.6 and the shared writing guide should write this body shape when `/product-launch` records accepted changes.

---

## 7. Acceptance criteria

1. No UI string says "Record a decision"; the action reads "Make a change" in the page header, section hover, playbook sections and chat replies.
2. The dialog has three required fields with visible borders, an optional Based on with source picking, file adding and pasting, and a computed Also affects list; no full-article checkbox list remains.
3. Saving writes a `decision-*` article with `Status: Pending` and a `log.md` line immediately, then offers Add another change and Review and regenerate.
4. A page with pending changes shows the banner and the tree marker; Withdraw sets `Status: Withdrawn` and logs it.
5. Every Re-run entry point opens the preview; nothing runs and no cost is incurred until Start.
6. The preview lists pending changes, changes from other pages, respected decisions, and updates since the last generation (new sources, updated dependencies, profile edits), each linked, with a cost estimate.
7. Two changes on the same section show the conflict warning; an outside edit shows the "turn my edits into a change" warning and that action works.
8. After a run, review mode shows before and after and a change report; Keep applies the article and marks changes Applied; Discard leaves the wiki untouched and changes pending.
9. A change reported "no" stays pending after Keep and the founder is told.
10. A later full research re-run respects applied changes (the regenerated page still reflects them).
11. The wiki passes `llm-wiki lint --fail-on warning` after save, withdraw, keep and discard.
12. A change with a private "Based on" file never reaches a web task (isolation test extended).
13. No em dashes in new UI strings or generated files. CI green.
14. The Articles tree no longer has a Decisions parent. The Wiki pane has an Articles | Sources | Changes tab bar; the Changes tab shows a waiting-count badge, and the Wiki sidebar item shows the same count.
15. The Changes tab lists Waiting at the top, then Today, This week, Earlier; the status filters work; legacy decisions (such as the existing "test") show as applied; withdrawn entries are muted and struck through.
16. Selecting a change opens its detail view with the right actions for its status; "What changed" opens the before and after for applied changes still in history.
17. "Show regenerations" adds regeneration events from `log.md`, and turning it off hides them.
18. Clicking a page's pending marker in the Articles tree opens the Changes tab filtered to that page.

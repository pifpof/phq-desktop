# PositioningHQ Desktop: v3.1 Implementation Plan

**Date:** 2026-10-18
**Reads with:** `REQUIREMENTS-v3.1.md`, `WIKI-FORMAT-SPEC.md`, `CLAUDE.md`
**Starts from:** the implemented v2 (v3 tree work optional; the tree marker in Phase 3 is skipped if v3 isn't in yet).
**Size:** about **20 focused hours**.

Work phase by phase. Each phase ends with a **Done when** check and a commit.

---

## Phase 1: Change model and storage (about 3 hours)

1. `src/shared/changes.ts`: `Change { id, slug, page, section, quote?, why, changeTo, basedOn: string[], affects: string[], status: 'pending' | 'applied' | 'withdrawn', appliedAt?, appliedTo?, createdAt }` (zod).
2. `src/main/wiki/changes.ts`:
   - `writeChange(change)`: renders the decision article body per REQ-v3.1 section 6 (title "Change: ..."), front matter per spec 4.2 (`sources` = basedOn, or `compiled-from: conversation`), writes `wiki/references/decision-YYYY-MM-DD-<slug>.md`, regenerates indexes, appends the `change | requested` log line.
   - `parseChange(file)`: reads Status, sections and links back into a `Change`; legacy "Decision:" articles parse as applied.
   - `setStatus(id, status, details)`: rewrites only the Status line (the article is `compiled-from: conversation` or founder-sourced, so editing it is allowed), updates `updated`, logs.
   - `listChanges({ page?, status? })`, `changesAffecting(slug)`.
3. `affects(slug)`: page + `dependsOn` reverse lookup from `article-map.ts` + outputs that include it.
4. IPC (contract first): `changes:create`, `changes:update`, `changes:withdraw`, `changes:list`, `changes:affects`.
5. Unit tests: round trip write/parse, legacy decision parsing, status transitions, affects computation, lint-clean output.

**Done when:** tests pass and a created change passes the official lint.

## Phase 2: Make a change dialog (about 4 hours)

1. Rename the action everywhere (`Record a decision` -> `Make a change`, icon `PencilLine`); remove the v2 checkbox list.
2. `features/changes/MakeChangeDialog.tsx`: fields per REQ-v3.1 3.2. Section select from the page's H2s (parsed in main, `docs:sections` IPC); quote box; Why and Change it to with visible borders and focus ring; Based on with source search (`wiki:sourcesTree`), Add a file (reuses ingest, tagged private), Paste notes (writes a `raw/notes/` private file on save); Also affects (computed, editable).
3. Confirmation step: "Change saved" with Add another change (resets fields, keeps page) and Review and regenerate.
4. Entry points: page header; H2 hover "Change this section"; playbook section headings (map to source article + section via the assembly map); chat "Make this a change" (prefill Change it to, pick page from cited articles).
5. Placeholders: generic copy from REQ-v3.1; never sample-company text.

**Done when:** acceptance criteria 1, 2 and 3 pass.

## Phase 3: Pending changes on the page and the change log (about 4 hours)

1. Banner under the page header with count, expandable list, Edit (reopens dialog in edit mode), Withdraw (confirm, then `changes:withdraw`).
2. Tree marker for pending changes: add `pendingChange` to the tree model and marker priority; clicking it opens the Changes tab filtered to that page.
3. Remove the `decisions` virtual parent from `article-map.ts` nav fields and from the Articles tree; `decision-*` articles no longer appear under POSITIONING.
4. `src/main/wiki/change-log.ts`: build the log model from `listChanges()` plus, when requested, `regenerate` lines parsed from `log.md`; group Waiting first, then Today, This week, Earlier; legacy decisions as applied by `created`. IPC `changes:log` and push updates on `workspace:changed`.
5. `features/wiki/ChangesTab.tsx`: tab bar becomes Articles | Sources | Changes with a waiting badge; status filter chips; Show regenerations toggle (persisted per workspace); search over short name, why and change to; rows per REQ-v3.1 3.6.
6. `features/changes/ChangeDetail.tsx`: reader view for a change with status-specific actions and the "What changed" link to history.
7. Waiting count on the Wiki sidebar item.

**Done when:** acceptance criteria 4 and 14 to 18 pass.

## Phase 4: Regenerate preview (about 4 hours)

1. `src/main/research/regen-plan.ts`: `planRegeneration(slug, options)` returns:
   - pending changes for the page; pending changes elsewhere that affect it;
   - applied changes linked to it;
   - updates since the page's last generation: sources newer than its `updated` among its task inputs (new user files, citations, crawl pages), dependency pages with newer `updated`, profile field changes (diff against the profile snapshot stored with the page's last run in `provenance.json`), other changes applied since;
   - outside-edit detection: the article file's content hash differs from the hash recorded in `provenance.json` at last write;
   - conflict detection per REQ-v3.1 4.2 (same section, different instructions; pending vs applied on the same section);
   - dependents list; whether the task uses web tools; cost and time estimate for the selected options.
2. IPC: `regen:plan`, `regen:start`.
3. `features/regenerate/RegeneratePreview.tsx`: sections per REQ-v3.1 4.1, checkboxes, inline Edit/Withdraw, options, estimate, warnings, Start.
4. "Turn my edits into a change": compute a readable diff between the last generated version (app state history) and the current file; create a pending change with that summary in Change it to.
5. Route every existing Re-run and Regenerate action through the preview.

**Done when:** acceptance criteria 5, 6 and 7 pass, and Cancel at any point leaves cost at $0.

## Phase 5: Regeneration with changes (about 3 hours)

1. Prompt builder: "Must apply" block (included changes with what, why, change to, quoted text), "Must respect" block (applied changes), and the Based on raw files added to the task inputs. Isolation: if the task has web tools and any Based on file is private, split into gather (web, no private) and write (private, no web) as in v2; extend `isolation.test.ts` with a change-driven case.
2. Output schema: add `changeReport: [{ changeId, applied: 'yes' | 'partly' | 'no', note }]`; validation requires one entry per included change.
3. Write the result to staging (`userData/workspaces/<id>/staging/<run>/<slug>.md`), not the wiki.
4. "Also refresh web research": include the page's web gather task in the run; otherwise reuse existing raw sources only.
5. "Then update pages that depend on this": queue dependent pages; each goes through review (Phase 6) before the next uses it.

**Done when:** a run with two changes produces a staged article and a complete change report.

## Phase 6: Review the result (about 2 hours)

1. `features/regenerate/ReviewResult.tsx`: before and after (side by side at 1100px+, inline diff below), change report with amber for partly/no, Keep, Discard, Keep and make another change.
2. Keep: move staged file into the wiki, record hash and profile snapshot in `provenance.json`, store the previous version in history (keep last 10), set applied changes to `Status: Applied` with date and page, leave "no" changes pending and say so, update indexes and log, mark dependents out of date, start queued dependent runs.
3. Discard: delete staging; changes stay pending; log nothing in the wiki (app state records the discarded run and its cost).

**Done when:** acceptance criteria 8, 9 and 10 pass.

## Phase 7: Spec note, checks and ship (about 0.5 hours)

1. Update `WIKI-FORMAT-SPEC.md` section 6.4 with the body shape from REQ-v3.1 section 6 (additive; format version unchanged) in the skill-pack repo, and note it in its CHANGELOG.
2. Run acceptance criteria 1 to 18; record in `docs/v3.1-acceptance.md`.
3. Lint after save, withdraw, keep, discard; em dash sweep; CI green.
4. Tag `v0.3.1`.

---

## Risks

| Risk | Mitigation |
|---|---|
| The model says a change was applied when it wasn't | Change report is shown next to the diff, so the founder judges with the evidence; "Keep and make another change" makes correcting cheap |
| Pending changes pile up and are forgotten | Banner on the page, tree marker, and a count on the Wiki nav item ("3 changes waiting") |
| Outside edits silently overwritten | Hash check in the preview with "turn my edits into a change" |
| Preview feels like friction for a simple re-run | Empty sections are hidden; with no changes or updates the preview is one line and the Start button |
| Staging and history grow | History capped at 10 per page; staging cleared on keep or discard and on launch |

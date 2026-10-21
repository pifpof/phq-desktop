# PositioningHQ Desktop: v4.4 Implementation Plan

**Date:** 2026-10-19 (updated 2026-10-21: choose what to run, REQ 4A)
**Reads with:** `REQUIREMENTS-v4.4.md`, `CLAUDE.md`
**Starts from:** v4.
**Size:** about **24 focused hours**.

Work phase by phase. Each phase ends with a **Done when** check and a commit.

---

## Phase 0: Reproduce the heading bug (about 1 hour)

1. Open Shahed's current workspace. Find every place the value driver heading repeats: page sections, cards, PDF, Copy as markdown, latest version and an older version.
2. Record which cause from REQ-v4.4 section 5 applies (old output file, card body heading, parent heading, or something else). Copy a real affected output file into `tests/fixtures/playbook/pre-v4.md`.

**Done when:** each duplicate is listed in `docs/v4.4-heading-bug.md` with its cause, and the fixture exists.

## Phase 1: Heading fix (about 2 hours)

1. `src/shared/headings.ts`: `normalizeHeading` and `isDuplicateHeading(heading, title)` per REQ 5.1.
2. Renderer: in `PlaybookSection.tsx` and the card renderers (value drivers, moats, competitors), drop the first body heading when `isDuplicateHeading` is true.
3. `assemble-playbook.ts`: replace the v4 H1 rule with the shared normaliser.
4. Make sure PDF print route and Copy as markdown go through the same render path.
5. Tests per REQ 5.2, including the pre-v4 fixture and the "must not drop" case.

**Done when:** acceptance criterion 12 passes on the latest and an older version.

## Phase 2: Step states and scoped runs in main (about 3 hours)

1. `run-store.ts`: `listRuns(root)`.
2. `research/task-states.ts`: per top-level task (not on demand), status from disk per REQ 4A.2 (output check, else the last run's skipped or failed status), date, Open target (first written wiki page, playbook or messaging output), cost estimate, dependencies, whether it writes wiki articles (Regenerate) and a one-line description. No model call.
3. Engine `add(ids)`: adds tasks to a running or paused run (scope grows, saved in the run file); rejects ids already in the run.
4. Service: `taskStates()`, `runTasks(ids)` (start a scoped run, or add to the run that is going), with the 4A.3 checks in main (dependencies done, skipped, in the selection or in the run; done article steps refused).
5. IPC in the contract: `research:taskStates`, `research:runTasks`. Preload methods.

**Done when:** unit tests cover each status, the dependency check (missing, ticked together, in the running run), refusing a done article step, and adding to a running run.

## Phase 3: The Research page (about 4 hours)

1. Sidebar item **Research**; `homeView: 'research'`; every `go('progress')` opens it; the full-screen progress route goes.
2. `ResearchView.tsx`: header, summary line, Run all remaining, task list by stage with checkbox, status, cost, Run, Open, Regenerate, Run again, Retry; selection rules from REQ 4A.3 (the renderer mirrors main's check for the disabled state; main has the final say).
3. Sticky bar: count, estimate, Pauses at with Change, Clear, Run selected or Add to this run.
4. Onboarding last step: Run everything, Choose steps, Not now.
5. Stop and pause and resume controls move here from the progress screen; the pause dialog unchanged.

**Done when:** acceptance criteria 13 to 19 pass by hand in the built app (Playwright screenshots).

## Phase 4: Run completion events (about 3 hours)

1. Run engine (`src/main/research/`): emit `run:playbookReady` (runId, playbook version, stats) when T20 writes its output, and `run:taskFinished` (task id, article slugs) for every task. Emit `run:finishedWithProblems` when T20 fails or is blocked.
2. Stats builder (main, no model): sections count, sources cited (citation records referenced by the new version), competitors profiled, elapsed, cost, Biggest gap (v4 rule, priority-order fallback when Messaging Analysis isn't ready).
3. Run state file: add `playbookReadyAt`, `doneSeenAt`, `runKind` (`initial`, `full`, `playbook`, `selected`). Typed IPC `run:markDoneSeen`.
4. On launch: if a run has `playbookReadyAt` and no `doneSeenAt`, queue the done screen.
5. OS notification click: focus window, route to done screen.

**Done when:** unit tests cover the event order (T20 before T21), stats with missing data, and the launch check.

## Phase 5: Done screen and redirect (about 3 hours)

1. Navigation guard (`useSafeToNavigate`): true only on the Research page with nothing ticked, or on Home with no dialog open and no focused or dirty input. Register Chat composer, Wiki editors and dialogs with it.
2. `DoneScreen.tsx` per REQ 3.3, in the Research page's main area: stats tiles, Biggest gap line, primary button, countdown cancelled by pointer, key or click, no countdown under reduced motion or screen reader, failed-steps note with Retry, Messaging Analysis note.
3. Redirect logic per REQ 3.1 and 3.2: done screen and auto-open when safe; otherwise toast plus sidebar "Ready" mark. Runs without T20: the "<Task> is done." toast with Open.
4. `FinishedWithProblems.tsx` per REQ 3.5.
5. Playbook landing: `from=run` first-look banner (once per workspace, stored in app state), `from=update` banner after v3.1 Keep, focus to H1. Hook the v3.1 review Keep action to open the first changed step.
6. Toast when Messaging Analysis finishes.

**Done when:** acceptance criteria 1 to 8 pass.

## Phase 6: Waiting state (about 5 hours)

1. Progress header on the Research page while a run is going or paused: progress bar, stage line map (task id to plain-words stage), time-left estimator in `src/renderer/src/lib/eta.ts` (median of finished durations, longest remaining path, concurrency, smoothing; unit-tested), running cost, Stop.
2. Findings column: `research:findings` IPC returns cards built in main from article front matter and fixed body lines per REQ 4.3 table, from disk (all runs); refresh on each `run:taskFinished`. Max 8 cards with "more findings". Source links kept.
3. Drop zone: copy to `inbox/`, record as pending files in app state, not passed to the running run. After playbook ready, offer "Update the playbook with them?" which opens the v3.1 regenerate preview.
4. Section preview: "Read it" opens `playbook?step=<id>&preview=1`, rendering from the section article; unwritten steps show "Still writing"; handle playbook ready while in preview per REQ 4.5.
5. Accessibility per REQ 7.

**Done when:** acceptance criteria 9, 10 and 11 pass; no AI usage is recorded by the waiting state.

## Phase 7: Check and ship (about 2 hours)

1. Run a real first run on a fresh workspace one step at a time, then Run all remaining, and a regenerate-and-keep on Shahed's workspace. Record all 20 acceptance criteria in `docs/v4.4-acceptance.md`.
2. Keyboard and VoiceOver pass on the Research page and done screen.
3. Em dash sweep, lint, typecheck, tests, CI green on all three platforms.
4. Update `CLAUDE.md` milestone line, version 0.5.0, release notes `docs/releases/v0.5.0.md`, and tag the release.

---

## Risks

| Risk | Mitigation |
|---|---|
| A step run alone gives thin output | Steps can't be ticked until what they depend on has output (REQ 4A.3) |
| Re-running a step overwrites the founder's edits | Done article steps only offer Regenerate, through the v3.1 preview |
| Auto-redirect interrupts the founder | Navigation guard; toast instead when not safe; countdown cancels on any input |
| Time estimate jumps around | Hide until 3 tasks done; smooth; never jump up more than 2 minutes |
| Finding cards show weak or missing data | Cards only from front matter fields that exist; skip a card rather than show placeholders |
| Files dropped mid-run expected to be used now | Clear copy under the drop zone: "We'll use these in your next update." |
| Heading normaliser drops a real heading | Match only first heading of a block, only on equal, prefix or contained-in match after normalising; "must not drop" tests |

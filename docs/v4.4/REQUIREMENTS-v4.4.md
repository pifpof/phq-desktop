# PositioningHQ Desktop: v4.4 Requirements

**Date:** 2026-10-19 (updated 2026-10-21: section 4A, choose what to run)
**Owner:** Shahed Khalili
**Starts from:** v4 (implemented).
**Reads with:** `REQUIREMENTS-v1.md` 3.5 (run behaviour, progress screen), `REQUIREMENTS-v3.1.md` (regenerate preview and review), `REQUIREMENTS-v4.md` (playbook page, deep links, 7.4 duplicate heading).
**Size:** about 24 focused hours (`IMPLEMENTATION_PLAN-v4.4.md`).

---

## 1. Why

Four things from using v4:

1. **The end of a run is flat.** The progress screen lists tasks, then the founder has to go and find the playbook. Finishing should feel like a moment, and should take them straight to the result.
2. **The wait is wasted.** A first run takes a while, and the founder spends it watching a task list. That time can show them what's being found and prepare them for what they'll get.
3. **Bug:** the value driver heading still appears twice (v4 7.4 fix did not cover every case).
4. **A full run is too big a first commitment.** The founder pays for every step before seeing whether any of it is useful. They should be able to run one step, look at the result in the Wiki, come back and run the next, or pick several, or run everything (added 2026-10-21).

Shahed's items 1 ("end of a run opens the playbook with a clear done screen") and 3 ("redirect to the playbook when positioning research completes") are one feature here: section 3.

## 2. Scope

**In:** a Research page where the founder chooses which steps to run (section 4A), a redesigned waiting state on that page (section 4), a done screen and automatic redirect to the playbook (section 3), the duplicate heading fix (section 5).

**Out:** changes to the research DAG (4A reads the existing dependencies), task prompts or cost model; hosted AI (see `DISCUSSION-hosted-ai-upsell.md`); new playbook content.

---

## 3. Done screen and redirect to the playbook

### 3.1 When it fires

The trigger is **"playbook ready"**: the assembly task (T20) finishes and the new playbook version is written. It does not wait for Messaging Analysis (T21), which keeps running in the background.

| Run type | Behaviour at playbook ready |
|---|---|
| Any run that includes "Publish the playbook" (onboarding "Run everything", "Run all remaining", or a selection that includes it) | Done screen, then redirect to the playbook Overview |
| "Regenerate playbook" / playbook-only re-run | Goes to the v3.1 keep-or-discard review as today. After **Keep**, redirect to the playbook at the first changed step with an "Updated" banner (3.4). No done screen. |
| A run without "Publish the playbook" (one or a few steps from the Research page) | No done screen, no redirect. Toast: "<Task> is done." (or "<N> steps are done.") with **Open** for a single step. The step's row on the Research page shows **Open**. |
| T20 failed or blocked | No redirect. "Research finished with problems" screen (3.5). |

Fires **once per run**. Store `playbookReadyAt` and `doneSeenAt` in the run state file.

### 3.2 Don't pull the rug

Redirect automatically only when the founder is on the Research page with no steps ticked, or on Home with nothing open.

If they are elsewhere (in Chat, in the Wiki, in a dialog, or typing in any field), don't navigate. Instead:
- show a toast: "Your playbook is ready." with **Open playbook**, staying until dismissed;
- put a teal dot and "Ready" on the Positioning Playbook item in the sidebar, replacing the progress indicator.

If the window isn't focused: the OS notification from v1 ("Your positioning playbook is ready.") stays. Clicking it focuses the app and shows the done screen. If they come back without clicking it, show the done screen on focus if `doneSeenAt` is empty and the redirect conditions above are met.

If the app was closed after playbook ready but before the founder saw it, show the done screen on next launch.

### 3.3 The done screen

Full main area of the Research page, centred (no new window). Leaving it marks `doneSeenAt`. Calm, not a celebration: no confetti, no sound.

- Teal check mark in a 56px circle.
- H1 (DejaVu Serif): "Your positioning playbook is ready"
- One line: "<Company>'s playbook, built from <N> sources."
- Three stat tiles: **Sections** (7), **Sources cited** (count of citation records used), **Competitors profiled** (count). Below them, muted: "Took <m> min · Cost $<x.xx>".
- If a Biggest gap exists (v4 6.3 rule; Messaging Analysis may not be ready, so use the priority order): an amber-labelled line "Biggest gap: <problem>".
- Primary button: **Open your playbook** (focused by default, Enter opens it).
- Secondary text link: "See research details" (the Research page task list, 4A).
- Auto-open: under the button, muted: "Opening in 5 seconds". Counts down, then opens the playbook. Any click, key press or pointer move on the screen cancels the countdown and changes the line to "Take your time." Under `prefers-reduced-motion` and when a screen reader is detected, there is no countdown; the button waits.
- If some non-playbook tasks failed or were skipped, add a slim note under the stats: "<N> research steps didn't finish. Your playbook used everything else." with **Retry them** (v1 single task retry). Still redirects.
- Messaging Analysis status, muted: "Messaging analysis is still running. We'll let you know." When it finishes: toast "Messaging analysis is ready." with **Open**.

### 3.4 Landing on the playbook

- Opens `playbook?step=overview&from=run` (v4 deep links).
- A one-time first-look banner above the step pills, accent background (`#f0f7f8`): "Start with At a glance, then work through the seven steps. Gaps show what to fix first." with **Dismiss**. Shown after the first full run only, and once per workspace.
- After a regenerate-and-keep: `playbook?step=<first changed step>&from=update` and a banner "Updated: <section names>. Version <N>." with **What changed** (opens the v3.1 Changes tab).
- Focus moves to the page H1 so screen readers announce the new page.

### 3.5 Finished with problems

When T20 failed or is blocked:

- Amber icon, H1 "Research finished with problems".
- One line: which steps failed and why, in plain words (from the existing error codes).
- **Retry failed steps** (primary), **See research details**.
- If the cause pauses the run (invalid key, no credit, spend cap), show the existing v1 message and Resume instead.

---

## 4. The waiting screen ("Building your positioning")

Replaces the v1 full-screen progress screen. While a run is going, the Research page (4A) shows the progress header (4.2) above its task list and the findings column (4.3) beside it. The task list stays visible (not collapsed): it is how the founder adds steps, and every row shows what it shows today (status, elapsed, cost, retry). "Continue in the background" is gone: the page sits in the main layout with the sidebar, so the founder can leave it at any time; the sidebar indicator stays.

### 4.1 Layout

```
┌────────────────────────────────────────────────────────────────┐
│ Research                                                       │
│ Build your positioning              [Run all remaining · ~$2.10]│
│ ████████████████░░░░░░░░░  Writing value drivers  $1.84 so far │
│ About 6 minutes left                              [Stop]        │
├──────────────────────────────────────────┬─────────────────────┤
│ READING AND FIRST RESEARCH               │ What we've found    │
│ ☑ Read your website   Done 21 Oct  Open  │ ┌─────────────────┐ │
│ ☐ Find competitors    About $0.20   Run  │ │ Your homepage   │ │
│ ☐ Profile competitors Needs: Find comp.  │ │ says "…"        │ │
│ WRITING YOUR PLAYBOOK                    │ └─────────────────┘ │
│ ◌ Market              Writing…           │ …                   │
│ …                                        │ Add proof [drop]    │
├──────────────────────────────────────────┴─────────────────────┤
│ 2 selected · about $0.40 to $0.60        [Clear] [Run selected] │
└────────────────────────────────────────────────────────────────┘
```

The progress header shows only while a run is going or paused. Under 1100px wide, the findings column stacks below the task list.

### 4.2 Progress header

- Progress bar from completed task count (tasks, not time).
- Stage line in plain words, from the running task's stage: "Reading your website", "Researching competitors", "Writing <section name>", "Putting your playbook together", "Checking your messaging".
- **Time left:** after at least 3 tasks are done, estimate from the median duration of finished tasks times the remaining tasks on the longest remaining dependency path, divided by current concurrency; round to the minute; show "About <n> minutes left" or "Almost done" under 1 minute. Before 3 tasks are done, show nothing. Never show a number that goes up by more than 2 minutes at once; smooth it.
- Running cost, as today.

### 4.3 What we've found so far (main column)

Cards that appear as tasks finish, newest at the top, each with a fade-in (none under reduced motion). **No model calls**: every card reads from the article's front matter or a fixed line of its body, the same way the v4 overview does. Each card links to the article in the Wiki ("Open in Wiki").

| After task | Card |
|---|---|
| Website crawl | "We read <N> pages of <domain>." |
| Website positioning | "Your homepage says" + the captured hero line, quoted |
| Company research | "<Company> in one line" + the company article `summary` |
| Competitor tasks | "<N> competitors found" + names as chips; each chip shows the competitor's category term on hover |
| Public proof | "<N> reviews and mentions found" + the strongest quote, attributed with its source link |
| Each playbook section (T13 to T19) | "<Section> is written" + its first Key takeaway (v4 7.1), and "Read it" opening that step of the playbook in a preview state (see 4.5) |

Rules:
- Private material never appears here unless the card is about the founder's own files, which none of the above are.
- If a card's data is missing (task skipped or failed), don't show the card.
- Keep at most 8 cards; older ones collapse into "<N> more findings".
- Sources stay attached: the hero quote and review quote show their link, per rule 15.

### 4.4 Under the findings

The seven-step "What you'll get" list is dropped (4A): the task list's "Writing your playbook" group shows the same seven steps with their states, using the v4 step labels. Under that group's heading, one line: "Each step ends with key takeaways and, where needed, a gap to close."

- **Add proof while you wait:** a drop zone for customer quotes, case studies and reviews (same file types and copy-to-`inbox/` rules as the v1 drop zones). Files added during a run are **not** fed into the running tasks. After the run, the done screen and the playbook show: "<N> new files added. Update the playbook with them?" which starts the v3.1 regenerate preview. This keeps the run's inputs fixed and the isolation rule untouched.

### 4.5 Reading a section early

"Read it" on a section card opens the playbook page on that step with a top banner: "Preview. Your playbook is still being put together." Section content comes from the finished section article, rendered with the v4 section renderer. Other steps that aren't written show "Still writing" in place of content. When playbook ready fires while the founder is in preview, don't show the done screen over them: replace the banner with "Your playbook is ready." and a **See At a glance** link, and mark `doneSeenAt`.

### 4.6 Leaving and coming back

The founder can open any other view while a run is going. Coming back to the Research page (sidebar item or indicator) shows the current state with all cards so far. The findings column reads from disk, so it also shows cards from earlier runs: it is "what we've found", not "what this run found".

---

## 4A. Choose what to run (added 2026-10-21)

### 4A.1 The Research page

A new sidebar item **Research** (between Wiki and Positioning Playbook). It replaces the full-screen progress route: every "go to progress" in the app opens this page instead.

- Eyebrow "Research", H1 "Build your positioning".
- Summary line when idle: "<N> of <M> steps have output. Run one, a few, or all." When nothing has run: "Nothing has run yet. Start with one step, or run everything."
- **Run all remaining** button (top right): ticks every step that has no output and runs them. Shows the estimate: "Run all remaining · about $<x>". Hidden when every step has output.
- The task list, grouped by stage with the existing stage titles. Competitor profiles stay one row (the group); its children show under it only while running or after a failure.

### 4A.2 A row

| Part | Content |
|---|---|
| Checkbox | Ticks the step for **Run selected** |
| Title and line | The task title, and one plain line on what it produces ("Finds 5 to 8 competitors from the web.") from the task list in main |
| Status | "Not run yet", "Done <date>", "Skipped <date>" (with the reason), "Failed" with **Retry**, "Running", "Waiting", "Needs: <step titles>" |
| Cost | For a step with no output: "About $<x>" from the existing estimate per task kind (competitor profiles: per competitor times the count) |
| Actions | **Run** (runs this one step now), **Open** when it has output |

Status comes from disk, not from one run: a step is **done** when its output passes the existing output check (the receipt is there and every file it lists exists); **skipped** when its last run skipped it for a reason other than stopping (no files added, web search off) and it has no output; **failed** when its last run failed it and it has no output; otherwise **not run**. No model call.

**Open** goes to where the output lives: the first wiki page the step wrote (Wiki pane), the playbook page, or the Messaging Analysis page. Steps that write only app-state drafts (website positioning, competitor discovery) open the wiki page that used them when there is one; otherwise they show no Open.

### 4A.3 Which steps can be ticked

- A step can be ticked or run only when each step it depends on is done or skipped, or is ticked in the same selection, or is in the run that is going. Otherwise the checkbox and Run are disabled and the row says "Needs: <titles of the missing steps>".
- Unticking a step unticks every ticked step that needs it.
- **Done steps that write wiki articles are not ticked or run from here.** Running them again would overwrite pages the founder may have changed, so their row shows **Regenerate**, which opens the v3.1 preview for the first page the step wrote (rule 25). Done steps that write a new dated source, a new output version, or app-state drafts only (read your website, read your files, find competitors, website positioning, publish the playbook, analyse your messaging) can be ticked again and show **Run again**.
- The selection lives in the page only (not saved). It clears when a run starts.

### 4A.4 Running

- **Run selected** (sticky bar at the bottom, shown when at least one step is ticked): "<N> selected · about $<low> to $<high>", **Clear**, **Run selected**. Starts a scoped run of exactly the ticked steps (the existing `only` scope). Nothing else runs.
- **Run** on a row is the same with one step.
- While a run is going, ticking more steps and pressing **Add to this run** adds them to the run that is going (same budget cap, same run file). A step already in the run can't be ticked.
- Budget cap: the bar shows "Pauses at $<cap>" with **Change**. The default is the cap of the most recent run, or $5 for a new workspace. The cap is per run, as today.
- After a run, each row's status updates from disk. The founder opens a result, reads it, comes back and runs the next step.

### 4A.5 Onboarding

The last onboarding step keeps the full-run estimate and the budget field. Its buttons become **Run everything** (primary: as today, a full run, then the Research page shows its progress), **Choose steps** (finishes onboarding and opens the Research page with nothing running), and **Not now** (or "Use what is there" for a skill-pack vault).

### 4A.6 Rules kept

- Isolation is unchanged: a scoped run uses the same task definitions and inputs; steps that depend on missing outputs can't be ticked.
- Nothing regenerates a wiki page without the v3.1 preview (rule 25).
- The "Regenerate playbook" preset and per-page Regenerate work as today.
- One run at a time per workspace. Adding steps joins the run that is going.

---

## 5. Bug: value driver heading appears twice

v4 7.4 changed assembly to drop an article H1 that matches the section heading and to strip "Value Driver:" prefixes. The heading still repeats. Likely causes, to confirm in Phase 0 on Shahed's workspace:

1. **Old versions.** Playbook output files are immutable. Any version assembled before v4 still contains the duplicate, and the v4 page renders from the output file.
2. **Card header plus body heading.** The expandable card shows the driver title in its header, and the card body begins with the article's own heading (H2 or H3, for example "Value Driver 1: Faster audits" or "1. Faster audits").
3. **Section heading plus parent heading.** The section H2 "Value Drivers" is followed by the parent article's H1 "Value Drivers" or "Value Drivers for <Company>".

### 5.1 Fix

Fix it in **both** places, so new and old versions render correctly:

- **Shared normaliser** `src/shared/headings.ts`: `normalizeHeading(text)` lowercases, trims, removes Markdown emphasis, removes leading numbering (`01`, `1.`, `1)`, `#1`), removes the prefixes `Value Driver`, `Value Drivers`, `Driver`, `Moat`, `Competitor` with an optional number and a colon, dash or period, removes "for <Company>" at the end, and collapses whitespace.
- **Render time (v4 renderer):** in a section, drop the first heading block of the body if its normalised text equals, starts with or is contained in the normalised section title. In a card, drop the first heading block of the card body if it matches the card title the same way. Applies to Value Drivers, Moats and Competitors cards and to every section.
- **Assembly time:** use the same normaliser in `assemble-playbook.ts` so new output files are clean.
- **PDF and Copy as markdown** use the render path, so they are fixed too.
- Never rewrite immutable output files.

### 5.2 Tests

Golden-file and unit tests for each shape: H1 equal to the section, H1 "Value Drivers for Acme", H2 "Value Driver 1: X" inside a card titled "X", "01 X", "**Value Driver:** X", a moat card, a competitor card, and a real pre-v4 output file from Shahed's workspace (Phase 0). A heading that differs in meaning ("How we measured it") must not be dropped.

---

## 6. Copy

All strings above are final unless Shahed edits them. No em dashes. Numbers as digits. "PositioningHQ" one word.

## 7. Accessibility

- Progress bar has `role="progressbar"` with value and text.
- New finding cards and the stage line announce politely (`aria-live="polite"`), at most one announcement every 10 seconds.
- Done screen: focus moves to the H1, then the primary button is next in tab order. Countdown text is not announced each second.
- The pulse and fade-ins stop under `prefers-reduced-motion`.

## 8. Acceptance criteria

1. On a first full run, when T20 finishes and the founder is on the waiting screen, the done screen appears with correct stats, counts down 5 seconds and opens the playbook on At a glance with the first-look banner.
2. Moving the pointer or pressing a key on the done screen stops the countdown.
3. With Chat open and text in the composer at playbook ready, the app does not navigate; a toast and a sidebar "Ready" mark appear.
4. With the window unfocused, the OS notification appears; clicking it opens the done screen.
5. Quitting after playbook ready but before seeing it, then relaunching, shows the done screen once.
6. Messaging Analysis still running at playbook ready shows the note, then a toast when it finishes.
7. If T20 fails, no redirect; the "finished with problems" screen offers Retry failed steps.
8. Regenerate then Keep opens the playbook on the first changed step with the "Updated" banner.
9. The waiting screen shows a stage line, progress bar, time left after 3 tasks, and finding cards for each completed task type, each linking to its Wiki article, with no model calls (verified by usage totals).
10. "Read it" on a finished section opens a preview of that step; unfinished steps show "Still writing".
11. Files dropped during a run are copied to `inbox/`, not used by the run, and offered as an update afterwards.
12. The value driver heading appears once in the page, the cards, the PDF and Copy as markdown, for a new version and for a pre-v4 version.
13. The Research page lists every step with its status from disk; a step whose dependencies have no output can't be ticked and says what it needs; unticking a step unticks what needs it.
14. **Run** on one step runs only that step; afterwards its row says "Done <date>" with **Open**, which shows its output; the founder comes back and runs another step.
15. Ticking several steps and **Run selected** runs exactly those; the estimate in the bar matches the per-task estimate.
16. **Run all remaining** runs every step without output and ends with the done screen.
17. While a run is going, **Add to this run** adds ticked steps to it.
18. A done step that writes wiki articles shows **Regenerate** (opens the v3.1 preview) and can't be ticked.
19. Onboarding offers **Run everything**, **Choose steps** and **Not now**.
20. Lint, typecheck, tests green; isolation test unchanged and passing.

## 9. Open items (owner: Shahed)

| # | Item |
|---|---|
| 1 | Countdown length (5 seconds proposed), or no auto-open at all and a button only |
| 2 | Confirm the trigger is playbook ready (T20), not the very end of the run (T21) |
| 3 | A screenshot of the duplicate heading as it appears now, to confirm which cause in 5 |
| 4 | The one-line description for each step on the Research page (4A.2): drafted in code, to review |

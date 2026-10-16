# v1 acceptance (REQUIREMENTS-v1 section 9)

Checked 2026-10-16 on macOS (Apple Silicon), with Shahed's real Anthropic key and the default model from the live list (Claude Sonnet 5.5). Two real companies were run end to end: **Parallel79** (parallel79.com) and **Plausible Analytics** (plausible.io). Other checks used the built app with a fake API (Playwright) and the unit tests (223 passing).

## Real runs

| Run | Result | Time | Cost |
|---|---|---|---|
| Parallel79, full research | done, 30 of 30 tasks | 6.9 min | $3.60 |
| Parallel79, Regenerate playbook (v2) | done, 10 tasks | 3.1 min | $0.57 |
| Parallel79, chat "What is our positioning statement?" | answered from Section 5 | seconds | about $0.03 |
| Plausible Analytics, full research | cancelled at 26 of 30 by a folder change (see note) | 5.4 min | $3.93 |
| Plausible Analytics, last 4 tasks as a scoped re-run | done | 1.9 min | $0.34 |

Total spend for v1 QA: about **$8.50**. The estimate shown before starting was $1.50 to $5.26; both full runs landed inside it.

## Criteria

| # | Criterion | Result |
|---|---|---|
| 1 | Empty folder runs onboarding 2.2 to 2.7; completed workspace goes Home; skill-pack vault detected and prefilled | **Pass** (fake API end to end, unit tests for all five folder states) |
| 2 | Unreachable website caught on the company step | **Pass** |
| 3 | Get updates and Join the community open the browser; nothing is sent by the app | **Pass**. Both URLs are still placeholders in `src/shared/links.ts` |
| 4 | Dropped files copied into the right `inputs/` folders and extracted | **Pass** for copy, limits and extraction (picker, fake API, unit tests). Drag and drop itself: **check by hand** |
| 5 | Cost range and time on the start card; budget cap pauses | **Pass** (real estimate $1.50 to $5.26; budget dialog checked in the app) |
| 6 | Research completes end to end, writes every file in section 5; stage 1 runs in parallel | **Pass** (real run: 30 tasks, 3 AI tasks plus local tasks at once) |
| 7 | Concurrency 6 on a low-limit key survives 429s | **Unit tests only**. Neither real run hit a 429, so live backoff was not observed |
| 8 | Quit mid-run, relaunch, Resume skips finished tasks | **Pass** (built app, unit tests) |
| 9 | Web search off (simulated 400): web tasks skipped, playbook still built, clear notice | **Pass** (service tests with the simulated 400 and with capabilities off; dialog built). Not seen live: web search is on for this account |
| 10 | Playbook has seven sections, contents and a `versions/` copy; re-run makes v2 without touching v1 | **Pass** (real) |
| 11 | Messaging Analysis shows five score tiles with quoted evidence and five fixes | **Pass** for both companies (real) |
| 12 | Training Data lists every output with working source links; pasting a tagline updates the file | **Pass** (real research files carry 6 to 43 sources each) |
| 13 | Editing the playbook elsewhere updates the app within 2 seconds | **Pass** (about 0.8 s) |
| 14 | Workspace chat answers "What is our positioning statement?" from the playbook | **Pass** (real) |
| 15 | Isolation unit test passes; no task with user files has web tools | **Pass** (graph test, start-of-run check, executor check, full-pipeline marker test) |
| 16 | No em dashes in UI strings or generated documents | **Pass** (none in `src/`; none in 104 documents from both real runs, after cleaning crawled pages too) |
| 17 | CI green on macOS, Windows and Linux | **Not run**: the repo is not on GitHub yet |

## Privacy sweeps

- The API key appears in no workspace file, no app data (settings, storage) and not in the main log (`~/Library/Logs/PositioningHQ/main.log`). The key is stored only in `secrets.bin` through `safeStorage`.
- The main log holds run starts, ends and spend, and our own error messages. No file content and no model output.

## Bugs found by the real runs, fixed

- A tagline containing `|` broke the social table columns, so a found profile read as "Not found". The table reader now handles escaped and stray pipes, and the skill asks for `\|`.
- Chat usage showed "15 in": tokens served from the prompt cache were not counted. They are now.
- A crawled page used em dashes as empty table cells. Crawled pages and extracted file text now follow the copy rule.
- Changing the workspace folder during a run silently cancelled it (this is what stopped the Plausible run). Settings now disables "Change folder" while research runs, and the main process refuses it.

## Still open

- Real sign-up form and community URLs (REQUIREMENTS-v1 open items 1 and 2).
- Review of the Messaging Analysis prompt and scoring rubric (open item 4): `docs/v1/review/messaging-analysis-prompt.md`.
- CI on GitHub, and drag and drop by hand.

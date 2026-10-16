# v0 acceptance (REQUIREMENTS 9)

Checked 2026-10-16 on macOS (Apple Silicon). "Fake API" means a local stand-in for the Anthropic API reached through `ANTHROPIC_BASE_URL`, driven with Playwright. Items marked **Shahed** need a real key, real network conditions or CI, and are still open.

| #   | Criterion                                                              | Result                                                                                                                       |
| --- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | `npm install` then `npm run dev`                                       | Not run by hand. Production build and packaged app verified. **Shahed**                                                      |
| 2   | `npm run build:mac` produces a working `.dmg`                          | Pass. arm64 and x64 DMGs build; the packaged arm64 app launches and verifies a key. Install from the DMG by hand: **Shahed** |
| 3   | First launch, wizard, chat with a real key                             | Pass against the fake API. Real key: **Shahed**                                                                              |
| 4   | Wrong key, no credit, offline messages                                 | Invalid key and no credit pass against the fake API. Wi-Fi off: **Shahed**                                                   |
| 5   | Model dropdown from live list, newest Sonnet default, no hardcoded IDs | Pass (default rule unit tested; no model IDs in `src/`)                                                                      |
| 6   | Default workspace marker created; existing workspace recognised        | Pass                                                                                                                         |
| 7   | Streaming, Stop, markdown, usage                                       | Pass                                                                                                                         |
| 8   | Relaunch goes to Chat; missing workspace routes to Workspace           | Pass (also: missing key routes to Connect)                                                                                   |
| 9   | Settings: Disconnect, Replace key, model change                        | Pass                                                                                                                         |
| 10  | No trace of the key in logs, settings, storage                         | Pass for userData (grep found nothing; `secrets.bin` is encrypted). DevTools sweep by hand: **Shahed**                       |
| 11  | Renderer makes no network requests                                     | Pass (no non-local requests observed)                                                                                        |
| 12  | Side by side with parallel79.com                                       | Tokens, fonts and button copied from the site. Visual comparison: **Shahed**                                                 |
| 13  | No em dashes in UI strings                                             | Pass (grep of `src/`)                                                                                                        |
| 14  | CI green on three platforms                                            | Workflow written. Not run: the repo is not on GitHub yet. **Shahed**                                                         |
| 15  | lint, typecheck, test                                                  | Pass                                                                                                                         |

Not yet done: Windows and Linux builds have not been run anywhere.

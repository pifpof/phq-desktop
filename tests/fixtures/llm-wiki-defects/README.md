# llm-wiki defect fixtures

Copied unchanged from llm-wiki v0.25.1 (`tests/fixtures/golden-wiki` and `tests/fixtures/defects/*`),
https://github.com/nvk/llm-wiki, MIT licence (see `LICENSE`).

`tests/unit/conformance.test.ts` runs the app's checker on each one and asserts it reports the
same findings as llm-wiki's own lint. Lint them with `LLM_WIKI_TODAY=2026-01-10`: the golden
wiki's articles were verified in early January 2026.

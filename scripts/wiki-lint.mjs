#!/usr/bin/env node
// Runs the official llm-wiki lint, at the pinned tag, on one or more wiki folders.
//   npm run wiki:lint -- tests/fixtures/phq-wiki-min
// Clones llm-wiki into .cache/ on first use. Needs git and Python 3.9 or newer.
// Set LLM_WIKI_TODAY=YYYY-MM-DD to fix the date used by the freshness check.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The pin. Change it deliberately, with docs/v2-assumptions.md and the CI job.
export const LLM_WIKI_TAG = 'v0.25.1'
export const LLM_WIKI_COMMIT = '95a042c68998559305bc69ac8c482c4e1a415ad3'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cache = process.env.LLM_WIKI_DIR || join(repoRoot, '.cache', `llm-wiki-${LLM_WIKI_TAG}`)
const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3')

function ensureClone() {
  if (!existsSync(join(cache, 'scripts', 'llm-wiki'))) {
    mkdirSync(dirname(cache), { recursive: true })
    execFileSync(
      'git',
      [
        'clone',
        '--quiet',
        '--depth',
        '1',
        '--branch',
        LLM_WIKI_TAG,
        'https://github.com/nvk/llm-wiki',
        cache
      ],
      { stdio: 'inherit' }
    )
  }
  const head = execFileSync('git', ['-C', cache, 'rev-parse', 'HEAD']).toString().trim()
  if (head !== LLM_WIKI_COMMIT) {
    console.error(`llm-wiki at ${cache} is ${head}, expected ${LLM_WIKI_COMMIT} (${LLM_WIKI_TAG}).`)
    process.exit(2)
  }
}

const wikis = process.argv.slice(2)
if (!wikis.length) {
  console.error('Usage: npm run wiki:lint -- <wiki folder> [more folders]')
  process.exit(2)
}
ensureClone()
let failed = false
for (const wiki of wikis) {
  const r = spawnSync(
    python,
    [join(cache, 'scripts', 'llm-wiki'), 'lint', '--fail-on', 'warning', resolve(wiki)],
    { stdio: 'inherit' }
  )
  if (r.status !== 0) failed = true
}
process.exit(failed ? 1 : 0)

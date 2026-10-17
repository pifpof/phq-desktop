import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { createExecutor } from '../../src/main/research/executor'
import { RunSources } from '../../src/main/ingest/citations-to-raw'
import { parsePricing } from '../../src/main/research/pricing'
import type { TaskDef } from '../../src/main/research/types'
import type { Provider, RunTaskArgs, RunTaskResult } from '../../src/main/providers/types'
import { emptyProfile } from '../../src/shared/profile'

const pricing = parsePricing(
  JSON.parse(readFileSync(join(__dirname, '../../resources/pricing.json'), 'utf8'))
)
const usage = {
  inputTokens: 1000,
  outputTokens: 100,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  webSearchRequests: 0,
  webFetchRequests: 0,
  maxRequestInputTokens: 1000,
  requests: 1
}

function setup(answers: string[]) {
  const root = mkdtempSync(join(tmpdir(), 'phq-exec-'))
  const wikiRoot = mkdtempSync(join(tmpdir(), 'phq-exec-wiki-'))
  mkdirSync(join(root, 'memory/research/website'), { recursive: true })
  writeFileSync(
    join(root, 'memory/research/website/index.md'),
    '---\nstatus: draft\nraw_pages:\n  - raw/articles/2026-10-17-acme-example-home.md\n---\n# Website crawl\n\n- LinkedIn: https://linkedin.com/company/acme'
  )
  mkdirSync(join(wikiRoot, 'raw/articles'), { recursive: true })
  writeFileSync(
    join(wikiRoot, 'raw/articles/2026-10-17-acme-example-home.md'),
    '---\ntitle: "Home"\nsource: "https://acme.example/"\ntype: articles\ningested: 2026-10-17\ntags: [own-site]\nsummary: "Home."\n---\n\nHOME PAGE TEXT'
  )
  const calls: RunTaskArgs[] = []
  const provider = {
    runTask: async (a: RunTaskArgs): Promise<RunTaskResult> => {
      calls.push(a)
      return {
        text: answers[Math.min(calls.length - 1, answers.length - 1)],
        citations: [],
        consulted: [],
        sources: [],
        usage,
        stopReason: 'end_turn',
        truncated: false
      }
    }
  } as unknown as Provider
  const crawl: TaskDef = {
    id: 'crawl-website',
    title: 'Crawl',
    stage: 1,
    kind: 'local',
    dependsOn: [],
    local: 'crawl',
    web: false,
    output: () => 'memory/research/website/index.md'
  }
  const profile = emptyProfile()
  profile.company = {
    name: 'Acme',
    website: 'https://acme.example',
    productName: '',
    description: '',
    competitors: []
  }
  const exec = createExecutor({
    root,
    wikiRoot,
    sources: new RunSources(wikiRoot, join(root, 'sources.json'), '2026-10-17'),
    profile,
    runId: 'r1',
    company: 'Acme',
    model: 'claude-sonnet-5-5',
    provider,
    getKey: () => 'k',
    pricing,
    readSkill: () => 'You are a test skill.',
    local: {},
    tasks: [crawl]
  })
  return { root, calls, exec }
}

const task = (over: Partial<TaskDef>): TaskDef => ({
  id: 't',
  title: 'T',
  stage: 2,
  kind: 'synthesis',
  dependsOn: ['crawl-website'],
  skill: 's',
  instruction: 'Go.',
  inputs: { outputs: ['crawl-website'], inputCategories: [] },
  web: false,
  output: () => 'memory/out.md',
  ...over
})
const promptText = (a: RunTaskArgs) => [...a.system, ...a.user].map((b) => b.text).join('\n')

describe('executor', () => {
  it('shows a synthesis task every crawled page, but a web task only the crawl index', async () => {
    const s = setup(['# Done'])
    await s.exec(task({}), new AbortController().signal)
    await s.exec(task({ web: { search: { maxUses: 1 } } }), new AbortController().signal)
    expect(promptText(s.calls[0])).toContain('HOME PAGE TEXT')
    expect(promptText(s.calls[1])).not.toContain('HOME PAGE TEXT')
    expect(promptText(s.calls[1])).toContain('linkedin.com/company/acme')
  })

  it('retries once when the format check fails, explaining the problem, and keeps the fixed answer', async () => {
    const s = setup([
      'no table here',
      '| Network | URL | Status |\n|---|---|---|\n| LinkedIn | x | Found |'
    ])
    const out = await s.exec(
      task({ validate: (t) => (t.includes('| Network') ? null : 'The table is missing.') }),
      new AbortController().signal
    )
    expect(s.calls).toHaveLength(2)
    expect(s.calls[1].user[s.calls[1].user.length - 1].text).toContain(
      'not in the required format: The table is missing.'
    )
    expect(out.note).toBeUndefined()
    expect(readFileSync(join(s.root, 'memory/out.md'), 'utf8')).toContain(
      '| LinkedIn | x | Found |'
    )
    // Both calls are paid for.
    expect(out.costUsd).toBeCloseTo((2 * (1000 * 2 + 100 * 10)) / 1e6, 8)
  })

  it('saves the answer with a note when the retry is still wrong', async () => {
    const s = setup(['still wrong'])
    const out = await s.exec(
      task({ validate: () => 'The table is missing.' }),
      new AbortController().signal
    )
    expect(s.calls).toHaveLength(2)
    expect(out.note).toBe('Saved as written: the answer did not match the expected format.')
    expect(readFileSync(join(s.root, 'memory/out.md'), 'utf8')).toContain('still wrong')
  })

  it('does not retry an answer that passes', async () => {
    const s = setup(['| Network | URL | Status |'])
    await s.exec(task({ validate: () => null }), new AbortController().signal)
    expect(s.calls).toHaveLength(1)
  })
})

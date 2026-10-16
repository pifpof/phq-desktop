import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import matter from 'gray-matter'
import { describe, expect, it } from 'vitest'
import {
  finalizeDocument,
  replaceEmDashes,
  sourcesSection,
  stripOuterFence
} from '../../src/main/research/postprocess'
import { isUnfinished, latestRun, loadRun, saveRun } from '../../src/main/research/run-store'
import type { RunView } from '../../src/shared/research'

const D = '—'

describe('replaceEmDashes', () => {
  it('uses a comma in prose, a colon in headings, and leaves code alone', () => {
    const input = `# Step 2 ${D} Product\n\nFast ${D} and cheap${D}really.\n\n- ${D} leading dash\n\n\`\`\`\nkeep ${D} this\n\`\`\`\n\n| a | b |\n|---|---|\n| ${D} | x ${D} y |`
    const out = replaceEmDashes(input)
    expect(out).toContain('# Step 2: Product')
    expect(out).toContain('Fast, and cheap, really.')
    expect(out).toContain('- leading dash')
    expect(out).toContain(`keep ${D} this`)
    expect(out).toContain('| n/a |')
    expect(out).toContain('| x, y |')
    expect(out.replace(/```[\s\S]*?```/g, '')).not.toContain(D)
  })
  it('leaves en dashes and hyphens', () => {
    expect(replaceEmDashes('2020–2024 and well-known')).toBe('2020–2024 and well-known')
  })
})

describe('stripOuterFence', () => {
  it('unwraps a document the model wrapped in a markdown fence', () => {
    expect(stripOuterFence('```markdown\n# Title\n\nBody\n```')).toBe('# Title\n\nBody')
    expect(stripOuterFence('```md\n# T\n```')).toBe('# T')
  })
  it('keeps real code blocks and unbalanced wrappers', () => {
    expect(stripOuterFence('# T\n\n```js\nx\n```')).toBe('# T\n\n```js\nx\n```')
    expect(stripOuterFence('```markdown\n# T\n\n```js\nx\n```')).toBe(
      '```markdown\n# T\n\n```js\nx\n```'
    )
    expect(stripOuterFence('```markdown\n# T\n\n```js\nx\n```\n```')).toBe('# T\n\n```js\nx\n```')
  })
})

describe('finalizeDocument', () => {
  const base = {
    title: 'Fallback',
    task: 't1',
    runId: 'r1',
    model: 'm',
    inputs: ['a.md'],
    now: new Date('2026-10-16T10:00:00Z')
  }
  it('writes front matter, takes the title from the H1, and appends sources for web tasks', () => {
    const doc = matter(
      finalizeDocument({
        ...base,
        body: `# Real Title\n\nText ${D} more`,
        web: true,
        citations: [{ url: 'https://a.com', title: 'A [x]' }],
        consulted: []
      })
    )
    expect(doc.data).toEqual({
      title: 'Real Title',
      task: 't1',
      run_id: 'r1',
      model: 'm',
      created: '2026-10-16T10:00:00.000Z',
      status: 'draft',
      inputs: ['a.md'],
      sources: ['https://a.com']
    })
    expect(doc.content).toContain('Text, more')
    expect(doc.content.trim().endsWith('- [A x](https://a.com)')).toBe(true)
  })
  it('adds no Sources section for tasks without web tools, and flags truncation', () => {
    const doc = matter(
      finalizeDocument({
        ...base,
        body: 'No heading here',
        web: false,
        citations: [],
        consulted: [],
        truncated: true
      })
    )
    expect(doc.content).not.toContain('Sources')
    expect(doc.data).toMatchObject({ title: 'Fallback', sources: [], truncated: true })
  })
  it('falls back to consulted pages, then to saying there were none', () => {
    expect(sourcesSection([], [{ url: 'https://b.com', title: 'B' }])).toContain(
      'does not cite them one by one'
    )
    expect(sourcesSection([], [])).toContain('No sources were returned.')
  })
})

describe('run store', () => {
  const run = (id: string, startedAt: number, status: RunView['status']): RunView => ({
    id,
    status,
    pause: null,
    model: 'm',
    concurrency: 3,
    budgetCapUsd: 5,
    spentUsd: 1.5,
    skipWeb: false,
    startedAt,
    endedAt: null,
    scope: null,
    tasks: [
      {
        id: 'a',
        title: 'A',
        stage: 1,
        status: 'done',
        parent: null,
        local: false,
        web: false,
        attempts: 1,
        startedAt: 1,
        endedAt: 2,
        costUsd: 1.5,
        error: null,
        note: null,
        output: 'a.md'
      }
    ]
  })
  it('saves atomically and loads the latest run, ignoring corrupt files and temp files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'phq-runs-'))
    await saveRun(root, run('old', 1000, 'done'))
    await saveRun(root, run('new', 2000, 'paused'))
    mkdirSync(join(root, '.positioninghq/runs'), { recursive: true })
    writeFileSync(join(root, '.positioninghq/runs/broken.json'), '{nope')
    writeFileSync(join(root, '.positioninghq/runs/zzz.json.tmp'), 'half written')
    expect(
      readdirSync(join(root, '.positioninghq/runs')).filter((f) => f.endsWith('.tmp'))
    ).toEqual(['zzz.json.tmp'])
    expect((await latestRun(root))?.id).toBe('new')
    expect(await loadRun(root, 'old')).toMatchObject({ status: 'done', spentUsd: 1.5 })
    expect(await loadRun(root, 'missing')).toBeNull()
    expect(isUnfinished((await latestRun(root))!)).toBe(true)
  })
  it('returns null when there are no runs', async () => {
    expect(await latestRun(mkdtempSync(join(tmpdir(), 'phq-runs-')))).toBeNull()
  })
})

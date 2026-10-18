import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkWiki } from '../../src/main/wiki/conformance'
import { fixWiki } from '../../src/main/wiki/fix'
import { addTagInPlace, parseDoc } from '../../src/main/wiki/frontmatter'
import { runLintPort } from '../../src/main/wiki/lint-port'

const DEFECTS = resolve(__dirname, '../fixtures/llm-wiki-defects')
const PHQ_MIN = resolve(__dirname, '../fixtures/phq-wiki-min')
const LINT = resolve(__dirname, '../../.cache/llm-wiki-v0.25.1/scripts/llm-wiki')
const GOLDEN_DAY = '2026-01-10'
const PHQ_DAY = '2026-10-17'

const dirs: string[] = []
async function copyOf(src: string): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'phq-conf-'))
  dirs.push(d)
  await cp(src, d, { recursive: true })
  return d
}
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true })
})

interface Official {
  severity: string
  path: string
  message: string
}

function official(root: string, today: string): Official[] | null {
  if (!existsSync(LINT)) return null
  const r = spawnSync('python3', [LINT, 'lint', '--json', root], {
    env: { ...process.env, LLM_WIKI_TODAY: today },
    encoding: 'utf8'
  })
  if (r.error || !r.stdout) return null
  return (JSON.parse(r.stdout) as { issues: Official[] }).issues
}

const key = (f: { severity: string; path: string; message: string }): string =>
  `${f.severity} | ${f.path} | ${f.message}`

/** What each defect fixture must produce, so the test means something without Python. */
const EXPECTED: Record<string, string[]> = {
  'golden-wiki': [],
  'bad-frontmatter': [
    "critical | raw/articles/2026-01-01-sample-article.md | Invalid type: 'invalid'; expected one of articles, data, notes, papers, repos."
  ],
  'broken-link': [
    'warning | wiki/concepts/sample-concept.md | Markdown link points to missing file: ../references/nonexistent.md.'
  ],
  'broken-inline-body-link': [
    'warning | wiki/concepts/sample-concept.md | Markdown link points to missing file:'
  ],
  'dangling-source-ref': [
    'warning | wiki/concepts/sample-concept.md | Source reference does not resolve: raw/articles/2026-01-03-deleted.md.'
  ],
  'dead-index-entry': [
    'warning | raw/articles/_index.md | Index links to missing file: nonexistent.md.'
  ],
  'missing-index': ['critical | raw/articles/_index.md | Required _index.md is missing.'],
  'missing-sources': [
    'warning | wiki/concepts/sample-concept.md | Compiled article is missing sources and has no compiled-from exemption.'
  ],
  'misplaced-file': [
    'critical | wiki/references/sample-concept.md | File is in the wrong directory; expected wiki/concepts/sample-concept.md.'
  ],
  'unknown-file': ['warning | raw/stray.txt | Unexpected file or directory in raw/.'],
  'stale-index': [
    'warning | raw/articles/2026-01-03-unlisted.md | Required file entry is missing from directory index.'
  ]
}

describe('llm-wiki lint port', () => {
  it('covers every copied fixture', async () => {
    const names = (await readdir(DEFECTS, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
    expect(names).toEqual(Object.keys(EXPECTED).sort())
  })

  for (const [name, expected] of Object.entries(EXPECTED)) {
    it(`flags the same defects as llm-wiki: ${name}`, async () => {
      const root = join(DEFECTS, name)
      const ours = (await runLintPort(root, GOLDEN_DAY)).findings.map(key)
      for (const e of expected)
        expect(
          ours.some((k) => k.startsWith(e)),
          e
        ).toBe(true)
      if (name === 'golden-wiki')
        expect(ours.filter((k) => !k.startsWith('suggestion') && !k.startsWith('info'))).toEqual([])

      const theirs = official(root, GOLDEN_DAY)
      if (theirs) expect([...ours].sort()).toEqual(theirs.map(key).sort())
    })
  }

  it('agrees with llm-wiki on the PositioningHQ fixture, today and once it has aged', async () => {
    for (const day of [PHQ_DAY, '2026-12-01', '2027-11-01']) {
      const ours = (await runLintPort(PHQ_MIN, day)).findings.map(key).sort()
      const theirs = official(PHQ_MIN, day)
      if (theirs) expect(ours).toEqual(theirs.map(key).sort())
      if (day === PHQ_DAY) expect(ours).toEqual([])
    }
  })
})

describe('conformance check', () => {
  it('passes the PositioningHQ fixture with no findings', async () => {
    const report = await checkWiki(PHQ_MIN, PHQ_DAY)
    expect(report.findings).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('reads files saved with Windows line endings as llm-wiki does', async () => {
    const root = await copyOf(PHQ_MIN)
    const walk = async (dir: string): Promise<void> => {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) await walk(p)
        else if (e.name.endsWith('.md'))
          await writeFile(p, (await readFile(p, 'utf8')).replace(/\n/g, '\r\n'))
      }
    }
    await walk(root)
    expect((await checkWiki(root, PHQ_DAY)).findings).toEqual([])
    const o = official(root, PHQ_DAY)
    if (o) expect(o).toEqual([])
  })

  it('passes the wiki the pipeline generates (fake provider), with only coverage suggestions', async () => {
    const report = await checkWiki(resolve(__dirname, '../fixtures/phq-wiki-generated'), PHQ_DAY)
    expect(report.findings.filter((f) => f.severity !== 'suggestion')).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('reports aging apart from format defects', async () => {
    const report = await checkWiki(PHQ_MIN, '2026-12-01')
    expect(report.stale).toBe(1)
    expect(report.counts.warning).toBe(1)
    expect(report.ok).toBe(true)
  })

  it('runs no PositioningHQ checks on a plain llm-wiki', async () => {
    const report = await checkWiki(join(DEFECTS, 'golden-wiki'), GOLDEN_DAY)
    expect(report.findings.filter((f) => f.origin === 'phq')).toEqual([])
  })

  it('flags spec defects: private tag, unknown keys, links, See Also, outputs, format version', async () => {
    const root = await copyOf(PHQ_MIN)
    const icp = join(root, 'wiki/topics/ideal-customer-profile.md')
    let text = await readFile(icp, 'utf8')
    text = text
      .replace('tags: [positioning, icp, private]', 'tags: [positioning, icp]')
      .replace('summary:', 'run_id: "r-1"\nsummary:')
      .replace(
        '## ICP formula',
        'See [[nowhere|Nowhere]] and [[company-profile]].\n\n## ICP formula'
      )
    await writeFile(icp, text)
    const ps = join(root, 'wiki/concepts/positioning-statement.md')
    await writeFile(
      ps,
      (await readFile(ps, 'utf8')).replace(/## See Also[\s\S]*?## Sources/, '## Sources')
    )
    const out = join(root, 'output/positioning-playbook-v1-2026-10-17.md')
    await writeFile(
      out,
      (await readFile(out, 'utf8')).replace(
        'wiki/topics/ideal-customer-profile.md',
        'raw/papers/2026-10-17-acme-sales-deck.md'
      )
    )
    const cfg = join(root, 'config.md')
    await writeFile(
      cfg,
      (await readFile(cfg, 'utf8')).replace('format_version: 1', 'format_version: 2')
    )

    const f = (await checkWiki(root, PHQ_DAY)).findings.filter((x) => x.origin === 'phq')
    const has = (check: string, path: string, text: string): boolean =>
      f.some((x) => x.check === check && x.path === path && x.message.includes(text))
    expect(has('S12.4', 'wiki/topics/ideal-customer-profile.md', 'not tagged private')).toBe(true)
    expect(has('C13', 'wiki/topics/ideal-customer-profile.md', 'run_id')).toBe(true)
    expect(has('S12.5', 'wiki/topics/ideal-customer-profile.md', '[[nowhere]]')).toBe(true)
    expect(
      has(
        'S12.5',
        'wiki/topics/ideal-customer-profile.md',
        '[[company-profile]] has no markdown link'
      )
    ).toBe(true)
    expect(has('C4', 'wiki/concepts/positioning-statement.md', 'does not link back')).toBe(true)
    expect(has('S12.3', 'output/positioning-playbook-v1-2026-10-17.md', 'not a wiki article')).toBe(
      true
    )
    expect(has('S13', 'config.md', 'format version 2')).toBe(true)
  })
})

describe('fixes', () => {
  it('adds a tag without touching the rest of the file', () => {
    const inline = '---\ntitle: "X"\ntags: [a, b]\nsummary: "S"\n---\nBody'
    expect(addTagInPlace(inline, 'private')).toBe(
      '---\ntitle: "X"\ntags: [a, b, private]\nsummary: "S"\n---\nBody'
    )
    const block = '---\ntitle: "X"\ntags:\n  - a\nsummary: "S"\n---\nBody'
    expect(addTagInPlace(block, 'private')).toBe(
      '---\ntitle: "X"\ntags:\n  - a\n  - private\nsummary: "S"\n---\nBody'
    )
    expect(addTagInPlace('---\ntitle: "X"\n---\n', 'private')).toBe(
      '---\ntitle: "X"\ntags: [private]\n---\n'
    )
    expect(addTagInPlace(inline.replace('[a, b]', '[a, private]'), 'private')).toBe(
      inline.replace('[a, b]', '[a, private]')
    )
    expect(addTagInPlace('no front matter', 'private')).toBeNull()
  })

  it('repairs mechanical defects and leaves the wiki clean', async () => {
    const root = await copyOf(PHQ_MIN)
    // A missing index, a missing folder, a misplaced article, a lost private tag, a missing README.
    await rm(join(root, 'raw/notes'), { recursive: true })
    await rm(join(root, 'wiki/topics/_index.md'))
    await rm(join(root, 'README.md'))
    const icp = await readFile(join(root, 'wiki/topics/ideal-customer-profile.md'), 'utf8')
    await writeFile(
      join(root, 'wiki/references/ideal-customer-profile.md'),
      icp.replace('tags: [positioning, icp, private]', 'tags: [positioning, icp]')
    )
    await rm(join(root, 'wiki/topics/ideal-customer-profile.md'))
    const body = parseDoc(icp)!.body

    expect((await checkWiki(root, PHQ_DAY)).ok).toBe(false)
    const { fixed, report } = await fixWiki(root, PHQ_DAY)
    expect(fixed).toContain('Created raw/notes/')
    expect(fixed).toContain('Created README.md')
    expect(fixed).toContain(
      'Moved wiki/references/ideal-customer-profile.md to wiki/topics/ideal-customer-profile.md'
    )
    expect(fixed.some((x) => x.startsWith('Tagged wiki/'))).toBe(true)
    expect(report.findings).toEqual([])

    const after = await readFile(join(root, 'wiki/topics/ideal-customer-profile.md'), 'utf8')
    expect(after).toContain('tags: [positioning, icp, private]')
    expect(parseDoc(after)!.body).toBe(body)
    expect(await readFile(join(root, 'log.md'), 'utf8')).toMatch(
      /## \[2026-10-17\] lint \| PositioningHQ check: 0 critical, 0 warnings/
    )
    const lint = official(root, PHQ_DAY)
    if (lint) expect(lint).toEqual([])
  })

  it('never edits raw files or deletes unknown files', async () => {
    const root = await copyOf(PHQ_MIN)
    await writeFile(join(root, 'notes.txt'), 'mine')
    const raw = join(root, 'raw/articles/2026-10-17-acme-com-home.md')
    const before = await readFile(raw, 'utf8')
    await fixWiki(root, PHQ_DAY)
    expect(await readFile(join(root, 'notes.txt'), 'utf8')).toBe('mine')
    expect(await readFile(raw, 'utf8')).toBe(before)
  })
})

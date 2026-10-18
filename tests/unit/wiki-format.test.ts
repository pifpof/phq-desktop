import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { cp, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { ArticleFrontMatterSchema, RawFrontMatterSchema } from '../../src/shared/wiki-types'
import { renderArticle } from '../../src/main/wiki/article'
import { ARTICLE_MAP, pathForSlug, specFor } from '../../src/main/wiki/article-map'
import { clampConfidence, maxConfidence } from '../../src/main/wiki/confidence'
import { parseDoc, stringifyDoc } from '../../src/main/wiki/frontmatter'
import { renderLeafIndex, writeIndexes } from '../../src/main/wiki/index-gen'
import { backlinks, link, linkedSlugs, parseLinks } from '../../src/main/wiki/links'
import { appendLog, lastLogDate } from '../../src/main/wiki/log'
import { outputVersions, rawRel, relLink, safeJoin, slugify } from '../../src/main/wiki/paths'
import { scanWiki } from '../../src/main/wiki/scan'
import { createSkeleton } from '../../src/main/wiki/skeleton'
import { configMd, workspaceIdFrom } from '../../src/main/wiki/templates'

const FIXTURE = resolve(__dirname, '../fixtures/phq-wiki-min')
const LINT = resolve(__dirname, '../../.cache/llm-wiki-v0.25.1/scripts/llm-wiki')

const dirs: string[] = []
const tmp = async (): Promise<string> => {
  const d = await mkdtemp(join(tmpdir(), 'phq-wiki-'))
  dirs.push(d)
  return d
}
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true })
})

/** Runs the official lint when it has been fetched (npm run wiki:lint fetches it). */
function officialLint(root: string, today: string): { ran: boolean; ok: boolean; out: string } {
  if (!existsSync(LINT)) return { ran: false, ok: true, out: '' }
  const r = spawnSync('python3', [LINT, 'lint', '--fail-on', 'warning', root], {
    env: { ...process.env, LLM_WIKI_TODAY: today },
    encoding: 'utf8'
  })
  if (r.error) return { ran: false, ok: true, out: '' }
  return { ran: true, ok: r.status === 0, out: r.stdout + r.stderr }
}

describe('front matter', () => {
  it('writes only whitelisted keys, in spec order, in the subset llm-wiki parses', () => {
    const text = stringifyDoc(
      'raw',
      {
        tags: ['own-site', 'pricing'],
        summary:
          'A "long" summary\nthat spans lines and is well over eighty characters long, so js-yaml would fold it.',
        title: 'Acme: pricing',
        source: 'https://acme.com/pricing',
        type: 'articles',
        ingested: '2026-10-17',
        run_id: 'r-1'
      },
      '# Acme pricing\n\nBody.'
    )
    expect(text).toBe(
      [
        '---',
        'title: "Acme: pricing"',
        'source: "https://acme.com/pricing"',
        'type: articles',
        'ingested: 2026-10-17',
        'tags: [own-site, pricing]',
        'summary: "A \'long\' summary that spans lines and is well over eighty characters long, so js-yaml would fold it."',
        '---',
        '',
        '# Acme pricing',
        '',
        'Body.',
        ''
      ].join('\n')
    )
  })

  it('writes sources as a two-space block list and quotes paths with spaces', () => {
    const text = stringifyDoc(
      'article',
      {
        sources: ['raw/articles/a.md', 'raw/papers/2026-10-17-Deck v2.md'],
        aliases: ['ICP', 'a, b']
      },
      'x'
    )
    expect(text).toContain(
      'sources:\n  - raw/articles/a.md\n  - "raw/papers/2026-10-17-Deck v2.md"\n'
    )
    expect(text).toContain('aliases: ["ICP", "a, b"]')
  })

  it('round-trips through the reader', () => {
    const data = {
      title: 'Ideal Customer Profile',
      category: 'topic',
      sources: ['raw/articles/a.md', 'raw/papers/b c.md'],
      created: '2026-10-17',
      updated: '2026-10-17',
      tags: ['icp', 'private'],
      aliases: ['ICP', 'target, customer'],
      confidence: 'medium',
      volatility: 'warm',
      verified: '2026-10-17',
      'compiled-from': 'sources',
      summary: 'Who buys.'
    }
    const back = parseDoc(stringifyDoc('article', data, '# T'))!
    expect(back.data).toEqual(data)
    expect(back.body).toBe('# T\n')
    expect(ArticleFrontMatterSchema.safeParse(back.data).success).toBe(true)
  })

  it('reads CRLF files, a BOM and numbers', () => {
    const doc = parseDoc('\uFEFF---\r\ntitle: "X"\r\nformat_version: 1\r\n---\r\nBody\r\n')!
    expect(doc.data).toEqual({ title: 'X', format_version: 1 })
    expect(doc.body).toBe('Body\n')
    expect(parseDoc('no front matter')).toBeNull()
  })

  it('reads every file in the hand-written fixture as valid spec front matter', async () => {
    const files = await scanWiki(FIXTURE)
    for (const f of files.filter((x) => x.kind === 'raw')) {
      expect(RawFrontMatterSchema.safeParse(f.data).success, f.rel).toBe(true)
    }
    for (const f of files.filter((x) => x.kind === 'article')) {
      expect(ArticleFrontMatterSchema.safeParse(f.data).success, f.rel).toBe(true)
    }
  })
})

describe('paths', () => {
  it('slugifies to lowercase ASCII kebab case, max 80', () => {
    expect(slugify('Café & Co. Pricing!')).toBe('cafe-and-co-pricing')
    expect(slugify("Ledgerly's Suite")).toBe('ledgerlys-suite')
    expect(slugify('***')).toBe('untitled')
    expect(slugify('a'.repeat(100)).length).toBe(80)
    expect(rawRel('articles', '2026-10-17', 'acme.com/pricing')).toBe(
      'raw/articles/2026-10-17-acme-com-pricing.md'
    )
  })

  it('refuses paths that leave the wiki', () => {
    expect(() => safeJoin('/w', '../x.md')).toThrow()
    expect(() => safeJoin('/w', '/etc/passwd')).toThrow()
    expect(() => safeJoin('/w', 'wiki/../../x')).toThrow()
    expect(() => safeJoin('/w', 'C:/x')).toThrow()
    expect(safeJoin('/w', 'wiki/topics/a.md')).toBe(join('/w', 'wiki/topics/a.md'))
  })

  it('computes relative links between wiki files', () => {
    expect(relLink('wiki/topics/a.md', 'wiki/concepts/b.md')).toBe('../concepts/b.md')
    expect(relLink('wiki/topics/a.md', 'wiki/topics/b.md')).toBe('b.md')
    expect(relLink('wiki/topics/a.md', 'raw/articles/x.md')).toBe('../../raw/articles/x.md')
    expect(relLink('_index.md', 'wiki/topics/b.md')).toBe('wiki/topics/b.md')
  })

  it('finds output versions', async () => {
    const root = await tmp()
    await createSkeleton(root, {
      company: 'Acme',
      workspaceId: '7d3f2c1e-5b8a-4f6d-9e2a-1c4b7a9d0e3f',
      created: '2026-10-17'
    })
    await writeFile(join(root, 'output/positioning-playbook-v1-2026-10-17.md'), 'x')
    await writeFile(join(root, 'output/positioning-playbook-v10-2026-10-20.md'), 'x')
    await writeFile(join(root, 'output/positioning-playbook-v2-2026-10-18.md'), 'x')
    expect((await outputVersions(root, 'positioning-playbook')).map((v) => v.version)).toEqual([
      1, 2, 10
    ])
  })
})

describe('article map', () => {
  it('maps fixed and pattern slugs to their folders', () => {
    expect(pathForSlug('ideal-customer-profile')).toBe('wiki/topics/ideal-customer-profile.md')
    expect(pathForSlug('value-drivers')).toBe('wiki/concepts/value-drivers.md')
    expect(pathForSlug('value-driver-forecast-accuracy')).toBe(
      'wiki/concepts/value-driver-forecast-accuracy.md'
    )
    expect(pathForSlug('competitor-ledgerly')).toBe('wiki/references/competitor-ledgerly.md')
    expect(pathForSlug('decision-2026-10-20-lead-with-accuracy')).toBe(
      'wiki/references/decision-2026-10-20-lead-with-accuracy.md'
    )
    expect(specFor('decision-lead')).toBeNull()
    expect(specFor('competitor-')).toBeNull()
    expect(specFor('market-overview-2')).toBeNull()
    expect(specFor('Not A Slug')).toBeNull()
  })

  it('has unique fixed slugs and templates that exist', () => {
    const fixed = ARTICLE_MAP.filter((a) => !a.pattern).map((a) => a.slug)
    expect(new Set(fixed).size).toBe(fixed.length)
    for (const a of ARTICLE_MAP) {
      if (a.template)
        expect(
          existsSync(resolve(__dirname, '../../resources/skills', a.template)),
          a.template
        ).toBe(true)
    }
  })
})

describe('links', () => {
  const target = {
    slug: 'positioning-statement',
    title: 'Positioning Statement',
    path: 'wiki/concepts/positioning-statement.md'
  }

  it('builds two-form links relative to the linking file', () => {
    expect(link('wiki/topics/ideal-customer-profile.md', target)).toBe(
      '[[positioning-statement|Positioning Statement]] ([Positioning Statement](../concepts/positioning-statement.md))'
    )
    expect(link('wiki/topics/x.md', { ...target, title: 'A | B [c]' })).toContain(
      '[[positioning-statement|A B c]]'
    )
  })

  it('parses two-form links once, plain wikilinks and markdown links', () => {
    const body = `${link('wiki/topics/a.md', target)} and [[company-profile]] and [ICP](ideal-customer-profile.md) and [site](https://acme.com) and ![img](x.png)`
    const found = parseLinks('wiki/topics/a.md', body)
    expect(found.map((f) => [f.slug, f.path])).toEqual([
      ['positioning-statement', 'wiki/concepts/positioning-statement.md'],
      ['company-profile', null],
      [null, 'wiki/topics/ideal-customer-profile.md'],
      [null, null]
    ])
    expect(linkedSlugs('wiki/topics/a.md', body).sort()).toEqual([
      'company-profile',
      'ideal-customer-profile',
      'positioning-statement'
    ])
  })

  it('computes backlinks', () => {
    const docs = [
      { path: 'wiki/topics/a.md', body: link('wiki/topics/a.md', target) },
      { path: 'wiki/topics/b.md', body: 'nothing' },
      { path: 'wiki/concepts/positioning-statement.md', body: '[[positioning-statement]]' }
    ]
    expect(backlinks('positioning-statement', docs)).toEqual(['wiki/topics/a.md'])
  })
})

describe('confidence', () => {
  const own = (n: number) => ({
    path: `raw/articles/own-${n}.md`,
    source: `https://acme.com/p${n}`,
    tags: ['own-site']
  })
  const web = (host: string) => ({
    path: `raw/articles/${host}.md`,
    source: `https://${host}/x`,
    tags: ['web-citation']
  })
  const file = (n: number) => ({
    path: `raw/papers/f${n}.md`,
    source: `inbox/.processed/f${n}.pdf`,
    tags: ['private']
  })

  it('follows spec 4.3, counting independent origins', () => {
    expect(maxConfidence([])).toBe('low')
    expect(maxConfidence([web('g2.com')])).toBe('low')
    expect(maxConfidence([own(1)])).toBe('medium')
    expect(maxConfidence([web('g2.com'), web('capterra.com')])).toBe('medium')
    // Three pages of one site are one origin.
    expect(maxConfidence([own(1), own(2), own(3)])).toBe('medium')
    expect(maxConfidence([own(1), web('g2.com'), web('techcrunch.com')])).toBe('high')
    expect(maxConfidence([file(1), file(2), web('www.g2.com')])).toBe('high')
    expect(maxConfidence([web('g2.com'), web('www.g2.com'), web('capterra.com')])).toBe('medium')
  })

  it('clamps but never raises', () => {
    expect(clampConfidence('high', [web('g2.com')])).toBe('low')
    expect(clampConfidence('low', [own(1), web('a.com'), web('b.com')])).toBe('low')
    expect(clampConfidence('medium', [own(1)])).toBe('medium')
  })
})

describe('log', () => {
  it('appends in llm-wiki format and finds the latest date per operation', async () => {
    const root = await tmp()
    await appendLog(root, 'init', 'created', '2026-10-17')
    await appendLog(root, 'compile', 'run r-1\n-> 3 articles', '2026-10-18')
    await appendLog(root, 'compile', 'run r-2', '2026-10-19')
    const log = await readFile(join(root, 'log.md'), 'utf8')
    expect(log).toBe(
      '# Wiki Activity Log\n\n## [2026-10-17] init | created\n## [2026-10-18] compile | run r-1 -> 3 articles\n## [2026-10-19] compile | run r-2\n'
    )
    expect(lastLogDate(log, 'compile')).toBe('2026-10-19')
    expect(lastLogDate(log, 'lint')).toBeNull()
  })

  it('keeps entries on their own line when the file lacks a final newline', async () => {
    const root = await tmp()
    await writeFile(join(root, 'log.md'), '# Wiki Activity Log\n\n## [2026-10-17] init | x')
    await appendLog(root, 'lint', 'ok', '2026-10-18')
    expect(await readFile(join(root, 'log.md'), 'utf8')).toMatch(
      /init \| x\n## \[2026-10-18\] lint \| ok\n$/
    )
  })
})

describe('indexes', () => {
  it('are deterministic and sorted', () => {
    const f = (name: string, updated: string) => ({
      rel: `wiki/topics/${name}.md`,
      kind: 'article' as const,
      dir: 'wiki/topics',
      name,
      data: { title: name.toUpperCase(), summary: `About ${name} | pipes`, tags: ['t'], updated },
      body: '',
      mtimeMs: 0
    })
    const a = renderLeafIndex(
      'wiki/topics',
      [f('b', '2026-10-18'), f('a', '2026-10-17')],
      '2026-10-01'
    )
    const b = renderLeafIndex(
      'wiki/topics',
      [f('a', '2026-10-17'), f('b', '2026-10-18')],
      '2026-10-01'
    )
    expect(a).toBe(b)
    expect(a).toContain('Last updated: 2026-10-18')
    expect(a.indexOf('[A](a.md)')).toBeLessThan(a.indexOf('[B](b.md)'))
    expect(a).toContain('About a \\| pipes')
  })

  it('leave the hand-written fixture unchanged (its indexes are derived)', async () => {
    const root = await tmp()
    await cp(FIXTURE, root, { recursive: true })
    expect(await writeIndexes(root)).toEqual([])
  })
})

describe('skeleton', () => {
  const id = {
    company: 'Acme',
    workspaceId: '7d3f2c1e-5b8a-4f6d-9e2a-1c4b7a9d0e3f',
    created: '2026-10-17'
  }

  it('writes the workspace ID in the config body and reads it back', () => {
    const text = configMd(id)
    expect(text).toContain('format_version: 1\n')
    expect(workspaceIdFrom(text)).toBe(id.workspaceId)
    expect(parseDoc(text)!.data).not.toHaveProperty('workspace_id')
  })

  it('is idempotent and never overwrites', async () => {
    const root = await tmp()
    await createSkeleton(root, id)
    await writeFile(join(root, 'README.md'), 'edited by the founder')
    await createSkeleton(root, { ...id, company: 'Other' })
    expect(await readFile(join(root, 'README.md'), 'utf8')).toBe('edited by the founder')
    expect((await readFile(join(root, 'log.md'), 'utf8')).match(/init/g)).toHaveLength(1)
  })

  it('plus two articles passes the official llm-wiki lint', async () => {
    const root = await tmp()
    await createSkeleton(root, id)
    const raw = 'raw/articles/2026-10-17-acme-com-home.md'
    await writeFile(
      join(root, raw),
      stringifyDoc(
        'raw',
        {
          title: 'Acme home page',
          source: 'https://acme.com/',
          type: 'articles',
          ingested: '2026-10-17',
          tags: ['website', 'own-site', 'home'],
          summary: 'Revenue forecasting for RevOps teams.'
        },
        '# Acme home page\n\nForecast in an hour.'
      )
    )
    const fm = (title: string, category: 'topic' | 'concept', volatility: 'warm' | 'cold') => ({
      title,
      category,
      sources: [raw],
      created: '2026-10-17',
      updated: '2026-10-17',
      tags: ['positioning'],
      aliases: [],
      confidence: 'medium' as const,
      volatility,
      verified: '2026-10-17',
      'compiled-from': 'sources' as const,
      summary: `${title} for Acme.`
    })
    const icp = {
      slug: 'ideal-customer-profile',
      title: 'Ideal Customer Profile',
      path: 'wiki/topics/ideal-customer-profile.md'
    }
    const ps = {
      slug: 'positioning-statement',
      title: 'Positioning Statement',
      path: 'wiki/concepts/positioning-statement.md'
    }
    const sources = [{ path: raw, title: 'Acme home page', note: 'the claim' }]
    await writeFile(
      join(root, icp.path),
      renderArticle({
        path: icp.path,
        frontMatter: fm(icp.title, 'topic', 'warm'),
        abstract: 'RevOps leaders.',
        sections: '## ICP formula\n\nRevOps.',
        seeAlso: [{ target: ps, note: 'the statement' }],
        sources
      })
    )
    await writeFile(
      join(root, ps.path),
      renderArticle({
        path: ps.path,
        frontMatter: fm(ps.title, 'concept', 'cold'),
        abstract: 'For RevOps.',
        sections: '## Statement\n\nFor RevOps.',
        seeAlso: [{ target: icp, note: 'the buyer' }],
        sources
      })
    )
    await writeIndexes(root)

    const master = await readFile(join(root, '_index.md'), 'utf8')
    expect(master).toContain('1. [Positioning Statement](wiki/concepts/positioning-statement.md)')
    expect(master).toContain('- Articles: 2')

    const lint = officialLint(root, '2026-10-17')
    if (lint.ran) expect(lint.ok, lint.out).toBe(true)
  })

  it('the fixture passes the official lint', () => {
    const lint = officialLint(FIXTURE, '2026-10-17')
    if (lint.ran) expect(lint.ok, lint.out).toBe(true)
  })
})

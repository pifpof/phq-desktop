import { cp, mkdtemp, rm, utimes, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import type { TreeNode, WikiTree } from '../../src/shared/wiki-tree'
import { scanWiki, type ScanCache, type WikiFile } from '../../src/main/wiki/scan'
import { buildSourcesTree } from '../../src/main/wiki/sources-tree'
import { buildArticleTree, printTree, stripPrefix, type Generated } from '../../src/main/wiki/tree'

const GENERATED = resolve(__dirname, '../fixtures/phq-wiki-generated')
const MIN = resolve(__dirname, '../fixtures/phq-wiki-min')

const dirs: string[] = []
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true })
})
async function copyOf(src: string): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'phq-tree-'))
  dirs.push(d)
  await cp(src, d, { recursive: true })
  return d
}

const T0 = Date.parse('2026-10-17T10:00:00Z')

/** An in-memory wiki file. */
function article(
  slug: string,
  folder: string,
  data: Record<string, unknown>,
  body = '',
  mtimeMs = T0
): WikiFile {
  return {
    rel: `wiki/${folder}/${slug}.md`,
    kind: 'article',
    dir: `wiki/${folder}`,
    name: slug,
    data: { title: slug, updated: '2026-10-17', ...data },
    body,
    mtimeMs
  }
}
function raw(name: string, tags: string[], mtimeMs = T0, ingested = '2026-10-17'): WikiFile {
  return {
    rel: `raw/articles/${name}.md`,
    kind: 'raw',
    dir: 'raw/articles',
    name,
    data: { title: name, tags, ingested, source: `https://${name}.example/` },
    body: '',
    mtimeMs
  }
}

const find = (tree: WikiTree, label: string): TreeNode | undefined => {
  const walk = (nodes: TreeNode[]): TreeNode | undefined => {
    for (const n of nodes) {
      if (n.label === label) return n
      const hit = walk(n.children)
      if (hit) return hit
    }
    return undefined
  }
  for (const s of tree.sections) {
    const hit = walk(s.items)
    if (hit) return hit
  }
  return undefined
}

describe('article tree', () => {
  it('follows the REQUIREMENTS-v3 3.1 structure and order for a generated wiki', async () => {
    const tree = buildArticleTree({ files: await scanWiki(GENERATED), generated: {} })
    expect(printTree(tree)).toBe(
      [
        'POSITIONING 8 *',
        '  Positioning Statement [private]',
        '  Value Drivers [private]',
        '    Value Driver One [private]',
        '    Value Driver Three [private]',
        '    Value Driver Two [private]',
        '  Moats (group)',
        '    Moat Alpha [private]',
        '    Moat Beta [private]',
        '  Proof Points [lowConfidence]',
        'CUSTOMERS 2 *',
        '  Ideal Customer Profile [private]',
        '  Customer Segment [lowConfidence]',
        'COMPETITORS 3 *',
        '  Competitive Landscape [lowConfidence]',
        '  Competitor Profiles (group)',
        '    Competitor Road Runner Inc [lowConfidence]',
        '    Competitor Wile Co [lowConfidence]',
        'MESSAGING TODAY 2',
        '  Current Messaging',
        '  Social Taglines',
        'MARKET 3 *',
        '  Why Now [private]',
        '  Market Segment [lowConfidence]',
        '  Research Summary [private]',
        'YOUR COMPANY 6 *',
        '  Company Profile',
        '  Company Overview',
        '  Product Overview [lowConfidence]',
        '  Recent Developments [lowConfidence]',
        '  Strengths [lowConfidence]',
        '  Weaknesses [lowConfidence]'
      ].join('\n')
    )
    expect(find(tree, 'Company Profile')?.subtitle).toBe('What you told us')
    expect(find(tree, 'Positioning Statement')?.taskId).toBe('playbook-05-statement')
    expect(find(tree, 'Competitor Wile Co')?.taskId).toBe('competitor-profiles')
  })

  it('renders a wiki made by another tool (the spec fixture) the same way, with placeholders', async () => {
    const tree = buildArticleTree({ files: await scanWiki(MIN), generated: {} })
    expect(tree.sections.map((s) => s.label)).toEqual([
      'Positioning',
      'Customers',
      'Competitors',
      'Messaging today',
      'Market',
      'Your company'
    ])
    const vd = find(tree, 'Value Drivers')!
    expect(vd.kind).toBe('placeholder')
    expect(vd.children).toEqual([])
    const moats = find(tree, 'Moats')!
    expect(moats.kind).toBe('group')
    expect(moats.children.map((c) => [c.kind, c.label, c.taskId])).toEqual([
      ['placeholder', 'Not generated yet', 'playbook-04-moat']
    ])
    expect(moats.children[0].markers).toEqual([{ kind: 'missing', text: 'Not generated yet' }])
    // Placeholders are not counted.
    expect(tree.sections[0].count).toBe(1)
  })

  it('drops type prefixes from child labels', () => {
    expect(stripPrefix('Value Driver: Faster Ramp, One Standard', 'Value Driver')).toBe(
      'Faster Ramp, One Standard'
    )
    expect(stripPrefix('Moat 2 - Data Network', 'Moat')).toBe('Data Network')
    expect(stripPrefix('Competitor: Acme', 'Competitor')).toBe('Acme')
    expect(stripPrefix('Decision: Lead with privacy', 'Decision')).toBe('Lead with privacy')
    expect(stripPrefix('Moat Alpha', 'Moat')).toBe('Moat Alpha')
    expect(stripPrefix('Competitor:', 'Competitor')).toBe('Competitor:')
  })

  it('orders children: drivers as the index lists them, decisions newest first, competitors A to Z', () => {
    const vdBody =
      '- [[value-driver-b|B]] ([B](value-driver-b.md))\n- [[value-driver-a|A]] ([A](value-driver-a.md))'
    const tree = buildArticleTree({
      generated: {},
      files: [
        article('value-drivers', 'concepts', { title: 'Value Drivers' }, vdBody),
        article('value-driver-a', 'concepts', { title: 'Value Driver: Alpha' }),
        article('value-driver-b', 'concepts', { title: 'Value Driver: Bravo' }),
        article('competitor-zed', 'references', { title: 'Competitor: Zed' }),
        article('competitor-acme', 'references', { title: 'Competitor: acme' }),
        article('decision-2026-10-01-old', 'references', {
          title: 'Decision: Old',
          created: '2026-10-01'
        }),
        article('decision-2026-10-15-new', 'references', {
          title: 'Decision: New',
          created: '2026-10-15'
        })
      ]
    })
    expect(find(tree, 'Value Drivers')!.children.map((c) => c.label)).toEqual(['Bravo', 'Alpha'])
    expect(find(tree, 'Decisions')!.children.map((c) => c.label)).toEqual(['New', 'Old'])
    expect(find(tree, 'Competitor Profiles')!.children.map((c) => c.label)).toEqual(['acme', 'Zed'])
  })

  it('puts unknown slugs under OTHER, alphabetically, and hides Decisions when there are none', () => {
    const tree = buildArticleTree({
      generated: {},
      files: [
        article('zebra-notes', 'topics', { title: 'Zebra notes' }),
        article('aardvark', 'topics', { title: 'Aardvark' })
      ]
    })
    const other = tree.sections.at(-1)!
    expect(other.label).toBe('Other')
    expect(other.items.map((i) => i.label)).toEqual(['Aardvark', 'Zebra notes'])
    expect(find(tree, 'Decisions')).toBeUndefined()
  })

  it('marks low confidence, private and decisions, with text equivalents and roll-ups', () => {
    const tree = buildArticleTree({
      generated: {},
      files: [
        raw('one', ['web-citation']),
        article('proof-points', 'references', {
          confidence: 'low',
          tags: ['private'],
          sources: ['raw/articles/one.md']
        }),
        article(
          'decision-2026-10-17-x',
          'references',
          { title: 'Decision: X', created: '2026-10-17' },
          '[[proof-points|Proof Points]] ([Proof Points](proof-points.md))'
        )
      ]
    })
    const proof = find(tree, 'Proof Points')!
    expect(proof.markers).toEqual([
      { kind: 'lowConfidence', text: 'Low confidence: one third-party source' },
      { kind: 'decision', text: 'A decision applies to this article' },
      { kind: 'private', text: 'Private: built from your own files' }
    ])
    expect(tree.sections[0].attention).toBe(true)
  })
})

describe('out of date', () => {
  const run1: Generated = { at: T0 + 60_000, runId: 'run-1' }
  const icp = (sources: string[]): WikiFile =>
    article('ideal-customer-profile', 'topics', { sources })
  const marked = (tree: WikiTree, label: string): boolean =>
    !!find(tree, label)?.markers.some((m) => m.kind === 'outOfDate')

  it("ignores changes made while the article's own run was still going", () => {
    const tree = buildArticleTree({
      // The citation gained excerpts after the ICP was written, but before its run ended.
      files: [raw('cite', ['web-citation'], T0 + 120_000), icp(['raw/articles/cite.md'])],
      generated: {
        'wiki/topics/ideal-customer-profile.md': run1,
        'wiki/topics/market-overview.md': { at: T0 + 180_000, runId: 'run-1' }
      }
    })
    expect(marked(tree, 'Ideal Customer Profile')).toBe(false)
  })

  it('flags a source touched after the run, and the collapsed section shows it', () => {
    const tree = buildArticleTree({
      files: [raw('cite', ['web-citation'], T0 + 3_600_000), icp(['raw/articles/cite.md'])],
      generated: { 'wiki/topics/ideal-customer-profile.md': run1 }
    })
    expect(find(tree, 'Ideal Customer Profile')!.markers[0]).toEqual({
      kind: 'outOfDate',
      text: 'Out of date: a source is newer'
    })
    expect(tree.sections.find((s) => s.id === 'customers')!.attention).toBe(true)
  })

  it('flags a source ingested on a later day even without provenance (a skill-pack wiki)', () => {
    const tree = buildArticleTree({
      files: [raw('cite', ['web-citation'], T0, '2026-10-18'), icp(['raw/articles/cite.md'])],
      generated: {}
    })
    expect(marked(tree, 'Ideal Customer Profile')).toBe(true)
  })

  it('flags a decision recorded after the article', () => {
    const decision = article(
      'decision-2026-10-17-y',
      'references',
      { title: 'Decision: Y', created: '2026-10-17' },
      '[[ideal-customer-profile|ICP]] ([ICP](../topics/ideal-customer-profile.md))',
      T0 + 3_600_000
    )
    const tree = buildArticleTree({
      files: [icp([]), decision],
      generated: { 'wiki/topics/ideal-customer-profile.md': run1 }
    })
    expect(find(tree, 'Ideal Customer Profile')!.markers.map((m) => m.text)).toEqual([
      'Out of date: a decision was recorded since',
      'A decision applies to this article'
    ])
  })

  it('flags an article whose input was rewritten by a later run, not by the same run', () => {
    const files = [
      article('market-position-summary', 'topics', { title: 'Market Position Summary' }),
      icp([])
    ]
    const sameRun = buildArticleTree({
      files,
      generated: {
        'wiki/topics/ideal-customer-profile.md': run1,
        'wiki/topics/market-position-summary.md': { at: T0 + 600_000, runId: 'run-1' }
      }
    })
    expect(marked(sameRun, 'Ideal Customer Profile')).toBe(false)
    const laterRun = buildArticleTree({
      files,
      generated: {
        'wiki/topics/ideal-customer-profile.md': run1,
        'wiki/topics/market-position-summary.md': { at: T0 + 600_000, runId: 'run-2' }
      }
    })
    expect(find(laterRun, 'Ideal Customer Profile')!.markers[0].text).toBe(
      'Out of date: Market Position Summary changed since'
    )
  })

  it('does not trust the generation time after an outside edit moved `updated` on', () => {
    const edited = article('ideal-customer-profile', 'topics', {
      updated: '2026-10-19',
      sources: ['raw/articles/cite.md']
    })
    const tree = buildArticleTree({
      files: [raw('cite', ['web-citation'], T0 + 3_600_000), edited],
      generated: { 'wiki/topics/ideal-customer-profile.md': run1 }
    })
    expect(marked(tree, 'Ideal Customer Profile')).toBe(false)
  })

  it('works on real files: touching a source marks the article', async () => {
    const ws = await copyOf(GENERATED)
    const files = await scanWiki(ws)
    const icpFile = files.find((f) => f.name === 'ideal-customer-profile')!
    const src = (icpFile.data!.sources as string[]).find((s) => s.startsWith('raw/'))!
    const generated = { [icpFile.rel]: { at: Date.now(), runId: 'r' } }
    expect(marked(buildArticleTree({ files, generated }), 'Ideal Customer Profile')).toBe(false)
    const later = new Date(Date.now() + 3_600_000)
    await utimes(join(ws, src), later, later)
    expect(
      marked(buildArticleTree({ files: await scanWiki(ws), generated }), 'Ideal Customer Profile')
    ).toBe(true)
  })
})

describe('inline sources', () => {
  it("lists an article's sources first-party first, newest first, with missing ones flagged", () => {
    const tree = buildArticleTree({
      generated: {},
      files: [
        raw('cite-old', ['web-citation'], T0, '2026-10-01'),
        raw('cite-new', ['web-citation'], T0, '2026-10-10'),
        raw('rival', ['competitor-site', 'competitor-acme']),
        raw('home', ['website', 'own-site']),
        raw('deck', ['private', 'sales-collateral']),
        raw('legacy-playbook', ['legacy']),
        article('ideal-customer-profile', 'topics', {
          sources: [
            'raw/articles/legacy-playbook.md',
            'raw/articles/cite-old.md',
            'raw/articles/gone.md',
            'raw/articles/rival.md',
            'raw/articles/cite-new.md',
            'raw/articles/deck.md',
            'raw/articles/home.md'
          ]
        })
      ]
    })
    const s = find(tree, 'Ideal Customer Profile')!.sources
    expect(s.map((x) => [x.title, x.kind, x.private, x.exists])).toEqual([
      ['deck', 'file', true, true],
      ['home', 'page', false, true],
      ['rival', 'page', false, true],
      ['cite-new', 'citation', false, true],
      ['cite-old', 'citation', false, true],
      ['legacy-playbook', 'legacy', false, true],
      ['raw/articles/gone.md', 'other', false, false]
    ])
  })
})

describe('sources tree', () => {
  it('groups sources, subgroups files and competitor pages, and lists who cites each', () => {
    const tree = buildSourcesTree([
      raw('home', ['website', 'own-site']),
      raw('deck', ['private', 'sales-collateral']),
      raw('board', ['private', 'company-strategy']),
      raw('unread', ['private', 'roadmap']),
      raw('acme-pricing', ['competitor-site', 'competitor-acme']),
      raw('cite', ['web-citation']),
      raw('linkedin', ['social', 'linkedin']),
      article('competitor-acme', 'references', {
        title: 'Competitor: Acme',
        sources: ['raw/articles/acme-pricing.md', 'raw/articles/cite.md']
      }),
      article('ideal-customer-profile', 'topics', {
        sources: ['raw/articles/deck.md', 'raw/articles/cite.md', 'raw/articles/cite.md']
      })
    ])
    expect(tree.sections.map((s) => [s.label, s.count])).toEqual([
      ['Your website', 1],
      ['Your files', 3],
      ['Competitor sites', 1],
      ['Web citations', 1],
      ['Social', 1]
    ])
    const files = tree.sections[1]
    expect(files.groups.map((g) => g.label)).toEqual([
      'Sales collateral',
      'Company strategy',
      'Roadmap'
    ])
    expect(tree.sections[2].groups.map((g) => g.label)).toEqual(['Acme'])
    const cite = tree.sections[3].sources[0]
    expect(cite.citedBy).toEqual([
      { path: 'wiki/references/competitor-acme.md', label: 'Acme' },
      { path: 'wiki/topics/ideal-customer-profile.md', label: 'Ideal Customer Profile' }
    ])
    // An uncited user file: the renderer shows "Not cited".
    expect(files.groups[2].sources[0].citedBy).toEqual([])
  })

  it('always shows Your files, for its Add files action', () => {
    expect(buildSourcesTree([]).sections.map((s) => s.label)).toEqual(['Your files'])
  })
})

describe('scan cache', () => {
  it('re-reads only files whose time or size changed', async () => {
    const ws = await copyOf(MIN)
    const cache: ScanCache = new Map()
    const first = await scanWiki(ws, cache)
    const icp = first.find((f) => f.name === 'ideal-customer-profile')!
    const other = first.find((f) => f.name === 'positioning-statement')!
    await writeFile(
      join(ws, icp.rel),
      (await import('fs')).readFileSync(join(ws, icp.rel), 'utf8') + '\nMore.\n'
    )
    const second = await scanWiki(ws, cache)
    expect(second.find((f) => f.rel === other.rel)).toBe(other)
    expect(second.find((f) => f.rel === icp.rel)).not.toBe(icp)
    expect(second.find((f) => f.rel === icp.rel)!.body).toContain('More.')
  })
})

describe('performance', () => {
  it('builds both trees for 200 articles and 1,000 sources in under 100 ms', () => {
    const files: WikiFile[] = []
    for (let i = 0; i < 1000; i++)
      files.push(raw(`src-${i}`, i % 5 === 0 ? ['private', 'roadmap'] : ['web-citation'], T0 + i))
    for (let i = 0; i < 200; i++) {
      const slug = i < 50 ? `competitor-c${i}` : `topic-${i}`
      files.push(
        article(slug, i < 50 ? 'references' : 'topics', {
          title: `Article ${i}`,
          sources: Array.from({ length: 8 }, (_, k) => `raw/articles/src-${(i * 5 + k) % 1000}.md`)
        })
      )
    }
    const generated = Object.fromEntries(
      files.filter((f) => f.kind === 'article').map((f) => [f.rel, { at: T0, runId: 'r' }])
    )
    buildArticleTree({ files, generated })
    const t0 = performance.now()
    const tree = buildArticleTree({ files, generated })
    buildSourcesTree(files)
    const ms = performance.now() - t0
    expect(tree.sections.reduce((n, s) => n + s.count, 0)).toBe(200)
    expect(ms).toBeLessThan(100)
  })
})

describe('tree service', () => {
  it('caches the trees until a wiki path changes', async () => {
    const { createWikiTreeService } = await import('../../src/main/wiki/tree-service')
    const ws = await copyOf(MIN)
    const svc = createWikiTreeService()
    const a = await svc.get(ws)
    expect(await svc.get(ws)).toBe(a)
    expect(svc.invalidate(['inbox/new.pdf', '.positioninghq/x'])).toBe(false)
    expect(await svc.get(ws)).toBe(a)
    expect(svc.invalidate(['wiki/topics/ideal-customer-profile.md'])).toBe(true)
    const b = await svc.get(ws)
    expect(b).not.toBe(a)
    expect(b.articles).toEqual(a.articles)
  })
})

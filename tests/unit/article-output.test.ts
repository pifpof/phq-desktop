import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  addBacklinks,
  loadArticles,
  validateOutput,
  writePrepared,
  type ExistingArticle,
  type RawInfo,
  type ValidationContext
} from '../../src/main/research/article-output'
import { normalizeSourceUrl } from '../../src/main/ingest/citations-to-raw'
import { confirmWorkspace } from '../../src/main/services/workspace'
import { checkWiki } from '../../src/main/wiki/conformance'
import { parseDoc } from '../../src/main/wiki/frontmatter'
import { writeIndexes } from '../../src/main/wiki/index-gen'

const raw = (
  path: string,
  tags: string[],
  source = `https://${path.split('-').pop()}.example/`
): [string, RawInfo] => [path, { path, source, tags, title: `Title of ${path.split('/').pop()}` }]

const RAW = new Map<string, RawInfo>([
  raw('raw/articles/2026-10-17-acme-com-home.md', ['website', 'own-site'], 'https://acme.com/'),
  raw('raw/articles/2026-10-17-g2-com-acme.md', ['web-citation'], 'https://g2.com/acme'),
  raw(
    'raw/articles/2026-10-17-news-example-acme.md',
    ['web-citation'],
    'https://news.example/acme'
  ),
  raw(
    'raw/papers/2026-10-17-board.md',
    ['private', 'company-strategy'],
    'inbox/.processed/board.txt'
  )
])

const existing = (slug: string, path: string, title: string): [string, ExistingArticle] => [
  slug,
  { slug, path, title, data: { title, created: '2026-10-01' }, body: `# ${title}\n\n> x\n` }
]

function ctx(over: Partial<ValidationContext> = {}): ValidationContext {
  return {
    targets: { allowed: ['ideal-customer-profile'], required: ['ideal-customer-profile'] },
    refs: new Map([
      // A document the task was shown, standing for its raw files.
      [
        'wiki/topics/market-position-summary.md',
        ['raw/articles/2026-10-17-g2-com-acme.md', 'raw/articles/2026-10-17-news-example-acme.md']
      ],
      ['raw/articles/2026-10-17-acme-com-home.md', ['raw/articles/2026-10-17-acme-com-home.md']],
      ['raw/papers/2026-10-17-board.md', ['raw/papers/2026-10-17-board.md']],
      [normalizeSourceUrl('https://g2.com/acme'), ['raw/articles/2026-10-17-g2-com-acme.md']]
    ]),
    raw: RAW,
    existing: new Map([
      existing(
        'market-position-summary',
        'wiki/topics/market-position-summary.md',
        'Market Position Summary'
      ),
      existing('company-profile', 'wiki/references/company-profile.md', 'Company Profile')
    ]),
    today: '2026-10-17',
    normalizeUrl: normalizeSourceUrl,
    ...over
  }
}

const icp = (over: Record<string, unknown> = {}) => ({
  slug: 'ideal-customer-profile',
  category: 'topic',
  title: 'Whatever the model calls it',
  summary: 'RevOps leaders — at mid-size SaaS.',
  aliases: ['ICP'],
  tags: ['ICP', 'Positioning'],
  confidence: 'high',
  abstract: 'Acme wins with RevOps leaders.',
  body: '# Ideal Customer Profile\n\n## ICP formula\n\nRevOps — mid-size. See [[market-position-summary|the summary]] and [[future-article]] and [market](../topics/market-overview.md).\n\n## Sources\n\n- https://made-up.example',
  sources: [
    { ref: 'wiki/topics/market-position-summary.md' },
    { ref: 'raw/articles/2026-10-17-acme-com-home.md' }
  ],
  see_also: [{ slug: 'company-profile', note: 'the facts' }, { slug: 'nope' }],
  ...over
})

const text = (r: ReturnType<typeof validateOutput>) => r.files[0].text
const fm = (r: ReturnType<typeof validateOutput>) => parseDoc(text(r))!.data

describe('article validation', () => {
  it('writes a valid article in the spec shape, with the app in charge of title, links and Sources', () => {
    const r = validateOutput({ articles: [icp()] }, ctx())
    expect(r.errors).toEqual([])
    expect(r.files.map((f) => f.path)).toEqual(['wiki/topics/ideal-customer-profile.md'])
    expect(fm(r)).toEqual({
      title: 'Ideal Customer Profile',
      category: 'topic',
      sources: [
        'raw/articles/2026-10-17-acme-com-home.md',
        'raw/articles/2026-10-17-g2-com-acme.md',
        'raw/articles/2026-10-17-news-example-acme.md'
      ],
      created: '2026-10-17',
      updated: '2026-10-17',
      tags: ['icp', 'positioning'],
      aliases: ['ICP', 'target customer', 'ideal customer'],
      confidence: 'high',
      volatility: 'warm',
      verified: '2026-10-17',
      'compiled-from': 'sources',
      summary: 'RevOps leaders, at mid-size SaaS.'
    })
    const body = parseDoc(text(r))!.body
    expect(body).toMatch(
      /^# Ideal Customer Profile\n\n> Acme wins with RevOps leaders\.\n\n## ICP formula/
    )
    // The model's Sources section is replaced by the app's, from the resolved raw paths.
    expect(body).not.toContain('made-up.example')
    expect(body).toContain(
      '## Sources\n\n- [Title of 2026-10-17-acme-com-home.md](../../raw/articles/2026-10-17-acme-com-home.md)'
    )
    // Links: existing article as two-form; missing ones as plain text, reported.
    expect(body).toContain(
      '[[market-position-summary|the summary]] ([the summary](market-position-summary.md))'
    )
    expect(body).toContain('and future-article and market.')
    expect(body).toContain(
      '## See Also\n\n- [[company-profile|Company Profile]] ([Company Profile](../references/company-profile.md)) - the facts'
    )
    expect(body).not.toContain('—')
    expect(r.warnings.join(' ')).toContain('future-article, market-overview, nope')
  })

  it('rejects slugs the task may not write, and wrong categories (retry)', () => {
    const r = validateOutput(
      { articles: [icp({ slug: 'market-overview' }), icp({ category: 'concept' })] },
      ctx()
    )
    expect(r.files).toEqual([])
    expect(r.errors).toEqual([
      '"market-overview" is not a slug this task may write. Allowed: ideal-customer-profile.',
      '"ideal-customer-profile" must have category "topic", not "concept".',
      'The task must write "ideal-customer-profile".'
    ])
    expect(validateOutput({ articles: [icp({ slug: 'Not A Slug' })] }, ctx()).errors[0]).toContain(
      'is not a slug'
    )
  })

  it('fills patterns, requires at least one, and limits patterns to the task', () => {
    const c = ctx({
      targets: {
        allowed: ['value-drivers', 'value-driver-*'],
        required: ['value-drivers', 'value-driver-*']
      }
    })
    const vd = (slug: string) => icp({ slug, category: 'concept', title: `VD ${slug}` })
    expect(validateOutput({ articles: [vd('value-drivers')] }, c).errors).toEqual([
      'The task must write "value-driver-*".'
    ])
    const ok = validateOutput({ articles: [vd('value-drivers'), vd('value-driver-speed')] }, c)
    expect(ok.errors).toEqual([])
    expect(ok.files.map((f) => f.path)).toEqual([
      'wiki/concepts/value-drivers.md',
      'wiki/concepts/value-driver-speed.md'
    ])
    // Pattern articles keep the model's title; fixed slugs use the map's.
    expect(parseDoc(ok.files[1].text)!.data.title).toBe('VD value-driver-speed')
    expect(parseDoc(ok.files[0].text)!.data.title).toBe('Value Drivers')
  })

  it('drops invented source paths and URLs the task never read; no sources means low confidence', () => {
    const r = validateOutput(
      {
        articles: [
          icp({
            sources: [
              { ref: 'raw/papers/2026-01-01-made-up.md' },
              { ref: 'https://never-searched.example/x' },
              { ref: '../../etc/passwd' }
            ]
          })
        ]
      },
      ctx()
    )
    expect(r.errors).toEqual([])
    expect(fm(r).sources).toBeUndefined()
    expect(fm(r).confidence).toBe('low')
    expect(fm(r)['compiled-from']).toBe('mixed')
    expect(r.warnings.filter((w) => w.includes('dropped a source'))).toHaveLength(3)
  })

  it('maps a URL the task read to its citation record, and clamps confidence to the sources', () => {
    const r = validateOutput(
      { articles: [icp({ sources: [{ ref: 'https://g2.com/acme#reviews' }] })] },
      ctx()
    )
    expect(fm(r).sources).toEqual(['raw/articles/2026-10-17-g2-com-acme.md'])
    // One third-party source: the model's "high" becomes low.
    expect(fm(r).confidence).toBe('low')
  })

  it('tags an article private when a source is private, or when the task saw private material', () => {
    const cited = validateOutput(
      { articles: [icp({ sources: [{ ref: 'raw/papers/2026-10-17-board.md' }] })] },
      ctx()
    )
    expect(fm(cited).tags).toContain('private')
    const uncited = validateOutput({ articles: [icp()] }, ctx({ forcePrivate: true }))
    expect(fm(uncited).tags).toContain('private')
    expect(fm(validateOutput({ articles: [icp()] }, ctx())).tags).not.toContain('private')
  })

  it('needs a category term on competitor articles and writes it under the abstract', () => {
    const c = ctx({
      targets: { allowed: ['competitor-ledgerly'], required: ['competitor-ledgerly'] }
    })
    const art = icp({ slug: 'competitor-ledgerly', category: 'reference', title: 'Ledgerly' })
    expect(validateOutput({ articles: [art] }, c).errors).toEqual([
      '"competitor-ledgerly" needs a category_term.'
    ])
    const ok = validateOutput({ articles: [{ ...art, category_term: 'legacy finance suites' }] }, c)
    expect(parseDoc(ok.files[0].text)!.body).toMatch(
      /^# Ledgerly\n\n> .*\n\n\*\*Category term:\*\* legacy finance suites\n\n## ICP formula/
    )
  })

  it('reports a schema mismatch instead of throwing', () => {
    expect(validateOutput({ articles: 'nope' }, ctx()).errors[0]).toContain(
      'did not match the schema'
    )
    expect(validateOutput(undefined, ctx()).errors).toEqual([
      'The task must write "ideal-customer-profile".'
    ])
  })
})

describe('written articles in a wiki', () => {
  async function wiki() {
    const root = mkdtempSync(join(tmpdir(), 'phq-art-'))
    await confirmWorkspace(root, '0.2.0')
    const rawText = (title: string, source: string, tags: string) =>
      `---\ntitle: "${title}"\nsource: "${source}"\ntype: articles\ningested: 2026-10-17\ntags: [${tags}]\nsummary: "${title}."\n---\n\n# ${title}\n`
    writeFileSync(
      join(root, 'raw/articles/2026-10-17-acme-com-home.md'),
      rawText('Acme home', 'https://acme.com/', 'website, own-site')
    )
    writeFileSync(
      join(root, 'raw/articles/2026-10-17-g2-com-acme.md'),
      rawText('G2', 'https://g2.com/acme', 'web-citation')
    )
    return root
  }

  it('makes See Also reciprocal and passes the conformance check', async () => {
    const root = await wiki()
    const c = (allowed: string[]) =>
      ctx({
        targets: { allowed, required: allowed },
        existing: new Map(),
        refs: new Map([
          ['raw/articles/2026-10-17-acme-com-home.md', ['raw/articles/2026-10-17-acme-com-home.md']]
        ])
      })
    const first = validateOutput(
      {
        articles: [
          icp({
            body: '## ICP formula\n\nRevOps.',
            see_also: [],
            sources: [{ ref: 'raw/articles/2026-10-17-acme-com-home.md' }]
          })
        ]
      },
      c(['ideal-customer-profile'])
    )
    await writePrepared(root, first.files)
    const second = validateOutput(
      {
        articles: [
          icp({
            slug: 'positioning-statement',
            category: 'concept',
            body: '## Statement\n\nFor RevOps.',
            see_also: [{ slug: 'ideal-customer-profile', note: 'the buyer' }],
            sources: [{ ref: 'raw/articles/2026-10-17-acme-com-home.md' }]
          })
        ]
      },
      { ...c(['positioning-statement']), existing: await loadArticles(root) }
    )
    const written = await writePrepared(root, second.files)
    expect(await addBacklinks(root, written)).toEqual(['wiki/topics/ideal-customer-profile.md'])
    const back = readFileSync(join(root, 'wiki/topics/ideal-customer-profile.md'), 'utf8')
    expect(back).toContain(
      '## See Also\n\n- [[positioning-statement|Positioning Statement]] ([Positioning Statement](../concepts/positioning-statement.md))\n\n## Sources'
    )
    await writeIndexes(root)
    const report = await checkWiki(root, '2026-10-17')
    expect(report.findings.filter((f) => f.severity !== 'suggestion')).toEqual([])
  })

  it('patches sections into an existing article, keeping the rest and merging sources', async () => {
    const root = await wiki()
    const c = ctx({
      targets: { allowed: ['competitor-ledgerly'], required: ['competitor-ledgerly'] },
      existing: new Map(),
      refs: new Map([
        ['raw/articles/2026-10-17-acme-com-home.md', ['raw/articles/2026-10-17-acme-com-home.md']]
      ])
    })
    const art = validateOutput(
      {
        articles: [
          icp({
            slug: 'competitor-ledgerly',
            category: 'reference',
            title: 'Ledgerly',
            category_term: 'legacy suites',
            body: '## Overview\n\nOld.\n\n## Pricing\n\nPer seat.',
            see_also: [],
            sources: [{ ref: 'raw/articles/2026-10-17-acme-com-home.md' }]
          })
        ]
      },
      c
    )
    await writePrepared(root, art.files)
    const p = validateOutput(
      {
        articles: [],
        patches: [
          {
            slug: 'competitor-ledgerly',
            sections: '## Pricing\n\nUsage based now.\n\n## Trap Questions\n\nAsk about X.',
            sources: [{ ref: 'https://g2.com/acme' }]
          }
        ]
      },
      {
        ...c,
        targets: { allowed: [], required: [], patches: ['competitor-*'] },
        existing: await loadArticles(root),
        refs: new Map([
          [normalizeSourceUrl('https://g2.com/acme'), ['raw/articles/2026-10-17-g2-com-acme.md']]
        ])
      }
    )
    expect(p.errors).toEqual([])
    await writePrepared(root, p.files)
    const doc = parseDoc(
      readFileSync(join(root, 'wiki/references/competitor-ledgerly.md'), 'utf8')
    )!
    expect(doc.body).toContain('**Category term:** legacy suites')
    expect(doc.body).toContain('## Overview\n\nOld.')
    expect(doc.body).toContain('## Pricing\n\nUsage based now.')
    expect(doc.body).not.toContain('Per seat.')
    expect(doc.body.indexOf('## Trap Questions')).toBeLessThan(doc.body.indexOf('## Sources'))
    expect(doc.data.sources).toEqual([
      'raw/articles/2026-10-17-acme-com-home.md',
      'raw/articles/2026-10-17-g2-com-acme.md'
    ])
    // Patches are only for existing articles the task may add to.
    const bad = validateOutput(
      { articles: [], patches: [{ slug: 'competitor-nobody', sections: '## X', sources: [] }] },
      { ...c, targets: { allowed: [], required: [], patches: ['competitor-*'] } }
    )
    expect(bad.errors).toEqual([
      '"competitor-nobody" is not an existing article this task may add to.'
    ])
    await writeIndexes(root)
    expect(
      (await checkWiki(root, '2026-10-17')).findings.filter(
        (f) => f.severity !== 'suggestion' && f.severity !== 'info'
      )
    ).toEqual([])
  })
})

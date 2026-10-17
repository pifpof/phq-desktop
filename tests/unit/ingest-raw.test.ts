import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { readBlocks } from '../../src/main/providers/anthropic-task'
import {
  normalizeSourceUrl,
  RunSources,
  sourceTagger
} from '../../src/main/ingest/citations-to-raw'
import { confirmWorkspace } from '../../src/main/services/workspace'
import { checkWiki } from '../../src/main/wiki/conformance'
import { parseDoc } from '../../src/main/wiki/frontmatter'
import { writeIndexes } from '../../src/main/wiki/index-gen'

type Blocks = Parameters<typeof readBlocks>[0]
const tmp = (): string => mkdtempSync(join(tmpdir(), 'phq-raw-'))

describe('provider sources', () => {
  it('collects cited excerpts per URL and the full text of fetched pages', () => {
    const r = readBlocks([
      { type: 'server_tool_use', id: 'f', name: 'web_fetch', input: {} },
      {
        type: 'web_fetch_tool_result',
        tool_use_id: 'f',
        content: {
          type: 'web_fetch_result',
          url: 'https://example.com/article',
          content: {
            type: 'document',
            title: 'Article',
            source: { type: 'text', data: 'FULL PAGE TEXT' }
          }
        }
      },
      {
        type: 'web_fetch_tool_result',
        tool_use_id: 'g',
        content: {
          type: 'web_fetch_result',
          url: 'https://example.com/report.pdf',
          content: { type: 'document', title: 'Report', source: { type: 'base64', data: 'JVBER' } }
        }
      },
      {
        type: 'text',
        text: 'Claim one.',
        citations: [
          {
            type: 'web_search_result_location',
            url: 'https://g2.com/x',
            title: 'G2',
            cited_text: '  Fast   setup. '
          },
          {
            type: 'web_search_result_location',
            url: 'https://g2.com/x',
            title: 'G2',
            cited_text: 'Fast setup.'
          }
        ]
      },
      {
        type: 'text',
        text: 'Claim two.',
        citations: [{ type: 'char_location', document_index: 0, cited_text: 'From the article.' }]
      }
    ] as unknown as Blocks)
    expect(r.sources).toEqual([
      {
        url: 'https://example.com/article',
        title: 'Article',
        excerpts: ['From the article.'],
        fullText: 'FULL PAGE TEXT',
        cited: true
      },
      { url: 'https://g2.com/x', title: 'G2', excerpts: ['Fast setup.'], cited: true }
    ])
  })
})

describe('citation ingest', () => {
  const setup = async () => {
    const root = tmp()
    await confirmWorkspace(root, '0.2.0')
    const state = join(tmp(), 'r1.sources.json')
    return { root, state, sources: new RunSources(root, state, '2026-10-17') }
  }
  const tags = sourceTagger({ ownSite: 'https://acme.com' })
  const read = (root: string, rel: string) => parseDoc(readFileSync(join(root, rel), 'utf8'))!

  it('writes one citation record per URL per run and adds excerpts while the run lasts', async () => {
    const { root, sources } = await setup()
    const a = await sources.ingest(
      [
        {
          url: 'https://www.g2.com/products/acme/reviews?utm_source=x#top',
          title: 'G2 reviews: Acme',
          excerpts: ['Fast setup.'],
          cited: true
        }
      ],
      tags
    )
    const rel = 'raw/articles/2026-10-17-g2-com-products-acme-reviews.md'
    expect(a.created).toEqual([rel])
    const b = await sources.ingest(
      [
        {
          url: 'https://www.g2.com/products/acme/reviews',
          title: 'G2',
          excerpts: ['Fast setup.', 'Great support.'],
          cited: true
        }
      ],
      tags
    )
    expect(b.created).toEqual([])
    expect([...b.paths.values()]).toEqual([rel])
    const doc = read(root, rel)
    expect(doc.data).toMatchObject({
      title: 'G2 reviews: Acme',
      source: 'https://www.g2.com/products/acme/reviews',
      type: 'articles',
      ingested: '2026-10-17',
      tags: ['web-citation'],
      summary: 'Citation record: excerpts cited during research. Not a full copy of the page.'
    })
    expect(doc.body).toContain(
      '- "Fast setup." (cited 2026-10-17)\n- "Great support." (cited 2026-10-17)'
    )
    await writeIndexes(root)
    expect(
      (await checkWiki(root, '2026-10-17')).findings.filter((f) => f.severity !== 'suggestion')
    ).toEqual([])
  })

  it('stores a fetched page in full, upgrading a record of the same URL', async () => {
    const { root, sources } = await setup()
    await sources.ingest(
      [
        {
          url: 'https://news.example/acme',
          title: 'Acme raises',
          excerpts: ['Raised $5M.'],
          cited: true
        }
      ],
      tags
    )
    await sources.ingest(
      [
        {
          url: 'https://news.example/acme',
          title: 'Acme raises',
          excerpts: [],
          fullText: 'The whole article — long.',
          cited: false
        }
      ],
      tags
    )
    const doc = read(root, 'raw/articles/2026-10-17-news-example-acme.md')
    expect(doc.body).toContain('The whole article, long.')
    expect(doc.body).not.toContain('Citation record')
    expect(doc.data.summary).toBe('Full text of the page Acme raises, fetched during research.')
  })

  it('reuses the run crawl for citations of the company site, and survives a resume', async () => {
    const { root, state, sources } = await setup()
    await sources.seed([
      { url: 'https://acme.com/pricing', rel: 'raw/articles/2026-10-17-acme-com-pricing.md' }
    ])
    const r = await sources.ingest(
      [{ url: 'https://acme.com/pricing/', title: 'Pricing', excerpts: ['$9'], cited: true }],
      tags
    )
    expect(r.created).toEqual([])
    expect(r.paths.get(normalizeSourceUrl('https://acme.com/pricing'))).toBe(
      'raw/articles/2026-10-17-acme-com-pricing.md'
    )
    await sources.ingest(
      [{ url: 'https://other.example/a', title: 'A', excerpts: ['x'], cited: true }],
      tags
    )
    // A resumed run reads the same map and extends the same file.
    const resumed = new RunSources(root, state, '2026-10-17')
    const again = await resumed.ingest(
      [{ url: 'https://other.example/a', title: 'A', excerpts: ['y'], cited: true }],
      tags
    )
    expect(again.created).toEqual([])
    expect(read(root, 'raw/articles/2026-10-17-other-example-a.md').body).toContain('"y"')
  })

  it('a later run writes a new dated file and never edits the earlier one', async () => {
    const { root, sources } = await setup()
    await sources.ingest(
      [{ url: 'https://x.example/a', title: 'A', excerpts: ['one'], cited: true }],
      tags
    )
    const first = readFileSync(join(root, 'raw/articles/2026-10-17-x-example-a.md'), 'utf8')
    const next = new RunSources(root, join(tmp(), 'r2.json'), '2026-10-17')
    const r = await next.ingest(
      [{ url: 'https://x.example/a', title: 'A', excerpts: ['two'], cited: true }],
      tags
    )
    expect(r.created).toEqual(['raw/articles/2026-10-17-x-example-a-2.md'])
    expect(readFileSync(join(root, 'raw/articles/2026-10-17-x-example-a.md'), 'utf8')).toBe(first)
  })

  it('tags own-site, competitor-site and other citations', () => {
    const t = sourceTagger({
      ownSite: 'acme.com',
      competitor: { slug: 'ledgerly', website: 'https://www.ledgerly.io' }
    })
    expect(t('https://blog.acme.com/x')).toEqual(['website', 'own-site'])
    expect(t('https://ledgerly.io/pricing')).toEqual(['competitor-site', 'competitor-ledgerly'])
    expect(t('https://g2.com/ledgerly')).toEqual(['web-citation', 'competitor-ledgerly'])
    expect(sourceTagger({ ownSite: 'acme.com' })('https://notacme.com')).toEqual(['web-citation'])
  })
})

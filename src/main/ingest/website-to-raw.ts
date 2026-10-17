import { writeFile } from 'fs/promises'
import { replaceEmDashes } from '../research/postprocess'
import { stringifyDoc } from '../wiki/frontmatter'
import { freeRel, rawRel, safeJoin } from '../wiki/paths'
import type { CrawledPage, CrawlResult } from './crawler'

/**
 * Website ingest (REQUIREMENTS-v2 3.1): every crawled page becomes a raw source in raw/articles/,
 * tagged own-site plus a page type. Raw files are final once written; a later crawl writes new
 * dated files and never edits these.
 */

const PAGE_TYPES: [string, RegExp][] = [
  ['pricing', /pric|plans?\b/],
  ['about', /about|company|team|story|mission/],
  ['customers', /customer|case-stud|stories|testimonial|clients?\b/],
  ['product', /product|features?|platform|how-it-works/],
  ['solutions', /solution|use-case|industr/],
  ['integrations', /integration|partners?\b/],
  ['blog', /blog|news|articles?|insights|resources/],
  ['docs', /docs|help|support|faq|guide/],
  ['careers', /career|jobs|hiring/],
  ['contact', /contact|demo|book/],
  ['security', /security|trust|privacy|legal|terms/]
]

/** Tag for the kind of page, from its URL path. The root is "home". */
export function pageType(url: string): string {
  let path = '/'
  try {
    path = new URL(url).pathname.toLowerCase()
  } catch {
    /* keep / */
  }
  if (path === '/' || path === '') return 'home'
  return PAGE_TYPES.find(([, re]) => re.test(path))?.[0] ?? 'page'
}

/** "acme-com-pricing" from https://www.acme.com/pricing */
export function pageName(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const path = u.pathname.replace(/\/+$/, '')
    return `${host}${path ? `-${path}` : '-home'}`
  } catch {
    return 'page'
  }
}

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim()

function summaryOf(p: CrawledPage): string {
  const text = oneLine(p.description || p.ogDescription)
  const host = (() => {
    try {
      return new URL(p.url).hostname.replace(/^www\./, '')
    } catch {
      return 'the website'
    }
  })()
  const base = text || `Page from ${host}: ${oneLine(p.title || p.h1[0] || p.url)}.`
  return replaceEmDashes(base.length > 300 ? `${base.slice(0, 297)}...` : base)
}

export interface IngestedPage {
  url: string
  rel: string
}

/** Writes each page as a raw file. Returns the URL and wiki path of each, in crawl order. */
export async function writeCrawlToRaw(
  wikiRoot: string,
  crawl: CrawlResult,
  date: string
): Promise<IngestedPage[]> {
  const out: IngestedPage[] = []
  const taken = new Set<string>()
  for (const p of crawl.pages) {
    const finalRel = await freeRel(wikiRoot, rawRel('articles', date, pageName(p.url)), taken)
    taken.add(finalRel)
    const title = oneLine(p.title || p.h1[0] || p.url)
    const body = replaceEmDashes(
      [`# ${oneLine(p.h1[0] || title)}`, '', p.markdown.trim()].join('\n')
    )
    await writeFile(
      safeJoin(wikiRoot, finalRel),
      stringifyDoc(
        'raw',
        {
          title: replaceEmDashes(title),
          source: p.url,
          type: 'articles',
          ingested: date,
          tags: ['website', 'own-site', pageType(p.url)],
          summary: summaryOf(p)
        },
        body
      ),
      { flag: 'wx' }
    )
    out.push({ url: p.url, rel: finalRel })
  }
  return out
}

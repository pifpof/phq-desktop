import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import matter from 'gray-matter'
import type { CrawlResult } from './crawler'

const dirOf = (root: string): string => join(root, 'memory', 'research', 'website')

/**
 * Writes the crawl index (page list, headings, social links) to the run's drafts. The pages
 * themselves are raw sources in the wiki (website-to-raw.ts); `rawPages` lists their paths.
 */
export async function writeCrawl(
  root: string,
  crawl: CrawlResult,
  runId = 'manual',
  rawPages: string[] = []
): Promise<string> {
  const dir = dirOf(root)
  await mkdir(dir, { recursive: true })
  const created = new Date().toISOString()

  const rows = crawl.pages.map(
    (p) => `| ${cell(p.title || p.slug)} | ${p.url} | ${p.wordCount} | ${cell(p.h1[0] ?? '')} |`
  )
  const index = [
    '# Website crawl',
    '',
    `Crawled ${crawl.pages.length} pages from ${crawl.startUrl}. Robots.txt: ${crawl.robots === 'honoured' ? 'honoured' : 'none found'}.`,
    '',
    '## Pages',
    '',
    '| Title | URL | Words | H1 |',
    '|---|---|---|---|',
    ...rows,
    '',
    '## Headings',
    '',
    ...crawl.pages.flatMap((p) => [
      `### ${p.title || p.slug}`,
      ...p.h2.slice(0, 12).map((h) => `- ${h}`),
      ''
    ]),
    '## Social links found',
    '',
    ...(crawl.social.length
      ? crawl.social.map((s) => `- ${s.network}: ${s.url}`)
      : ['None found.']),
    '',
    ...(crawl.skipped.length
      ? ['## Not crawled', '', ...crawl.skipped.map((s) => `- ${s.url}: ${s.reason}`), '']
      : [])
  ].join('\n')

  const indexPath = join(dir, 'index.md')
  await writeFile(
    indexPath,
    matter.stringify(index, {
      title: 'Website crawl',
      task: 'crawl-website',
      run_id: runId,
      created,
      status: 'draft',
      pages: crawl.pages.length,
      social: crawl.social,
      sources: crawl.pages.map((p) => p.url),
      raw_pages: rawPages
    })
  )
  return indexPath
}

const cell = (s: string): string => s.replace(/\|/g, '/').replace(/\s+/g, ' ').trim()

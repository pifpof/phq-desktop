import { mkdir, readdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import matter from 'gray-matter'
import { replaceEmDashes } from '../research/postprocess'
import type { CrawlResult } from './crawler'

const dirOf = (root: string): string => join(root, 'memory', 'research', 'website')

/** Writes pages/<slug>.md and index.md (REQUIREMENTS-v1 3.3, T1). Replaces any earlier crawl. */
export async function writeCrawl(
  root: string,
  crawl: CrawlResult,
  runId = 'manual'
): Promise<string> {
  const dir = dirOf(root)
  const pagesDir = join(dir, 'pages')
  await mkdir(pagesDir, { recursive: true })
  for (const f of await readdir(pagesDir)) if (f.endsWith('.md')) await rm(join(pagesDir, f))
  const created = new Date().toISOString()

  for (const p of crawl.pages) {
    // Every document the app writes follows the copy rule, including copies of web pages.
    const body = replaceEmDashes(
      [`# ${p.h1[0] || p.title || p.url}`, '', p.markdown, ''].join('\n')
    )
    await writeFile(
      join(pagesDir, `${p.slug}.md`),
      matter.stringify(body, {
        title: p.title || p.url,
        task: 'crawl-website',
        run_id: runId,
        created,
        status: 'draft',
        url: p.url,
        description: p.description,
        og_title: p.ogTitle,
        og_description: p.ogDescription,
        word_count: p.wordCount,
        rendered: p.rendered,
        sources: [p.url]
      })
    )
  }

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
      sources: crawl.pages.map((p) => p.url)
    })
  )
  return indexPath
}

const cell = (s: string): string => s.replace(/\|/g, '/').replace(/\s+/g, ' ').trim()

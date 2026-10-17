import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import matter from 'gray-matter'
import { crawlSite } from '../ingest/crawler'
import { ingestInbox, type InputRecord } from '../ingest/files-to-raw'
import { renderPage } from '../ingest/render-window'
import { writeCrawlToRaw } from '../ingest/website-to-raw'
import { writeCrawl } from '../ingest/write-crawl'
import { normalizeWebsite } from '@shared/url'
import { userAgent } from '../user-agent'
import { writeIndexes } from '../wiki/index-gen'
import { appendLog } from '../wiki/log'
import { isoDay } from '../wiki/paths'
import { assembleCompanyResearch, assemblePlaybook } from './assemble'
import type { LocalHandler } from './types'
import type { LocalRunner } from './executor'

export const CRAWL_INDEX = 'memory/research/website/index.md'
export const FILES_INDEX = 'memory/research/inputs-extracted/index.md'

const STATUS_TEXT: Record<InputRecord['status'], string> = {
  ok: 'read',
  empty: 'no readable text',
  failed: 'could not be read',
  'not-read': 'not read (unsupported type)'
}

/** The run's note of which files were read and where their text went. No file content. */
async function writeFilesIndex(root: string, records: InputRecord[], runId: string): Promise<void> {
  const rows = records.map(
    (r) => `| ${r.category ?? 'inbox'} | ${r.name} | ${STATUS_TEXT[r.status]} | ${r.raw ?? ''} |`
  )
  const body = records.length
    ? ['# Files', '', '| Category | File | Status | Raw file |', '|---|---|---|---|', ...rows].join(
        '\n'
      )
    : '# Files\n\nNo files were added.'
  await mkdir(join(root, 'memory/research/inputs-extracted'), { recursive: true })
  await writeFile(
    join(root, FILES_INDEX),
    matter.stringify(body + '\n', {
      title: 'Your files',
      task: 'extract-input-files',
      run_id: runId,
      created: new Date().toISOString(),
      status: 'draft'
    })
  )
}

/** Tasks that run on this computer and call no AI. */
export function localHandlers(appVersion: string): Partial<Record<LocalHandler, LocalRunner>> {
  return {
    crawl: async ({ root, wikiRoot, sources, profile, runId, signal }) => {
      const start = normalizeWebsite(profile.company.website)
      if (!start) throw new Error('The company website address is not valid.')
      const crawl = await crawlSite({
        startUrl: start,
        userAgent: userAgent(appVersion),
        render: renderPage,
        signal
      })
      if (crawl.pages.length === 0) throw new Error("We couldn't read any pages from your website.")
      // Website ingest: the pages become raw sources; the index stays with the run's drafts.
      const date = isoDay()
      const pages = await writeCrawlToRaw(wikiRoot, crawl, date)
      await sources.seed(pages.map((p, i) => ({ ...p, title: crawl.pages[i]?.title })))
      await writeCrawl(
        root,
        crawl,
        runId,
        pages.map((p) => p.rel)
      )
      const host = new URL(start).hostname.replace(/^www\./, '')
      await appendLog(
        wikiRoot,
        'ingest',
        `${pages.length} pages from ${host} (raw/articles/)`,
        date
      )
      await writeIndexes(wikiRoot)
      return { output: CRAWL_INDEX, note: `${crawl.pages.length} pages` }
    },
    'assemble-company-research': ({ root, profile, runId }) =>
      assembleCompanyResearch({ root, profile, runId }),
    'assemble-playbook': ({ root, profile, runId }) => assemblePlaybook({ root, profile, runId }),
    extract: async ({ root, wikiRoot, runId }) => {
      // Files are ingested when they are added; this picks up anything dropped into inbox/ by hand.
      const records = await ingestInbox(wikiRoot)
      await writeFilesIndex(root, records, runId)
      const read = records.filter((r) => r.status === 'ok').length
      return {
        output: FILES_INDEX,
        note: records.length ? `${read} of ${records.length} files read` : 'No files added'
      }
    }
  }
}

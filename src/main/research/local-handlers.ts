import { crawlSite } from '../ingest/crawler'
import { extractInputs } from '../ingest/extract'
import { renderPage } from '../ingest/render-window'
import { writeCrawl } from '../ingest/write-crawl'
import { normalizeWebsite } from '@shared/url'
import { userAgent } from '../user-agent'
import type { LocalHandler } from './types'
import type { LocalRunner } from './executor'

/** The local tasks that exist so far. The assemble steps arrive with the research and playbook tasks. */
export function localHandlers(appVersion: string): Partial<Record<LocalHandler, LocalRunner>> {
  return {
    crawl: async ({ root, profile, runId, signal }) => {
      const start = normalizeWebsite(profile.company.website)
      if (!start) throw new Error('The company website address is not valid.')
      const crawl = await crawlSite({
        startUrl: start,
        userAgent: userAgent(appVersion),
        render: renderPage,
        signal
      })
      if (crawl.pages.length === 0) throw new Error("We couldn't read any pages from your website.")
      const output = await writeCrawl(root, crawl, runId)
      return {
        output: 'memory/research/website/index.md',
        note: `${crawl.pages.length} pages${output ? '' : ''}`
      }
    },
    extract: async ({ root, runId }) => {
      const results = await extractInputs(root, runId)
      const read = results.filter((r) => r.status === 'ok').length
      return {
        output: 'memory/research/inputs-extracted/index.md',
        note: results.length ? `${read} of ${results.length} files read` : 'No files added'
      }
    }
  }
}

import { app } from 'electron'
import { normalizeWebsite } from '@shared/url'
import type { AppContext } from '../context'
import { crawlSite } from '../ingest/crawler'
import { extractInputs } from '../ingest/extract'
import { renderPage } from '../ingest/render-window'
import { writeCrawl } from '../ingest/write-crawl'
import { userAgent } from './net'
import { HandlerError, type Handle } from './register'

/** Dev-only ways to run local ingestion directly. Never available in a packaged app. */
export function registerDev(handle: Handle, ctx: AppContext): void {
  const root = (): string => {
    if (app.isPackaged) throw new HandlerError('not_allowed')
    const r = ctx.settings.get().workspacePath
    if (!r) throw new HandlerError('no_workspace')
    return r
  }

  handle('dev:crawl', async ({ url, forceRender, pageBudget }) => {
    const ws = root()
    const start = normalizeWebsite(url)
    if (!start) throw new HandlerError('invalid_payload')
    const crawl = await crawlSite({
      startUrl: start,
      userAgent: userAgent(ctx.appVersion),
      pageBudget,
      render: renderPage,
      renderBelowWords: forceRender ? Number.MAX_SAFE_INTEGER : undefined
    })
    const indexPath = await writeCrawl(ws, crawl)
    return {
      pages: crawl.pages.map((p) => ({
        url: p.url,
        title: p.title,
        words: p.wordCount,
        rendered: p.rendered,
        slug: p.slug
      })),
      social: crawl.social,
      skipped: crawl.skipped,
      robots: crawl.robots,
      indexPath
    }
  })

  handle('dev:extract', async () => extractInputs(root()))
}

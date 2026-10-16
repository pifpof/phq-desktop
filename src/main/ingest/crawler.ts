import robotsParser from 'robots-parser'
import { XMLParser } from 'fast-xml-parser'
import { parsePage, type ParsedPage, type SocialLink } from './html-to-md'

export const PAGE_BUDGET = 30
export const MIN_WORDS_BEFORE_RENDER = 200
const MAX_BLOG_POSTS = 3
const MAX_HTML_BYTES = 2 * 1024 * 1024
const MAX_SITEMAP_URLS = 500

export interface CrawledPage extends ParsedPage {
  url: string
  slug: string
  rendered: boolean
}

export interface CrawlResult {
  startUrl: string
  pages: CrawledPage[]
  /** Social links found anywhere on the site, deduped. */
  social: SocialLink[]
  /** Pages that failed or were refused, with the reason. Never contains page content. */
  skipped: { url: string; reason: string }[]
  robots: 'honoured' | 'none'
}

export interface CrawlOptions {
  startUrl: string
  userAgent: string
  pageBudget?: number
  delayMs?: number
  timeoutMs?: number
  /** Fetch a URL. Defaults to global fetch. Injected in tests. */
  fetchFn?: typeof fetch
  /** Renders a JavaScript-heavy page and returns its HTML, or null. */
  render?: (url: string) => Promise<string | null>
  /** Render any page with fewer words than this. Defaults to 200. Tests and QA raise it. */
  renderBelowWords?: number
  sleep?: (ms: number) => Promise<void>
  onProgress?: (done: number, url: string) => void
  signal?: AbortSignal
}

/** Path words that rank a page. Higher is crawled sooner. */
const PRIORITY: [RegExp, number][] = [
  [
    /(^|\/)(product|products|solution|solutions|platform|features?|how-it-works|services?)(\/|$|-)/,
    80
  ],
  [/(^|\/)pricing(\/|$)/, 75],
  [/(^|\/)(about|company|team|story)(\/|$|-)/, 70],
  [/(^|\/)(customers?|case-stud(y|ies)|stories|success)(\/|$|-)/, 65],
  [/(^|\/)(why|vs|compare|comparison|alternatives?)(\/|$|-)/, 60]
]
const BLOG = /(^|\/)(blog|news|insights|articles|resources)(\/|$)/
const SKIP_PATH =
  /(^|\/)(legal|privacy|terms|careers|jobs|login|log-in|signin|sign-in|signup|sign-up|cookie|cookies|unsubscribe|cart|checkout)(\/|$|-)/
const SKIP_HOST = /^(app|docs|help|support|status|developers?)\./
const SKIP_EXT = /\.(pdf|png|jpe?g|gif|svg|webp|ico|css|js|json|xml|zip|mp4|mp3|woff2?|ttf|txt)$/i

export const hostKey = (host: string): string => host.toLowerCase().replace(/^www\./, '')

export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    u.hash = ''
    for (const k of [...u.searchParams.keys()])
      if (/^(utm_|fbclid|gclid|ref$)/i.test(k)) u.searchParams.delete(k)
    u.pathname = u.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/'
    return u.toString()
  } catch {
    return null
  }
}

export interface Candidate {
  url: string
  score: number
  blog: boolean
}

/** Score a URL for crawl order. Returns null for pages that must never be crawled. */
export function scoreUrl(url: string, startHost: string): Candidate | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (hostKey(u.hostname) !== hostKey(startHost)) return null
  if (SKIP_HOST.test(u.hostname) || SKIP_EXT.test(u.pathname)) return null
  const path = u.pathname.toLowerCase()
  if (SKIP_PATH.test(path)) return null
  if (path === '/' || path === '') return { url, score: 100, blog: false }
  if (BLOG.test(path))
    return { url, score: 10 - Math.min(path.split('/').length, 9) / 10, blog: true }
  for (const [re, score] of PRIORITY)
    if (re.test(path)) return { url, score: score - path.split('/').length / 10, blog: false }
  // Other shallow pages beat deep ones.
  return { url, score: 40 - path.split('/').length * 4, blog: false }
}

export function slugFor(url: string, taken: Set<string>): string {
  const u = new URL(url)
  let base =
    u.pathname
      .replace(/^\/|\/$/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 80) || 'home'
  if (u.search)
    base = `${base}-${u.search
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20)}`
  let slug = base
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`
  taken.add(slug)
  return slug
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Text file that really is text. Sites that soft-404 return an HTML page with status 200. */
async function fetchText(
  fetchFn: typeof fetch,
  url: string,
  userAgent: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<{ text: string; finalUrl: string; type: string } | null> {
  try {
    const res = await fetchFn(url, {
      headers: {
        'user-agent': userAgent,
        accept: 'text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.5'
      },
      redirect: 'follow',
      signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])])
    })
    if (!res.ok) return null
    const type = (res.headers.get('content-type') ?? '').toLowerCase()
    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_HTML_BYTES) return null
    return { text: new TextDecoder().decode(buf), finalUrl: res.url || url, type }
  } catch {
    return null
  }
}

const looksLikeHtml = (text: string): boolean => /^\s*(<!doctype html|<html)/i.test(text)

async function sitemapUrls(
  fetchFn: typeof fetch,
  sitemapLocs: string[],
  userAgent: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<string[]> {
  const parser = new XMLParser({ ignoreAttributes: true })
  const out: string[] = []
  const queue = [...sitemapLocs]
  let fetched = 0
  while (queue.length && fetched < 4 && out.length < MAX_SITEMAP_URLS) {
    const loc = queue.shift()!
    fetched++
    const res = await fetchText(fetchFn, loc, userAgent, timeoutMs, signal)
    if (!res || looksLikeHtml(res.text)) continue
    try {
      const doc = parser.parse(res.text)
      const asArray = <T>(v: T | T[] | undefined): T[] =>
        v === undefined ? [] : Array.isArray(v) ? v : [v]
      for (const s of asArray<{ loc?: string }>(doc?.sitemapindex?.sitemap))
        if (s.loc) queue.push(String(s.loc))
      for (const u of asArray<{ loc?: string }>(doc?.urlset?.url))
        if (u.loc) out.push(String(u.loc))
    } catch {
      // malformed sitemap: ignore
    }
  }
  return out.slice(0, MAX_SITEMAP_URLS)
}

/**
 * T1: crawl the user's own site. Same host only (www and non-www count as the same site),
 * robots.txt honoured, one request per second, no cookies, no credentials.
 */
export async function crawlSite(opts: CrawlOptions): Promise<CrawlResult> {
  const fetchFn = opts.fetchFn ?? fetch
  const budget = opts.pageBudget ?? PAGE_BUDGET
  const delayMs = opts.delayMs ?? 1000
  const timeoutMs = opts.timeoutMs ?? 15_000
  const sleep = opts.sleep ?? defaultSleep
  const start = normalizeUrl(opts.startUrl)
  if (!start) throw new Error('Invalid start URL')
  const startUrl = new URL(start)
  const origin = startUrl.origin

  const result: CrawlResult = {
    startUrl: start,
    pages: [],
    social: [],
    skipped: [],
    robots: 'none'
  }
  const socialSeen = new Set<string>()
  let lastRequest = 0
  const throttle = async (gap: number): Promise<void> => {
    const wait = lastRequest + gap - Date.now()
    if (lastRequest && wait > 0) await sleep(wait)
    lastRequest = Date.now()
  }

  // robots.txt: only a plain-text answer counts. A soft-404 HTML page means "no robots".
  let robots: ReturnType<typeof robotsParser> | null = null
  const robotsRes = await fetchText(
    fetchFn,
    `${origin}/robots.txt`,
    opts.userAgent,
    timeoutMs,
    opts.signal
  )
  if (robotsRes && !robotsRes.type.includes('html') && !looksLikeHtml(robotsRes.text)) {
    robots = robotsParser(`${origin}/robots.txt`, robotsRes.text)
    result.robots = 'honoured'
  }
  const allowed = (url: string): boolean => robots?.isAllowed(url, opts.userAgent) !== false
  const robotsDelay = robots?.getCrawlDelay(opts.userAgent)
  const effectiveDelay = Math.max(delayMs, Math.min((robotsDelay ?? 0) * 1000, 10_000))

  const candidates = new Map<string, Candidate>()
  const consider = (raw: string): void => {
    const url = normalizeUrl(raw)
    if (!url || candidates.has(url)) return
    const c = scoreUrl(url, startUrl.hostname)
    if (c) candidates.set(url, c)
  }
  consider(start)
  const homeUrl = normalizeUrl(origin)!
  consider(homeUrl)

  const sitemapLocs = [...(robots?.getSitemaps() ?? []), `${origin}/sitemap.xml`]
  for (const u of await sitemapUrls(fetchFn, sitemapLocs, opts.userAgent, timeoutMs, opts.signal))
    consider(u)

  const done = new Set<string>()
  const slugs = new Set<string>()
  let blogCount = 0

  while (result.pages.length < budget && !opts.signal?.aborted) {
    const next = [...candidates.values()]
      .filter((c) => !done.has(c.url) && !(c.blog && blogCount >= MAX_BLOG_POSTS))
      .sort((a, b) => b.score - a.score)[0]
    if (!next) break
    done.add(next.url)

    if (!allowed(next.url)) {
      result.skipped.push({ url: next.url, reason: 'Blocked by robots.txt' })
      continue
    }
    await throttle(effectiveDelay)

    const res = await fetchText(fetchFn, next.url, opts.userAgent, timeoutMs, opts.signal)
    if (!res) {
      result.skipped.push({ url: next.url, reason: 'Could not fetch' })
      continue
    }
    // A redirect off the site is not our page to read.
    const final = normalizeUrl(res.finalUrl)
    if (!final || hostKey(new URL(final).hostname) !== hostKey(startUrl.hostname)) {
      result.skipped.push({ url: next.url, reason: 'Redirected to another site' })
      continue
    }
    if (!res.type.includes('html') && !looksLikeHtml(res.text)) {
      result.skipped.push({ url: next.url, reason: 'Not an HTML page' })
      continue
    }
    done.add(final)

    let parsed = parsePage(res.text, final)
    let rendered = false
    if (parsed.wordCount < (opts.renderBelowWords ?? MIN_WORDS_BEFORE_RENDER) && opts.render) {
      const html = await opts.render(final)
      if (html) {
        const again = parsePage(html, final)
        if (again.wordCount > parsed.wordCount) {
          parsed = again
          rendered = true
        }
      }
    }

    if (next.blog) blogCount++
    result.pages.push({ ...parsed, url: final, slug: slugFor(final, slugs), rendered })
    for (const s of parsed.social) {
      if (!socialSeen.has(s.url)) {
        socialSeen.add(s.url)
        result.social.push(s)
      }
    }
    for (const link of parsed.links) consider(link)
    opts.onProgress?.(result.pages.length, final)
  }
  return result
}

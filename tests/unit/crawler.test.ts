import http from 'http'
import type { AddressInfo } from 'net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { crawlSite, normalizeUrl, scoreUrl, slugFor } from '../../src/main/ingest/crawler'
import { parsePage } from '../../src/main/ingest/html-to-md'

const lorem = (n: number): string => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
const page = (title: string, body: string, links: string[] = [], head = ''): string =>
  `<!doctype html><html><head><title>${title}</title>${head}</head><body><nav>${links
    .map((l) => `<a href="${l}">x</a>`)
    .join(
      ''
    )}</nav><main><h1>${title}</h1><h2>Section of ${title}</h2><p>${body}</p></main></body></html>`

type Routes = Record<
  string,
  { status?: number; type?: string; body: string; headers?: Record<string, string> }
>

let server: http.Server
let base = ''
let requests: { path: string; ua: string; cookie: string | undefined }[] = []
let routes: Routes = {}

beforeEach(async () => {
  requests = []
  server = http.createServer((req, res) => {
    requests.push({
      path: req.url ?? '',
      ua: String(req.headers['user-agent']),
      cookie: req.headers.cookie
    })
    const r = routes[(req.url ?? '').split('?')[0]]
    if (!r) {
      res.writeHead(404, { 'content-type': 'text/html' })
      return res.end('not found')
    }
    res.writeHead(r.status ?? 200, { 'content-type': r.type ?? 'text/html', ...r.headers })
    res.end(r.body)
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(() => new Promise<void>((ok) => server.close(() => ok())))

const crawl = (extra = {}) =>
  crawlSite({
    startUrl: base,
    userAgent: 'TestBot/1',
    delayMs: 0,
    sleep: async () => undefined,
    ...extra
  })

describe('url helpers', () => {
  it('normalises and scores', () => {
    expect(normalizeUrl('https://a.com/x/?utm_source=z&b=1#frag')).toBe('https://a.com/x?b=1')
    expect(scoreUrl('https://a.com/', 'a.com')!.score).toBe(100)
    expect(scoreUrl('https://a.com/pricing', 'a.com')!.score).toBeGreaterThan(
      scoreUrl('https://a.com/blog/post', 'a.com')!.score
    )
    expect(scoreUrl('https://www.a.com/about', 'a.com')).not.toBeNull()
    for (const bad of [
      'https://a.com/privacy',
      'https://a.com/careers/eng',
      'https://a.com/login',
      'https://app.a.com/',
      'https://docs.a.com/',
      'https://b.com/',
      'https://a.com/file.pdf',
      'https://a.com/legal/terms'
    ]) {
      expect(scoreUrl(bad, 'a.com'), bad).toBeNull()
    }
    expect(slugFor('https://a.com/', new Set())).toBe('home')
    const taken = new Set<string>()
    expect(slugFor('https://a.com/Product/Pricing', taken)).toBe('product-pricing')
    expect(slugFor('https://a.com/product-pricing', taken)).toBe('product-pricing-2')
  })
})

describe('crawlSite', () => {
  it('crawls priority pages first, caps blog posts at 3, skips legal and off-site links', async () => {
    routes = {
      '/': {
        body: page('Home', lorem(300), [
          '/pricing',
          '/about',
          '/privacy',
          '/careers',
          '/login',
          'https://other.example/x',
          '/blog/1',
          '/blog/2',
          '/blog/3',
          '/blog/4',
          '/blog/5',
          '/product',
          '/misc/deep/page'
        ])
      },
      '/pricing': { body: page('Pricing', lorem(300)) },
      '/about': { body: page('About', lorem(300)) },
      '/product': { body: page('Product', lorem(300)) },
      '/misc/deep/page': { body: page('Deep', lorem(300)) },
      ...Object.fromEntries(
        [1, 2, 3, 4, 5].map((n) => [`/blog/${n}`, { body: page(`Post ${n}`, lorem(300)) }])
      )
    }
    const r = await crawl()
    const paths = r.pages.map((p) => new URL(p.url).pathname)
    expect(paths[0]).toBe('/')
    expect(paths.indexOf('/product')).toBeLessThan(paths.indexOf('/misc/deep/page'))
    expect(paths.filter((p) => p.startsWith('/blog/'))).toHaveLength(3)
    const asked = requests.map((q) => q.path)
    for (const never of ['/privacy', '/careers', '/login']) expect(asked).not.toContain(never)
    expect(r.pages.every((p) => p.markdown.length > 0)).toBe(true)
  })

  it('stops at the page budget', async () => {
    routes = {
      '/': {
        body: page(
          'Home',
          lorem(300),
          Array.from({ length: 40 }, (_, i) => `/p${i}`)
        )
      }
    }
    for (let i = 0; i < 40; i++) routes[`/p${i}`] = { body: page(`P${i}`, lorem(300)) }
    expect((await crawl()).pages).toHaveLength(30)
    expect((await crawl({ pageBudget: 5 })).pages).toHaveLength(5)
  })

  it('honours robots.txt', async () => {
    routes = {
      '/robots.txt': { type: 'text/plain', body: 'User-agent: *\nDisallow: /secret\n' },
      '/': { body: page('Home', lorem(300), ['/secret', '/open']) },
      '/secret': { body: page('Secret', lorem(300)) },
      '/open': { body: page('Open', lorem(300)) }
    }
    const r = await crawl()
    expect(r.robots).toBe('honoured')
    expect(requests.map((q) => q.path)).not.toContain('/secret')
    expect(r.skipped).toContainEqual({ url: `${base}/secret`, reason: 'Blocked by robots.txt' })
    expect(r.pages.map((p) => new URL(p.url).pathname).sort()).toEqual(['/', '/open'])
  })

  it('treats a soft-404 HTML answer for robots.txt and sitemap.xml as "none"', async () => {
    const soft = {
      body: '<!doctype html><html><head><title>This Page Does Not Exist</title></head><body>Disallow: /</body></html>'
    }
    routes = {
      '/robots.txt': soft,
      '/sitemap.xml': soft,
      '/': { body: page('Home', lorem(300), ['/a']) },
      '/a': { body: page('A', lorem(300)) }
    }
    const r = await crawl()
    expect(r.robots).toBe('none')
    expect(r.pages).toHaveLength(2)
  })

  it('uses a sitemap, including an index of sitemaps', async () => {
    routes = {
      '/sitemap.xml': {
        type: 'application/xml',
        body: `<sitemapindex><sitemap><loc>${base}/s1.xml</loc></sitemap></sitemapindex>`
      },
      '/s1.xml': {
        type: 'application/xml',
        body: `<urlset><url><loc>${base}/hidden-page</loc></url></urlset>`
      },
      '/': { body: page('Home', lorem(300)) },
      '/hidden-page': { body: page('Hidden', lorem(300)) }
    }
    expect((await crawl()).pages.map((p) => new URL(p.url).pathname)).toContain('/hidden-page')
  })

  it('collects social links from anywhere on the site, deduped, and sends the user agent without cookies', async () => {
    routes = {
      '/': {
        body: page('Home', lorem(300), [
          '/about',
          'https://www.linkedin.com/company/acme',
          'https://x.com/acme'
        ])
      },
      '/about': {
        body: page('About', lorem(300), [
          'https://www.linkedin.com/company/acme',
          'https://instagram.com/acme',
          'https://www.youtube.com/@acme'
        ])
      }
    }
    const r = await crawl()
    expect(r.social.map((s) => s.network).sort()).toEqual(['Instagram', 'LinkedIn', 'X', 'YouTube'])
    expect(requests.every((q) => q.ua === 'TestBot/1' && q.cookie === undefined)).toBe(true)
  })

  it('does not follow a redirect to another host', async () => {
    const other = base.replace('127.0.0.1', 'localhost')
    routes = {
      '/': { body: page('Home', lorem(300), ['/jump']) },
      '/jump': { status: 302, body: '', headers: { location: `${other}/landed` } },
      '/landed': { body: page('Landed', lorem(300)) }
    }
    const r = await crawl()
    expect(r.pages.map((p) => new URL(p.url).pathname)).toEqual(['/'])
    expect(r.skipped.some((s) => s.reason === 'Redirected to another site')).toBe(true)
  })

  it('skips non-HTML and failing pages without failing the crawl', async () => {
    routes = {
      '/': { body: page('Home', lorem(300), ['/data', '/gone', '/ok']) },
      '/data': { type: 'application/json', body: '{"a":1}' },
      '/ok': { body: page('Ok', lorem(300)) }
    }
    const r = await crawl()
    expect(r.pages.map((p) => new URL(p.url).pathname).sort()).toEqual(['/', '/ok'])
    expect(r.skipped.length).toBeGreaterThanOrEqual(2)
  })

  it('spaces requests by the delay', async () => {
    routes = {
      '/': { body: page('Home', lorem(300), ['/a', '/b']) },
      '/a': { body: page('A', lorem(300)) },
      '/b': { body: page('B', lorem(300)) }
    }
    const waits: number[] = []
    await crawlSite({
      startUrl: base,
      userAgent: 'T',
      delayMs: 1000,
      sleep: async (ms) => void waits.push(ms)
    })
    expect(waits.length).toBeGreaterThanOrEqual(2)
    expect(waits.every((w) => w > 0 && w <= 1000)).toBe(true)
  })

  it('renders thin pages with the fallback and keeps the richer result', async () => {
    routes = {
      '/': {
        body: '<html><head><title>Shell</title></head><body><div id="app"></div></body></html>'
      }
    }
    const seen: string[] = []
    const r = await crawl({
      render: async (url: string) => {
        seen.push(url)
        return page('Rendered', lorem(400))
      }
    })
    expect(seen).toHaveLength(1)
    expect(r.pages[0].rendered).toBe(true)
    expect(r.pages[0].wordCount).toBeGreaterThan(300)
  })

  it('does not render pages that already have enough text', async () => {
    routes = { '/': { body: page('Home', lorem(300)) } }
    let called = false
    await crawl({ render: async () => ((called = true), null) })
    expect(called).toBe(false)
  })
})

describe('parsePage', () => {
  it('extracts metadata, headings and markdown, and drops scripts', () => {
    const html = `<html><head><title>Acme | Rockets</title><meta name="description" content="Rockets for all"><meta property="og:title" content="OG Title"><meta property="og:description" content="OG desc"><script>var secret=1</script></head>
      <body><h1>Rockets that arrive</h1><h2>Why us</h2><p>${lorem(150)}</p><table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>
      <a href="https://linkedin.com/company/acme">in</a><a href="/pricing#top">Pricing</a><a href="mailto:a@b.co">mail</a></body></html>`
    const p = parsePage(html, 'https://acme.com/')
    expect(p).toMatchObject({
      title: 'Acme | Rockets',
      description: 'Rockets for all',
      ogTitle: 'OG Title',
      ogDescription: 'OG desc',
      h1: ['Rockets that arrive'],
      h2: ['Why us']
    })
    expect(p.markdown).not.toContain('secret=1')
    expect(p.markdown).toContain('| a | b |')
    expect(p.links).toEqual(['https://acme.com/pricing'])
    expect(p.social).toEqual([{ network: 'LinkedIn', url: 'https://linkedin.com/company/acme' }])
    expect(p.wordCount).toBeGreaterThan(140)
  })
})

describe('parsePage links', () => {
  it('makes links and images absolute in the markdown', () => {
    const html = `<html><body><h1>Hi</h1><p>${lorem(150)} <a href="/pricing/">Pricing</a> <img src="/logo.png" alt="logo"></p></body></html>`
    const p = parsePage(html, 'https://acme.com/about')
    expect(p.markdown).toContain('(https://acme.com/pricing/)')
    expect(p.markdown).toContain('(https://acme.com/logo.png)')
  })
})

describe('crawled pages follow the copy rule', () => {
  it('writes raw pages without em dashes, tagged own-site and by page type', async () => {
    const { mkdtempSync, mkdirSync, readFileSync } = await import('fs')
    const { tmpdir } = await import('os')
    const { join } = await import('path')
    const { writeCrawlToRaw, pageType } = await import('../../src/main/ingest/website-to-raw')
    const root = mkdtempSync(join(tmpdir(), 'phq-wc-'))
    mkdirSync(join(root, 'raw/articles'), { recursive: true })
    const p = parsePage(
      `<html><body><h1>Fast — cheap</h1><p>${lorem(150)} — more</p><table><tr><th>a</th></tr><tr><td>—</td></tr></table></body></html>`,
      'https://a.com/'
    )
    const crawl = {
      startUrl: 'https://a.com/',
      pages: [
        { ...p, url: 'https://www.a.com/', slug: 'home', rendered: false },
        { ...p, url: 'https://www.a.com/pricing/', slug: 'pricing', rendered: false }
      ],
      social: [],
      skipped: [],
      robots: 'none' as const
    }
    const pages = await writeCrawlToRaw(root, crawl, '2026-10-17')
    expect(pages.map((x) => x.rel)).toEqual([
      'raw/articles/2026-10-17-a-com-home.md',
      'raw/articles/2026-10-17-a-com-pricing.md'
    ])
    const home = readFileSync(join(root, pages[0].rel), 'utf8')
    expect(home).not.toContain('—')
    expect(home).toContain('tags: [website, own-site, home]')
    expect(home).toContain('source: "https://www.a.com/"')
    // A second crawl the same day never overwrites the first.
    const again = await writeCrawlToRaw(root, crawl, '2026-10-17')
    expect(again[0].rel).toBe('raw/articles/2026-10-17-a-com-home-2.md')
    expect(pageType('https://a.com/about-us')).toBe('about')
    expect(pageType('https://a.com/customers/case-studies')).toBe('customers')
    expect(pageType('https://a.com/x')).toBe('page')
  })
})

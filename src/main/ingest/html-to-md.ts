import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

export const SOCIAL_HOSTS: Record<string, string> = {
  'linkedin.com': 'LinkedIn',
  'x.com': 'X',
  'twitter.com': 'X',
  'instagram.com': 'Instagram',
  'facebook.com': 'Facebook',
  'youtube.com': 'YouTube'
}

export interface SocialLink {
  network: string
  url: string
}

export interface ParsedPage {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  h1: string[]
  h2: string[]
  markdown: string
  wordCount: number
  /** Same-page links, absolute, hash removed. The crawler filters them. */
  links: string[]
  social: SocialLink[]
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-'
})
turndown.use(gfm)
turndown.remove(['script', 'style', 'noscript', 'iframe', 'svg'])

const words = (text: string): number => text.split(/\s+/).filter(Boolean).length

/** Words a reader would see, ignoring markdown punctuation and link targets. */
export function countWords(markdown: string): number {
  return words(
    markdown
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[#*_`>|~-]+/g, ' ')
  )
}

export function socialNetwork(href: string): string | null {
  try {
    const host = new URL(href).hostname.toLowerCase().replace(/^www\./, '')
    for (const [h, name] of Object.entries(SOCIAL_HOSTS)) {
      if (host === h || host.endsWith(`.${h}`)) return name
    }
  } catch {
    // not a URL
  }
  return null
}

/** Makes links and images absolute, so a page's markdown still makes sense read on its own. */
interface Queryable {
  querySelectorAll(selector: string): Iterable<{
    getAttribute(name: string): string | null
    setAttribute(name: string, value: string): void
  }>
}

function absolutize(document: Queryable, pageUrl: string): void {
  for (const [selector, attr] of [
    ['a[href]', 'href'],
    ['img[src]', 'src']
  ] as const) {
    for (const el of document.querySelectorAll(selector)) {
      const raw = el.getAttribute(attr) ?? ''
      if (/^(mailto:|tel:|javascript:|data:|#)/i.test(raw)) continue
      try {
        el.setAttribute(attr, new URL(raw, pageUrl).href)
      } catch {
        // leave as is
      }
    }
  }
}

const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim()

/** Turns raw HTML into markdown and the metadata the research tasks need. */
export function parsePage(html: string, pageUrl: string): ParsedPage {
  const { document } = parseHTML(html)
  const meta = (sel: string): string => clean(document.querySelector(sel)?.getAttribute('content'))

  const links: string[] = []
  const social: SocialLink[] = []
  const seen = new Set<string>()
  for (const a of document.querySelectorAll('a[href]')) {
    const raw = a.getAttribute('href') ?? ''
    if (/^(mailto:|tel:|javascript:|#)/i.test(raw)) continue
    let abs: URL
    try {
      abs = new URL(raw, pageUrl)
    } catch {
      continue
    }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') continue
    abs.hash = ''
    const network = socialNetwork(abs.href)
    if (network) {
      if (!seen.has(abs.href)) {
        seen.add(abs.href)
        social.push({ network, url: abs.href })
      }
    } else {
      links.push(abs.href)
    }
  }

  const headings = (tag: string): string[] =>
    [...document.querySelectorAll(tag)].map((h) => clean(h.textContent)).filter(Boolean)
  const h1 = headings('h1')
  const h2 = headings('h2')
  const title = clean(document.querySelector('title')?.textContent)
  const description = meta('meta[name="description"]')
  const ogTitle = meta('meta[property="og:title"]')
  const ogDescription = meta('meta[property="og:description"]')

  // Readability mutates the DOM, so run it on a fresh parse.
  let contentHtml = ''
  try {
    const doc = parseHTML(html).document
    absolutize(doc, pageUrl)
    const article = new Readability(doc as unknown as Document, { charThreshold: 100 }).parse()
    contentHtml = article?.content ?? ''
  } catch {
    // fall through to the body
  }
  let markdown = contentHtml ? turndown.turndown(contentHtml).trim() : ''
  // Readability can drop most of a marketing page (heroes, feature grids). Fall back to the body.
  if (countWords(markdown) < 120) {
    const fallback = parseHTML(html).document
    absolutize(fallback, pageUrl)
    const body = fallback.body
    const bodyMd = body ? turndown.turndown(body.innerHTML).trim() : ''
    if (countWords(bodyMd) > countWords(markdown)) markdown = bodyMd
  }
  markdown = markdown.replace(/\n{3,}/g, '\n\n')

  return {
    title,
    description,
    ogTitle,
    ogDescription,
    h1,
    h2,
    markdown,
    wordCount: countWords(markdown),
    links,
    social
  }
}

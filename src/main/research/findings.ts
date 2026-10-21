import { readFile, stat } from 'fs/promises'
import matter from 'gray-matter'
import type { Finding } from '@shared/research'
import { PLAYBOOK_STEPS } from '../wiki/article-map'
import { stringField, stringList } from '../wiki/frontmatter'
import { readTakeaways } from '../wiki/sections'
import { readPlaybookExtras } from '../state/playbook-extras'
import { resolveInside } from '../workspace/paths'
import { loadArticles, type ExistingArticle } from './article-output'
import { stripPrefix } from './assemble-playbook'

/**
 * "What we've found so far" (REQUIREMENTS-v4.4 4.3): one card per kind of finding, read from
 * article front matter, a fixed line of a body, or a task draft. No model call. Private material
 * never shows: a card built from a page tagged `private` is left out. Cards whose data is missing
 * are left out, never shown with placeholders.
 */

const isPrivate = (a: ExistingArticle): boolean => stringList(a.data.tags).includes('private')

async function readDraft(
  root: string,
  rel: string
): Promise<{ data: Record<string, unknown>; body: string; at: number } | null> {
  const full = resolveInside(root, rel)
  if (!full) return null
  try {
    const [text, s] = await Promise.all([readFile(full, 'utf8'), stat(full)])
    const { data, content } = matter(text)
    return { data, body: content, at: s.mtimeMs }
  } catch {
    return null
  }
}

async function mtime(root: string, rel: string): Promise<number> {
  const full = resolveInside(root, rel)
  try {
    return full ? (await stat(full)).mtimeMs : 0
  } catch {
    return 0
  }
}

const domain = (url: string): string =>
  url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')

const clip = (s: string, n = 220): string => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

export interface FindingsInput {
  wikiRoot: string
  /** Task drafts in app state. */
  draftsRoot: string
  company: string
  website: string
}

export async function buildFindings(d: FindingsInput): Promise<Finding[]> {
  const out: Finding[] = []
  const articles = await loadArticles(d.wikiRoot)
  const article = (slug: string): ExistingArticle | undefined => {
    const a = articles.get(slug)
    return a && !isPrivate(a) ? a : undefined
  }
  const card = (
    f: Omit<Finding, 'body' | 'quote' | 'chips' | 'open' | 'step'> & Partial<Finding>
  ) => out.push({ body: null, quote: null, chips: [], open: null, step: null, ...f })

  // Website crawl: "We read <N> pages of <domain>."
  const crawl = await readDraft(d.draftsRoot, 'memory/research/website/index.md')
  const pages = Number(crawl?.data.pages)
  if (crawl && pages > 0)
    card({
      id: 'crawl',
      title: `We read ${pages} ${pages === 1 ? 'page' : 'pages'} of ${domain(d.website) || 'your website'}.`,
      at: crawl.at
    })

  // Website positioning: the homepage headline, quoted, with its link.
  const messaging = article('current-messaging')
  const hero = messaging && /\*\*Headline[^*]*:\*\*\s*"?([^"\n]+)"?/i.exec(messaging.body)?.[1]
  if (messaging && hero)
    card({
      id: 'hero',
      title: 'Your homepage says',
      quote: { text: hero.trim(), url: d.website || null },
      open: messaging.path,
      at: await mtime(d.wikiRoot, messaging.path)
    })

  // Company research: the company in one line.
  const overview = article('company-overview')
  const summary = overview && stringField(overview.data.summary)
  if (overview && summary)
    card({
      id: 'company',
      title: `${d.company || 'Your company'} in one line`,
      body: clip(summary),
      open: overview.path,
      at: await mtime(d.wikiRoot, overview.path)
    })

  // Competitors: their names, with the category term on hover.
  const competitors = [...articles.values()].filter(
    (a) => a.slug.startsWith('competitor-') && !isPrivate(a)
  )
  if (competitors.length)
    card({
      id: 'competitors',
      title: `${competitors.length} ${competitors.length === 1 ? 'competitor' : 'competitors'} found`,
      chips: competitors.map((c) => ({
        name: stripPrefix(c.title, 'Competitor'),
        term: /^\*\*Category term:\*\*\s*(.+)$/m.exec(c.body)?.[1]?.trim() ?? null
      })),
      open: article('competitive-landscape')?.path ?? competitors[0].path,
      at: Math.max(...(await Promise.all(competitors.map((c) => mtime(d.wikiRoot, c.path)))))
    })

  // Public proof: how many reviews and mentions, and the first quote with its source.
  const proof = await readDraft(d.draftsRoot, 'memory/research/proof-public.md')
  const found = proof ? stringList(proof.data.raw_sources).length : 0
  if (proof && found) {
    const quote = /^>\s*(.+)$/m.exec(proof.body)?.[1]?.replace(/^"|"$/g, '').trim()
    card({
      id: 'proof',
      title: `${found} ${found === 1 ? 'review or mention' : 'reviews and mentions'} found`,
      quote: quote ? { text: clip(quote), url: stringList(proof.data.sources)[0] ?? null } : null,
      open: article('proof-points')?.path ?? null,
      at: proof.at
    })
  }

  // Each playbook section: written, with its first key takeaway.
  const extras = await readPlaybookExtras(d.wikiRoot).catch(() => ({}))
  for (const step of PLAYBOOK_STEPS) {
    const a = step.slug ? articles.get(step.slug) : undefined
    const kids = step.cards
      ? [...articles.values()].filter((x) => x.slug.startsWith(step.cards!))
      : []
    const written = a ?? kids[0]
    if (!written) continue
    if ((a && isPrivate(a)) || (!a && kids.some(isPrivate))) continue
    const first = a
      ? readTakeaways(a.body)?.[0]
      : (extras as Record<string, { takeaways: string[] | null } | undefined>)[step.id]
          ?.takeaways?.[0]
    card({
      id: `section-${step.id}`,
      title: `${step.title} is written`,
      body: first ?? null,
      open: written.path,
      step: step.id,
      at: Math.max(
        ...(await Promise.all([a, ...kids].filter(Boolean).map((x) => mtime(d.wikiRoot, x!.path))))
      )
    })
  }

  return out.sort((x, y) => y.at - x.at)
}

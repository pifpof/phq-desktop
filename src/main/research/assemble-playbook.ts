import { writeFile } from 'fs/promises'
import { anchor } from '@shared/anchor'
import { stringifyDoc, stringList } from '../wiki/frontmatter'
import { writeIndexes } from '../wiki/index-gen'
import { appendLog } from '../wiki/log'
import { nextOutputVersion, outputRel, safeJoin } from '../wiki/paths'
import { loadArticles, splitSections, type ExistingArticle } from './article-output'
import { replaceEmDashes } from './postprocess'

/**
 * The positioning playbook, assembled from wiki articles with no model call (REQUIREMENTS-v2 3.4).
 * The articles are the source of truth; each assembly writes the next version in output/ and
 * never touches an earlier one. Reassembling after an article edit costs nothing.
 */

export const PLAYBOOK_KIND = 'positioning-playbook'

/** The seven sections in skill-pack order, and the articles each is built from. */
export const PLAYBOOK_SECTIONS: { n: number; title: string; slug: string; pattern?: string }[] = [
  { n: 1, title: 'Market Overview', slug: 'market-overview' },
  { n: 2, title: 'Target Customers', slug: 'ideal-customer-profile' },
  { n: 3, title: 'Value Drivers', slug: 'value-drivers', pattern: 'value-driver-' },
  { n: 4, title: 'Distinct Advantages', slug: '', pattern: 'moat-' },
  { n: 5, title: 'Positioning Statement', slug: 'positioning-statement' },
  { n: 6, title: 'Competitive Intelligence', slug: 'competitive-landscape' },
  { n: 7, title: 'Customer Proof Points', slug: 'proof-points' }
]

export const sectionHeading = (s: { n: number; title: string }): string =>
  `Section ${s.n}: ${s.title}`

/** Moves headings down `levels` (## to ###), outside code blocks. */
export function demote(md: string, levels: number): string {
  let inCode = false
  return md
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) inCode = !inCode
      if (inCode) return line
      const m = /^(#{1,6})(\s.*)$/.exec(line)
      return m ? `${'#'.repeat(Math.min(6, m[1].length + levels))}${m[2]}` : line
    })
    .join('\n')
}

/** Two-form links and wikilinks become their plain title: the playbook is a document to read and share. */
export const plainLinks = (md: string): string =>
  md
    .replace(/\[\[[^\]|]+\|([^\]]*)\]\]\s*\(\[[^\]]*\]\((?:<[^>\n]+>|[^)\n]+)\)\)/g, '$1')
    .replace(/\[\[([^\]|]+)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/(?<!!)\[([^\]\n]+)\]\((?!https?:)(<[^>\n]+>|[^)\s]+\.md)\)/g, '$1')

/** An article's body for the playbook: no title, abstract, See Also or Sources. */
export function articleContent(a: ExistingArticle, levels: number): string {
  const { head, sections } = splitSections(a.body)
  // The head is "# Title", the abstract quote and, for competitors, the category term line.
  const intro = head
    .replace(/^#\s+.*\n?/, '')
    .replace(/^>.*(\n>.*)*\n?/m, '')
    .replace(/^\*\*Category term:\*\*.*\n?/m, '')
    .trim()
  const kept = sections
    .filter((s) => !['See Also', 'Sources'].includes(s.heading))
    .map((s) => s.text)
  return demote(plainLinks([intro, ...kept].filter(Boolean).join('\n\n')), levels).trim()
}

/** Competitor name (and aliases) to its category term, from each competitor article. */
export function categoryTerms(articles: Map<string, ExistingArticle>): {
  terms: { names: string[]; term: string }[]
  missing: string[]
} {
  const terms: { names: string[]; term: string }[] = []
  const missing: string[] = []
  for (const a of articles.values()) {
    if (!a.slug.startsWith('competitor-')) continue
    const term = /^\*\*Category term:\*\*\s*(.+)$/m.exec(a.body)?.[1]?.trim()
    const names = [a.title, ...stringList(a.data.aliases)]
      .map((n) => n.trim())
      .filter((n) => n.length > 1)
    if (!term) missing.push(a.title)
    else terms.push({ names, term })
  }
  return { terms, missing }
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Replaces competitor names with category terms in prose (not inside link targets or code). */
export function applyCategoryTerms(md: string, terms: { names: string[]; term: string }[]): string {
  const pairs = terms
    .flatMap((t) => t.names.map((n) => ({ name: n, term: t.term })))
    .sort((a, b) => b.name.length - a.name.length)
  if (!pairs.length) return md
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}])(${pairs.map((p) => escapeRe(p.name)).join('|')})(?![\\p{L}\\p{N}])`,
    'giu'
  )
  const termOf = (name: string): string =>
    pairs.find((p) => p.name.toLowerCase() === name.toLowerCase())?.term ?? name
  let inCode = false
  return md
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) inCode = !inCode
      if (inCode) return line
      // Leave URLs alone: split out (...) link targets and bare URLs.
      return line
        .split(/(\]\([^)]*\)|https?:\/\/\S+)/)
        .map((part, i) => (i % 2 ? part : part.replace(re, (m) => termOf(m))))
        .join('')
    })
    .join('\n')
}

export interface Assembled {
  text: string
  sources: string[]
  missingSections: string[]
  missingTerms: string[]
}

/** The playbook text, from the articles. Pure: same articles in, same text out. */
export function assemblePlaybookText(
  articles: Map<string, ExistingArticle>,
  o: { company: string; version: number; date: string }
): Assembled {
  const sources: string[] = []
  const missingSections: string[] = []
  const parts: string[] = []
  for (const s of PLAYBOOK_SECTIONS) {
    const heading = sectionHeading(s)
    parts.push(`## ${heading}`)
    const main = s.slug ? articles.get(s.slug) : undefined
    const children = s.pattern
      ? [...articles.values()]
          .filter((a) => a.slug.startsWith(s.pattern!))
          .sort((a, b) => order(main, a, b))
      : []
    if (!main && !children.length) {
      missingSections.push(heading)
      parts.push('Not written yet. Run the playbook research to fill this section.')
      continue
    }
    if (main) {
      sources.push(main.path)
      parts.push(articleContent(main, 1))
    }
    for (const c of children) {
      sources.push(c.path)
      const label = s.n === 3 ? `Value Driver: ${c.title}` : c.title
      parts.push(`### ${label}`, articleContent(c, 2))
    }
  }
  const { terms, missing } = categoryTerms(articles)
  const toc = PLAYBOOK_SECTIONS.map(
    (s, i) => `${i + 1}. [${s.title}](#${anchor(sectionHeading(s))})`
  )
  const body = [
    `# Positioning Playbook: ${o.company}`,
    '',
    `Version ${o.version}, assembled on ${o.date} from the wiki articles in its sources. Edit an article, then reassemble.`,
    '',
    '## Table of Contents',
    '',
    ...toc,
    '',
    applyCategoryTerms(parts.join('\n\n'), terms)
  ].join('\n')
  const front = {
    title: `Positioning Playbook: ${o.company} (v${o.version})`,
    type: 'report',
    created: o.date,
    updated: o.date,
    summary: 'Seven-section positioning playbook assembled from the wiki.',
    sources: [...new Set(sources)]
  }
  return {
    text: stringifyDoc('output', front, replaceEmDashes(body)),
    sources: front.sources,
    missingSections,
    missingTerms: missing
  }
}

/** Value drivers in the order the index article links them, then by title. */
function order(main: ExistingArticle | undefined, a: ExistingArticle, b: ExistingArticle): number {
  const at = (x: ExistingArticle): number => {
    const i = main ? main.body.indexOf(x.slug) : -1
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  return at(a) - at(b) || a.title.localeCompare(b.title)
}

/** T20: writes output/positioning-playbook-v<N>-<date>.md. */
export async function assemblePlaybook(
  wikiRoot: string,
  company: string,
  date: string
): Promise<{ output: string; version: number; note: string; sources: string[] }> {
  const articles = await loadArticles(wikiRoot)
  const version = await nextOutputVersion(wikiRoot, PLAYBOOK_KIND)
  const out = assemblePlaybookText(articles, { company, version, date })
  const rel = outputRel(PLAYBOOK_KIND, version, date)
  await writeFile(safeJoin(wikiRoot, rel), out.text, { flag: 'wx' })
  await appendLog(wikiRoot, 'output', `positioning playbook v${version} -> ${rel}`, date)
  await writeIndexes(wikiRoot)
  const notes = [`Version ${version}`]
  if (out.missingSections.length)
    notes.push(`${out.missingSections.length} sections not written yet`)
  if (out.missingTerms.length) notes.push(`no category term for ${out.missingTerms.join(', ')}`)
  return { output: rel, version, note: notes.join('; '), sources: out.sources }
}

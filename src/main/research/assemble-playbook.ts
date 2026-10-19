import { writeFile } from 'fs/promises'
import { anchor } from '@shared/anchor'
import type { Gap, StepId } from '@shared/playbook'
import { PLAYBOOK_STEPS, type PlaybookStep } from '../wiki/article-map'
import { stringField, stringifyDoc, stringList } from '../wiki/frontmatter'
import { writeIndexes } from '../wiki/index-gen'
import { appendLog } from '../wiki/log'
import { nextOutputVersion, outputRel, safeJoin } from '../wiki/paths'
import {
  GAP_HEADING,
  readGap,
  readTakeaways,
  renderTakeawaysAndGap,
  TAKEAWAYS_HEADING
} from '../wiki/sections'
import { loadArticles, splitSections, type ExistingArticle } from './article-output'
import { readPlaybookExtras } from '../state/playbook-extras'
import { replaceEmDashes } from './postprocess'

/**
 * The positioning playbook, assembled from wiki articles with no model call (REQUIREMENTS-v2 3.4).
 * The articles are the source of truth; each assembly writes the next version in output/ and
 * never touches an earlier one. Reassembling after an article edit costs nothing.
 */

export const PLAYBOOK_KIND = 'positioning-playbook'

export const sectionHeading = (s: { n: number; title: string }): string =>
  `Section ${s.n}: ${s.title}`

/** The prefix an article title may carry ("Value Driver: Speed", "Value Driver Speed"), dropped once or more. */
export const stripPrefix = (title: string, label: string | null): string => {
  if (!label) return title.trim()
  const re = new RegExp(
    `^(?:${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s*:\\s*|\\s+))+`,
    'i'
  )
  return title.replace(re, '').trim() || title.trim()
}

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

/** Sections the playbook places itself, or leaves out. */
const SKIPPED = ['See Also', 'Sources', TAKEAWAYS_HEADING, GAP_HEADING].map((h) => h.toLowerCase())

/** An article's body for the playbook: no title, abstract, See Also, Sources, takeaways or gap. */
export function articleContent(a: ExistingArticle, levels: number, only?: string[]): string {
  const { head, sections } = splitSections(a.body)
  // The head is "# Title", the abstract quote and, for competitors, the category term line.
  const intro = head
    .replace(/^#\s+.*\n?/, '')
    .replace(/^>.*(\n>.*)*\n?/m, '')
    .replace(/^\*\*Category term:\*\*.*\n?/m, '')
    .trim()
  const kept = sections
    .filter((s) => !SKIPPED.includes(s.heading.toLowerCase()))
    .filter((s) => !only || only.includes(s.heading.toLowerCase()))
    .map((s) => s.text)
  const parts = only ? kept : [intro, ...kept]
  return demote(plainLinks(parts.filter(Boolean).join('\n\n')), levels).trim()
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

/** Takeaways and a gap for a step with no article of its own (Distinct Advantages, REQUIREMENTS-v4 7.1). */
export type PlaybookExtras = Partial<
  Record<StepId, { takeaways: string[] | null; gap: Gap | null }>
>

const WIN_SECTION = 'when we win and lose'

/** A competitor's win story, the line its card shows collapsed. */
const winStory = (a: ExistingArticle): string =>
  plainLinks(/\*\*Win story:\*\*\s*(.+)/i.exec(a.body)?.[1]?.trim() ?? '')

const firstSection = (a: ExistingArticle): string =>
  splitSections(a.body)
    .sections.map((s) => s.heading.toLowerCase())
    .find((h) => !SKIPPED.includes(h)) ?? ''

/** The cards for a step: one per article, or one per category term for competitors. */
function cards(
  step: PlaybookStep,
  main: ExistingArticle | undefined,
  articles: Map<string, ExistingArticle>,
  terms: { names: string[]; term: string }[]
): { sources: string[]; text: string[] } {
  if (!step.cards) return { sources: [], text: [] }
  const children = [...articles.values()]
    .filter((a) => a.slug.startsWith(step.cards!))
    .sort((a, b) => order(main, a, b))
  const competitor = step.cards === 'competitor-'
  // Competitors that share a category term share one card (decided 2026-10-19).
  const groups = new Map<string, ExistingArticle[]>()
  for (const c of children) {
    const key = competitor
      ? (terms.find((t) => t.names.includes(c.title))?.term ?? c.title)
      : stripPrefix(c.title, step.cardLabel)
    groups.set(key, [...(groups.get(key) ?? []), c])
  }
  const text: string[] = []
  for (const [title, members] of groups) {
    text.push(`### ${step.cardLabel}: ${title}`)
    const wins = members.map(winStory).filter(Boolean)
    const lines =
      competitor && wins.length ? wins : members.map((m) => plainLinks(stringField(m.data.summary)))
    const line = [...new Set(lines.filter(Boolean))].join(' ')
    if (line) text.push(line)
    for (const m of members) {
      const body = competitor
        ? articleContent(m, 2, [WIN_SECTION]) ||
          articleContent(m, 2, ['executive summary']) ||
          articleContent(m, 2, [firstSection(m)])
        : articleContent(m, 2)
      if (body) text.push(body)
    }
  }
  return { sources: children.map((c) => c.path), text }
}

/** The playbook text, from the articles. Pure: same articles in, same text out. */
export function assemblePlaybookText(
  articles: Map<string, ExistingArticle>,
  o: { company: string; version: number; date: string },
  extras: PlaybookExtras = {}
): Assembled {
  const sources: string[] = []
  const missingSections: string[] = []
  const parts: string[] = []
  const { terms, missing } = categoryTerms(articles)
  for (const s of PLAYBOOK_STEPS) {
    const heading = sectionHeading(s)
    parts.push(`## ${heading}`)
    const main = s.slug ? articles.get(s.slug) : undefined
    const card = cards(s, main, articles, terms)
    if (!main && !card.text.length) {
      missingSections.push(heading)
      parts.push('Not written yet. Run the playbook research to fill this section.')
      continue
    }
    const own = main
      ? { takeaways: readTakeaways(main.body), gap: readGap(main.body) }
      : (extras[s.id] ?? { takeaways: null, gap: null })
    const top = renderTakeawaysAndGap(own.takeaways, own.gap, 3)
    if (top) parts.push(top)
    if (main) {
      sources.push(main.path)
      const content = articleContent(main, 1)
      if (content) parts.push(content)
    }
    sources.push(...card.sources)
    parts.push(...card.text)
  }
  const toc = PLAYBOOK_STEPS.map((s, i) => `${i + 1}. [${s.title}](#${anchor(sectionHeading(s))})`)
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
  const extras = await readPlaybookExtras(wikiRoot).catch(() => ({}))
  const out = assemblePlaybookText(articles, { company, version, date }, extras)
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

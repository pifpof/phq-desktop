import { readFile } from 'fs/promises'
import type { Change } from '@shared/changes'
import {
  GAP_PRIORITY,
  readingMinutes,
  type Card,
  type Gap,
  type Overview,
  type PlaybookSection,
  type PlaybookView,
  type SectionMeta,
  type Statement,
  type StepId
} from '@shared/playbook'
import { parseScorecard, type Score } from '@shared/scorecard'
import {
  applyCategoryTerms,
  categoryTerms,
  PLAYBOOK_KIND,
  plainLinks,
  stripPrefix
} from '../research/assemble-playbook'
import { loadArticles, splitSections, type ExistingArticle } from '../research/article-output'
import { PLAYBOOK_STEPS, type PlaybookStep } from './article-map'
import { listChanges } from './changes'
import { parseDoc, stringField, stringList } from './frontmatter'
import { outputVersions, safeJoin } from './paths'
import { GAP_HEADING, readGap, readTakeaways, TAKEAWAYS_HEADING } from './sections'

/**
 * The Positioning Playbook page model (REQUIREMENTS-v4 3 to 6), with no model call. Sections,
 * takeaways, gaps and cards come from the chosen output version, so older versions render as
 * they were written. The right panel and the overview read the live articles.
 */

// ---------------------------------------------------------------- markdown helpers

/** Splits at headings of exactly this level, outside code blocks. */
export function splitAt(
  md: string,
  level: number
): { before: string; parts: { heading: string; text: string }[] } {
  const lines = md.split('\n')
  const marker = new RegExp(`^#{${level}}\\s+(.+?)\\s*$`)
  let inCode = false
  const before: string[] = []
  const parts: { heading: string; lines: string[] }[] = []
  for (const line of lines) {
    if (/^\s*```/.test(line)) inCode = !inCode
    const m = inCode ? null : marker.exec(line)
    if (m) parts.push({ heading: m[1], lines: [] })
    else (parts.at(-1)?.lines ?? before).push(line)
  }
  return {
    before: before.join('\n').trim(),
    parts: parts.map((p) => ({ heading: p.heading, text: p.lines.join('\n').trim() }))
  }
}

/** Blocks separated by blank lines, keeping code fences whole. */
function blocks(md: string): string[] {
  const out: string[] = []
  let cur: string[] = []
  let inCode = false
  for (const line of md.split('\n')) {
    if (/^\s*```/.test(line)) inCode = !inCode
    if (!inCode && !line.trim()) {
      if (cur.length) out.push(cur.join('\n'))
      cur = []
    } else cur.push(line)
  }
  if (cur.length) out.push(cur.join('\n'))
  return out
}

const isParagraph = (b: string): boolean =>
  !/^(#{1,6}\s|\||[-*+]\s|\d+[.)]\s|>|```|\*\*[^*]+:\*\*\s*$)/.test(b.trim())

const words = (md: string): number =>
  md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_|`[\]()-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim()

/**
 * The lede: the first paragraph, if it comes before any second heading. Its heading is dropped
 * when nothing else sits under it, so the body never starts with an empty heading.
 */
export function takeLede(md: string): { lede: string; rest: string } {
  const bs = blocks(md)
  let headings = 0
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i]
    if (/^#{1,6}\s/.test(b)) {
      if (++headings > 1) break
      continue
    }
    if (!isParagraph(b)) break
    const rest = [...bs.slice(0, i), ...bs.slice(i + 1)]
    // A heading left with nothing under it (next block is a heading of the same or higher level).
    const h = i > 0 ? /^(#{1,6})\s/.exec(rest[i - 1] ?? '') : null
    const next = /^(#{1,6})\s/.exec(rest[i] ?? '')
    if (h && (rest[i] === undefined || (next && next[1].length <= h[1].length)))
      rest.splice(i - 1, 1)
    return { lede: oneLine(b), rest: rest.join('\n\n') }
  }
  return { lede: '', rest: md.trim() }
}

/** Removes the Key takeaways and Gap to close subsections (### in an output). */
function withoutTakeawaysAndGap(md: string): string {
  const { before, parts } = splitAt(md, 3)
  const skip = [TAKEAWAYS_HEADING, GAP_HEADING].map((h) => h.toLowerCase())
  return [
    before,
    ...parts
      .filter((p) => !skip.includes(p.heading.toLowerCase()))
      .map((p) => `### ${p.heading}\n\n${p.text}`)
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Moves headings up one level, outside code, so a card's #### reads as ###. */
const promote = (md: string): string => {
  let inCode = false
  return md
    .split('\n')
    .map((l) => {
      if (/^\s*```/.test(l)) inCode = !inCode
      return !inCode && /^#{2,6}\s/.test(l) ? l.slice(1) : l
    })
    .join('\n')
}

// ---------------------------------------------------------------- sections

const MISSING_RE = /^Not written yet\./

/** Cards: every "### <label>: <title>" heading (older outputs repeat the label). */
function readCards(
  md: string,
  step: PlaybookStep,
  driverSlugs: Map<string, string>
): { body: string; cards: Card[] } {
  if (!step.cardLabel) return { body: md, cards: [] }
  const label = step.cardLabel
  const { before, parts } = splitAt(md, 3)
  const isCard = (h: string): boolean => new RegExp(`^${label}\\s*:`, 'i').test(h)
  const body = [
    before,
    ...parts.filter((p) => !isCard(p.heading)).map((p) => `### ${p.heading}\n\n${p.text}`)
  ]
    .filter(Boolean)
    .join('\n\n')
  const cards = parts
    .filter((p) => isCard(p.heading))
    .map((p, i): Card => {
      const title = stripPrefix(p.heading, label)
      const bs = blocks(p.text)
      const lead = bs[0] && isParagraph(bs[0]) ? bs[0] : ''
      const rest = lead ? bs.slice(1).join('\n\n') : p.text
      const fallback = bs.find(isParagraph) ?? ''
      return {
        id: `${step.id}-${i}`,
        title,
        line: oneLine(lead || fallback),
        body: promote(rest),
        slug: driverSlugs.get(title.toLowerCase()) ?? null
      }
    })
  return { body, cards }
}

/** The six-field statement table and the message variations (REQUIREMENTS-v4 6.1). */
function readStatement(md: string): { body: string; statement: Statement | null; after: string } {
  const { before, parts } = splitAt(md, 3)
  const tableAt = parts.findIndex(
    (p) => /positioning statement/i.test(p.heading) && /^\|/m.test(p.text)
  )
  if (tableAt < 0) return { body: md, statement: null, after: '' }
  const rows = parts[tableAt].text
    .split('\n')
    .filter((l) => /^\|/.test(l) && !/^\|\s*:?-{2,}/.test(l))
    .map((l) =>
      l
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim().replace(/^\*\*(.+)\*\*$/, '$1'))
    )
    .filter((cells) => cells.length >= 2)
  // The first row is the header ("Field | Positioning Component").
  const fields = rows.slice(1).map((c): [string, string] => [c[0], c.slice(1).join(' | ')])
  const tableNotes = parts[tableAt].text
    .split('\n')
    .filter((l) => !/^\|/.test(l))
    .join('\n')
    .trim()
  const varAt = parts.findIndex((p) => /variation/i.test(p.heading))
  const variations =
    varAt >= 0
      ? splitAt(parts[varAt].text, 4).parts.map((v) => ({ title: v.heading, body: v.text }))
      : []
  const used = new Set([tableAt, varAt])
  const head = [before, ...parts.slice(0, tableAt).map((p) => `### ${p.heading}\n\n${p.text}`)]
  const after = [
    tableNotes,
    ...parts
      .filter((_, i) => i > tableAt && !used.has(i))
      .map((p) => `### ${p.heading}\n\n${p.text}`)
  ]
  return {
    body: head.filter(Boolean).join('\n\n'),
    statement: { fields, variations },
    after: after.filter(Boolean).join('\n\n')
  }
}

// ---------------------------------------------------------------- live metadata

export interface ViewInput {
  path: string
  /** The output file's text, front matter included. */
  text: string
  articles: Map<string, ExistingArticle>
  changes: Change[]
  /** The newest Messaging Analysis's scores, if there is one. */
  scores: Score[] | null
  current: boolean
  company: string
}

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 } as const

function sectionArticles(
  step: PlaybookStep,
  articles: Map<string, ExistingArticle>
): ExistingArticle[] {
  const main = step.slug ? articles.get(step.slug) : undefined
  const kids = step.cards
    ? [...articles.values()]
        .filter((a) => a.slug.startsWith(step.cards!))
        .sort((a, b) => a.slug.localeCompare(b.slug))
    : []
  return [...(main ? [main] : []), ...kids]
}

function sectionMeta(
  step: PlaybookStep,
  articles: Map<string, ExistingArticle>,
  changes: Change[],
  scores: Score[] | null
): SectionMeta {
  const list = sectionArticles(step, articles)
  const main = step.slug ? articles.get(step.slug) : undefined
  const conf = (a: ExistingArticle): keyof typeof CONFIDENCE_RANK | null => {
    const c = stringField(a.data.confidence).toLowerCase()
    return c in CONFIDENCE_RANK ? (c as keyof typeof CONFIDENCE_RANK) : null
  }
  // The section's own article; for Distinct Advantages, the weakest moat.
  const confidence = main
    ? conf(main)
    : (list
        .map(conf)
        .filter((c): c is keyof typeof CONFIDENCE_RANK => c !== null)
        .sort((a, b) => CONFIDENCE_RANK[a] - CONFIDENCE_RANK[b])[0] ?? null)
  const sources = [
    ...new Set(list.flatMap((a) => stringList(a.data.sources).filter((s) => s.startsWith('raw/'))))
  ].sort()
  const dates = list
    .map((a) => stringField(a.data.updated))
    .filter(Boolean)
    .sort()
  const pages = main ? [main.slug] : list.map((a) => a.slug)
  const slugs = new Set(list.map((a) => a.slug))
  const waiting = changes.filter((c) => c.status === 'pending' && slugs.has(c.page)).length
  const score = step.scoreDimension
    ? scores?.find((s) => s.dimension === step.scoreDimension)
    : null
  return {
    confidence,
    sources,
    lastChanged: dates.at(-1) ?? null,
    waiting,
    article: (main ?? list[0])?.path ?? null,
    pages,
    articles: main ? [main.path] : list.map((a) => a.path),
    private: list.some((a) => stringList(a.data.tags).includes('private')),
    scoreChip: score ? { dimension: score.dimension, score: score.score, max: 5 } : null
  }
}

// ---------------------------------------------------------------- overview

/** Value drivers in the order the index article links them, then by title. */
function orderedDrivers(articles: Map<string, ExistingArticle>): ExistingArticle[] {
  const index = articles.get('value-drivers')?.body ?? ''
  const at = (a: ExistingArticle): number => {
    const i = index.indexOf(a.slug)
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  return [...articles.values()]
    .filter((a) => a.slug.startsWith('value-driver-'))
    .sort((a, b) => at(a) - at(b) || a.title.localeCompare(b.title))
}

/** The one-sentence statement: the first message variation's opening paragraph, else the summary. */
function statementLine(a: ExistingArticle | undefined): string | null {
  if (!a) return null
  const variations = splitSections(a.body).sections.find((s) => /variation/i.test(s.heading))
  if (variations) {
    const first = splitAt(variations.text.replace(/^##[^\n]*\n/, ''), 3).parts[0]
    const para = first ? blocks(first.text).find(isParagraph) : undefined
    if (para) return oneLine(plainLinks(para))
  }
  return stringField(a.data.summary) || null
}

export function biggestGap(
  sections: { id: StepId; gap: Gap | null }[],
  scores: Score[] | null
): { step: StepId; problem: string } | null {
  const withGap = new Map(sections.filter((s) => s.gap).map((s) => [s.id, s.gap!]))
  if (!withGap.size) return null
  if (scores) {
    const ranked = [...scores].sort((a, b) => a.score - b.score)
    for (const s of ranked) {
      const step = PLAYBOOK_STEPS.find((p) => p.scoreDimension === s.dimension)
      if (step && withGap.has(step.id))
        return { step: step.id, problem: withGap.get(step.id)!.problem }
    }
  }
  const first = GAP_PRIORITY.find((id) => withGap.has(id))
  return first ? { step: first, problem: withGap.get(first)!.problem } : null
}

// ---------------------------------------------------------------- the page

export function buildPlaybookView(input: ViewInput): PlaybookView {
  const { data, body } = parseDoc(input.text) ?? { data: {}, body: input.text }
  const { terms } = categoryTerms(input.articles)
  const terms_ = (s: string | null): string | null => (s ? applyCategoryTerms(s, terms) : s)
  const drivers = orderedDrivers(input.articles)
  const driverSlugs = new Map(
    drivers.map((d) => [stripPrefix(d.title, 'Value Driver').toLowerCase(), d.slug])
  )
  const bySection = new Map(
    splitAt(body, 2)
      .parts.map((p) => ({ m: /^Section (\d+):/.exec(p.heading), p }))
      .filter((x) => x.m)
      .map((x) => [Number(x.m![1]), x.p.text])
  )
  const sections: PlaybookSection[] = PLAYBOOK_STEPS.map((step) => {
    const raw = bySection.get(step.n) ?? ''
    const missing = !raw || MISSING_RE.test(raw)
    const takeaways = readTakeaways(raw)
    const gap = readGap(raw)
    let content = withoutTakeawaysAndGap(raw)
    let statement: Statement | null = null
    let after = ''
    let cards: Card[] = []
    if (step.id === 'positioning') {
      const s = readStatement(content)
      content = s.body
      statement = s.statement
      after = s.after
    } else {
      const c = readCards(content, step, driverSlugs)
      content = c.body
      cards = c.cards
    }
    const { lede, rest } = missing ? { lede: '', rest: '' } : takeLede(content)
    const w = words(raw)
    return {
      id: step.id,
      n: step.n,
      title: step.title,
      label: step.stepLabel,
      words: w,
      minutes: readingMinutes(w),
      takeaways,
      gap,
      lede,
      body: promote(rest),
      cards,
      statement,
      after: promote(after),
      markdown: raw ? `## ${step.title}\n\n${raw}`.trim() + '\n' : '',
      missing,
      meta: sectionMeta(step, input.articles, input.changes, input.scores)
    }
  })
  const overview: Overview = {
    statement: terms_(statementLine(input.articles.get('positioning-statement'))),
    drivers: drivers.slice(0, 3).map((d) => ({
      slug: d.slug,
      title: stripPrefix(d.title, 'Value Driver'),
      line: terms_(stringField(d.data.summary)) ?? ''
    })),
    whoFor: terms_(stringField(input.articles.get('ideal-customer-profile')?.data.summary) || null),
    upAgainst: terms_(
      stringField(input.articles.get('competitive-landscape')?.data.summary) || null
    ),
    biggestGap: biggestGap(sections, input.scores)
  }
  return {
    path: input.path,
    version: Number(/-v(\d+)-/.exec(input.path)?.[1] ?? 0),
    date: /-(\d{4}-\d{2}-\d{2})\.md$/.exec(input.path)?.[1] ?? stringField(data.created),
    company: input.company,
    current: input.current,
    sections,
    overview,
    needsTakeaways: input.current && sections.some((s) => !s.missing && !s.takeaways),
    private: sections.some((s) => s.meta.private)
  }
}

/** The page for a version (null: the newest), or null when there is no playbook. */
export async function playbookView(
  root: string,
  path: string | null,
  company: string
): Promise<PlaybookView | null> {
  const versions = await outputVersions(root, PLAYBOOK_KIND)
  const newest = versions.at(-1)?.rel ?? null
  const rel = path ?? newest
  if (!rel || !versions.some((v) => v.rel === rel)) return null
  let text: string
  try {
    text = await readFile(safeJoin(root, rel), 'utf8')
  } catch {
    return null
  }
  const analyses = await outputVersions(root, 'messaging-analysis')
  let scores: Score[] | null = null
  const latest = analyses.at(-1)
  if (latest) {
    scores = await readFile(safeJoin(root, latest.rel), 'utf8')
      .then(parseScorecard)
      .catch(() => null)
  }
  return buildPlaybookView({
    path: rel,
    text,
    articles: await loadArticles(root),
    changes: await listChanges(root).catch(() => []),
    scores,
    current: rel === newest,
    company
  })
}

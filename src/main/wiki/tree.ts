import {
  NAV_SECTIONS,
  VIRTUAL_PARENTS,
  type Marker,
  type NavSection,
  type TreeNode,
  type TreeSection,
  type TreeSource,
  type SourceKind,
  type VirtualParent,
  type WikiTree
} from '@shared/wiki-tree'
import { ARTICLE_MAP, specFor, type ArticleSpec } from './article-map'
import { isFirstParty, maxConfidence, type SourceInfo } from './confidence'
import { stringField, stringList } from './frontmatter'
import { linkedSlugs } from './links'
import type { WikiFile } from './scan'

/**
 * The Wiki pane's article tree (REQUIREMENTS-v3 3). Pure: built from scanned files (front matter
 * and file times) and provenance times, with no model call and no file reads of its own.
 */

/** When and in which run the app wrote a file (from provenance.json). */
export interface Generated {
  /** ms since the epoch. */
  at: number
  runId: string
}

export interface TreeInput {
  files: WikiFile[]
  /** Per wiki path. */
  generated: Record<string, Generated>
}

/** A file this much newer than a time counts as newer. */
const SLACK_MS = 5_000

const day = (v: unknown): string => stringField(v).slice(0, 10)

/** Competitor profiles run as one task per competitor; the group re-runs together. */
export const taskForSlug = (spec: ArticleSpec | null, slug: string): string | null => {
  if (!spec || spec.task === 'app') return null
  return slug.startsWith('competitor-') ? 'competitor-profiles' : spec.task
}

/** Drops "Value Driver:", "Moat 2 -" and the like from a child's title (REQUIREMENTS-v3 3.2). */
export function stripPrefix(title: string, prefix: string | null): string {
  if (!prefix) return title
  const words = prefix.trim().split(/\s+/).join('\\s+')
  const re = new RegExp(`^\\s*${words}s?\\s*\\d*\\s*[:\\-\\u2013\\u2014.]\\s*`, 'i')
  const out = title.replace(re, '').trim()
  return out || title
}

export function sourceKind(tags: string[]): SourceKind {
  if (tags.includes('legacy')) return 'legacy'
  if (tags.includes('private')) return 'file'
  if (tags.includes('social')) return 'social'
  if (tags.includes('own-site') || tags.includes('competitor-site')) return 'page'
  if (tags.includes('web-citation')) return 'citation'
  return 'other'
}

/** First-party first, then social, competitor sites, web citations, legacy (REQUIREMENTS-v3 3.4). */
function sourceRank(tags: string[]): number {
  if (tags.includes('legacy')) return 5
  if (tags.includes('own-site') || tags.includes('private')) return 0
  if (tags.includes('social')) return 1
  if (tags.includes('competitor-site')) return 2
  if (tags.includes('web-citation')) return 3
  return 4
}

interface Ctx {
  raw: Map<string, WikiFile>
  bySlug: Map<string, WikiFile>
  generated: Record<string, Generated>
  /** The last write of each run: files changed before it were part of that run. */
  runEnd: Map<string, number>
  /** Decision files linking to each slug. */
  decisionsFor: Map<string, WikiFile[]>
}

/** An article's sources, first-party first, newest first; missing files flagged. */
export function resolveSources(
  raw: Map<string, WikiFile>,
  f: WikiFile
): { list: TreeSource[]; info: SourceInfo[] } {
  const info: SourceInfo[] = []
  const rows = stringList(f.data?.sources).map((path) => {
    const r = raw.get(path)
    if (!r) {
      return {
        row: {
          path,
          title: path,
          kind: 'other' as const,
          private: false,
          exists: false,
          ingested: ''
        },
        rank: 9
      }
    }
    const tags = stringList(r.data?.tags)
    info.push({ path, source: stringField(r.data?.source), tags })
    return {
      row: {
        path,
        title: stringField(r.data?.title) || r.name,
        kind: sourceKind(tags),
        private: tags.includes('private'),
        exists: true,
        ingested: day(r.data?.ingested)
      },
      rank: sourceRank(tags)
    }
  })
  rows.sort(
    (a, b) =>
      a.rank - b.rank ||
      b.row.ingested.localeCompare(a.row.ingested) ||
      a.row.title.localeCompare(b.row.title)
  )
  return { list: rows.map((r) => r.row), info }
}

function lowConfidenceText(info: SourceInfo[]): string {
  if (!info.length) return 'Low confidence: no sources'
  const origins = new Set(
    info.map((s) => {
      try {
        return new URL(s.source).hostname.replace(/^www\./, '')
      } catch {
        return s.path
      }
    })
  ).size
  const firstParty = info.some(isFirstParty)
  if (origins === 1 && !firstParty) return 'Low confidence: one third-party source'
  if (!firstParty) return `Low confidence: ${origins} sources, none first-party`
  return maxConfidence(info) === 'low'
    ? 'Low confidence: too few independent sources'
    : 'Low confidence'
}

/**
 * Out of date (REQUIREMENTS-v3 3.5): a source, a linked decision or an article it depends on is
 * newer than this article. Articles compare by `updated` (and the time the app generated them,
 * when known) and never by file time, since See Also edits touch files without changing content.
 */
function outOfDateReason(ctx: Ctx, f: WikiFile, spec: ArticleSpec | null): string | null {
  const updated = day(f.data?.updated)
  if (!updated) return null
  const gen = ctx.generated[f.rel]
  // Only when the app wrote this version: an outside edit makes the generation time stale.
  const mine = gen && new Date(gen.at).toISOString().slice(0, 10) >= updated ? gen : null
  // Citation records gain excerpts while their run goes on, so only later changes count.
  const settled = mine ? Math.max(mine.at, ctx.runEnd.get(mine.runId) ?? mine.at) : null
  const newerFile = (other: WikiFile, otherDay: string): boolean =>
    otherDay > updated ||
    (settled !== null && otherDay >= updated && other.mtimeMs > settled + SLACK_MS)

  for (const path of stringList(f.data?.sources)) {
    const r = ctx.raw.get(path)
    if (r && newerFile(r, day(r.data?.ingested))) return 'Out of date: a source is newer'
  }
  for (const d of ctx.decisionsFor.get(f.name) ?? []) {
    if (newerFile(d, day(d.data?.created) || day(d.data?.updated)))
      return 'Out of date: a decision was recorded since'
  }
  for (const dep of spec?.dependsOn ?? []) {
    const deps = dep.endsWith('*')
      ? [...ctx.bySlug.values()].filter((a) => a.name.startsWith(dep.slice(0, -1)))
      : [ctx.bySlug.get(dep)].filter((a): a is WikiFile => !!a)
    for (const a of deps) {
      const theirs = ctx.generated[a.rel]
      // Articles from the same run were written in dependency order (later patches included).
      if (mine && theirs?.runId === mine.runId) continue
      const newer =
        day(a.data?.updated) > updated ||
        (mine !== null && theirs !== undefined && theirs.at > mine.at + SLACK_MS)
      if (newer) return `Out of date: ${stringField(a.data?.title) || a.name} changed since`
    }
  }
  return null
}

function articleNode(ctx: Ctx, f: WikiFile): TreeNode {
  const spec = specFor(f.name)
  const title = stringField(f.data?.title) || f.name
  const label = spec?.pattern ? stripPrefix(title, spec.labelPrefix) : spec?.navLabel || title
  const { list, info } = resolveSources(ctx.raw, f)
  const markers: Marker[] = []
  const stale = outOfDateReason(ctx, f, spec)
  if (stale) markers.push({ kind: 'outOfDate', text: stale })
  if (stringField(f.data?.confidence) === 'low')
    markers.push({ kind: 'lowConfidence', text: lowConfidenceText(info) })
  if ((ctx.decisionsFor.get(f.name) ?? []).length)
    markers.push({ kind: 'decision', text: 'A decision applies to this article' })
  if (stringList(f.data?.tags).includes('private'))
    markers.push({ kind: 'private', text: 'Private: built from your own files' })
  return {
    id: f.rel,
    kind: 'article',
    slug: f.name,
    path: f.rel,
    label,
    title,
    subtitle: spec?.navSubtitle ?? '',
    summary: stringField(f.data?.summary),
    help: spec ? spec.navHelp : 'Added outside the app, or by another tool.',
    aliases: stringList(f.data?.aliases),
    markers,
    sources: list,
    taskId: taskForSlug(spec, f.name),
    attention: markers.some((m) => m.kind === 'outOfDate' || m.kind === 'lowConfidence'),
    children: []
  }
}

function placeholder(spec: ArticleSpec, label: string): TreeNode {
  return {
    id: `missing:${spec.slug}`,
    kind: 'placeholder',
    slug: spec.pattern ? null : spec.slug,
    path: null,
    label,
    title: label,
    subtitle: '',
    summary: 'Not generated yet.',
    help: spec.navHelp,
    aliases: [],
    markers: [{ kind: 'missing', text: 'Not generated yet' }],
    sources: [],
    taskId: taskForSlug(spec, spec.slug),
    attention: false,
    children: []
  }
}

function group(id: VirtualParent, children: TreeNode[]): TreeNode {
  const label = VIRTUAL_PARENTS[id].label
  return {
    id: `group:${id}`,
    kind: 'group',
    slug: null,
    path: null,
    label,
    title: label,
    subtitle: '',
    summary: '',
    help: VIRTUAL_PARENTS[id].help,
    aliases: [],
    markers: [],
    sources: [],
    taskId: null,
    attention: children.some((c) => c.attention),
    children
  }
}

/** Orders children by where an index document links them, then `created`, then title. */
function orderBy(listing: string[]): (a: WikiFile, b: WikiFile) => number {
  const pos = (f: WikiFile): number => {
    const i = listing.indexOf(f.name)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  return (a, b) =>
    pos(a) - pos(b) ||
    day(a.data?.created).localeCompare(day(b.data?.created)) ||
    (stringField(a.data?.title) || a.name).localeCompare(stringField(b.data?.title) || b.name)
}

const countArticles = (nodes: TreeNode[]): number =>
  nodes.reduce((n, x) => n + (x.kind === 'article' ? 1 : 0) + countArticles(x.children), 0)

export function buildArticleTree(input: TreeInput): WikiTree {
  const articles = input.files.filter((f) => f.kind === 'article' && f.dir !== 'wiki/theses')
  const bySlug = new Map<string, WikiFile>()
  for (const a of articles) if (!bySlug.has(a.name)) bySlug.set(a.name, a)
  const decisionsFor = new Map<string, WikiFile[]>()
  for (const a of bySlug.values()) {
    if (specFor(a.name)?.slug !== 'decision-') continue
    for (const s of linkedSlugs(a.rel, a.body)) {
      if (s === a.name) continue
      decisionsFor.set(s, [...(decisionsFor.get(s) ?? []), a])
    }
  }
  const runEnd = new Map<string, number>()
  for (const g of Object.values(input.generated))
    runEnd.set(g.runId, Math.max(g.at, runEnd.get(g.runId) ?? 0))
  const ctx: Ctx = {
    raw: new Map(input.files.filter((f) => f.kind === 'raw').map((f) => [f.rel, f])),
    bySlug,
    generated: input.generated,
    runEnd,
    decisionsFor
  }

  // Children of patterns, by their spec.
  const byPattern = new Map<string, WikiFile[]>()
  const other: WikiFile[] = []
  for (const a of bySlug.values()) {
    const spec = specFor(a.name)
    if (!spec) other.push(a)
    else if (spec.pattern) byPattern.set(spec.slug, [...(byPattern.get(spec.slug) ?? []), a])
  }
  const kids = (prefix: string): WikiFile[] => byPattern.get(prefix) ?? []

  // Value drivers follow the value-drivers article; moats follow the newest playbook.
  const vd = bySlug.get('value-drivers')
  const vdOrder = vd ? linkedSlugs(vd.rel, vd.body) : []
  const playbook = input.files
    .filter((f) => f.kind === 'output' && /^positioning-playbook-v\d+/.test(f.name))
    .sort((a, b) => playbookVersion(b.name) - playbookVersion(a.name))[0]
  const moatOrder = playbook ? linkedSlugs(playbook.rel, playbook.body) : []

  const childNodes = (prefix: string, order: (a: WikiFile, b: WikiFile) => number): TreeNode[] =>
    [...kids(prefix)].sort(order).map((f) => articleNode(ctx, f))
  const patternSpec = (prefix: string): ArticleSpec => ARTICLE_MAP.find((a) => a.slug === prefix)!
  const withPlaceholder = (prefix: string, nodes: TreeNode[]): TreeNode[] =>
    nodes.length ? nodes : [placeholder(patternSpec(prefix), 'Not generated yet')]

  const vdNodes = childNodes('value-driver-', orderBy(vdOrder))
  // A missing value-drivers article is already a placeholder; no second one beneath it.
  const vdChildren = vd ? withPlaceholder('value-driver-', vdNodes) : vdNodes
  const moats = withPlaceholder('moat-', childNodes('moat-', orderBy(moatOrder)))
  const decisions = [...kids('decision-')]
    .sort(
      (a, b) =>
        (day(b.data?.created) || b.name.slice(9, 19)).localeCompare(
          day(a.data?.created) || a.name.slice(9, 19)
        ) || b.name.localeCompare(a.name)
    )
    .map((f) => articleNode(ctx, f))
  const competitors = withPlaceholder(
    'competitor-',
    childNodes('competitor-', () => 0).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
    )
  )

  // Top-level items per section, in map order.
  const top = new Map<NavSection, { order: number; node: TreeNode }[]>()
  const put = (section: NavSection, order: number, node: TreeNode): void => {
    top.set(section, [...(top.get(section) ?? []), { order, node }])
  }
  for (const spec of ARTICLE_MAP) {
    if (spec.pattern || spec.navParent) continue
    const f = bySlug.get(spec.slug)
    const node = f ? articleNode(ctx, f) : placeholder(spec, spec.navLabel)
    if (spec.slug === 'value-drivers') {
      node.children = vdChildren
      node.attention ||= vdChildren.some((c) => c.attention)
    }
    put(spec.navSection, spec.navOrder, node)
  }
  const parents: [VirtualParent, TreeNode[]][] = [
    ['moats', moats],
    ['decisions', decisions],
    ['competitor-profiles', competitors]
  ]
  for (const [id, children] of parents) {
    // Decisions are optional: no placeholder, and no heading until there is one.
    if (!children.length) continue
    put(VIRTUAL_PARENTS[id].section, VIRTUAL_PARENTS[id].order, group(id, children))
  }
  for (const f of other.sort((a, b) =>
    (stringField(a.data?.title) || a.name).localeCompare(stringField(b.data?.title) || b.name)
  ))
    put('other', 0, articleNode(ctx, f))

  const sections: TreeSection[] = []
  for (const s of NAV_SECTIONS) {
    const items = (top.get(s.id) ?? []).sort((a, b) => a.order - b.order).map((x) => x.node)
    if (!items.length) continue
    sections.push({
      id: s.id,
      label: s.label,
      help: s.help,
      count: countArticles(items),
      attention: items.some((i) => i.attention),
      items
    })
  }
  return { sections }
}

const playbookVersion = (name: string): number =>
  Number(/^positioning-playbook-v(\d+)/.exec(name)?.[1] ?? 0)

/** The tree as indented text, for tests and debugging. */
export function printTree(tree: WikiTree): string {
  const lines: string[] = []
  const walk = (nodes: TreeNode[], depth: number): void => {
    for (const n of nodes) {
      const marks = n.markers.map((m) => m.kind).join(',')
      const kind = n.kind === 'article' ? '' : ` (${n.kind})`
      lines.push(`${'  '.repeat(depth)}${n.label}${kind}${marks ? ` [${marks}]` : ''}`)
      walk(n.children, depth + 1)
    }
  }
  for (const s of tree.sections) {
    lines.push(`${s.label.toUpperCase()} ${s.count}${s.attention ? ' *' : ''}`)
    walk(s.items, 1)
  }
  return lines.join('\n')
}

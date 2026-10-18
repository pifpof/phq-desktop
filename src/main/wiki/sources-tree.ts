import {
  SOURCE_SECTIONS,
  type SourceGroup,
  type SourceNode,
  type SourceSection,
  type SourcesTree
} from '@shared/wiki-tree'
import { specFor } from './article-map'
import { stringField, stringList } from './frontmatter'
import type { WikiFile } from './scan'
import { sourceKind, stripPrefix } from './tree'

/** The Sources tab (REQUIREMENTS-v3 4): every raw file, grouped, with the articles citing it. */

const FILE_CATEGORIES: Record<string, string> = {
  'sales-collateral': 'Sales collateral',
  'customer-references': 'Customer references',
  'competitive-intel': 'Competitive intel',
  'company-strategy': 'Company strategy',
  roadmap: 'Roadmap',
  'help-docs': 'Help docs'
}

function sectionOf(tags: string[]): string {
  if (tags.includes('legacy')) return 'legacy'
  if (tags.includes('private')) return 'files'
  if (tags.includes('social')) return 'social'
  if (tags.includes('own-site')) return 'own-site'
  if (tags.includes('competitor-site')) return 'competitor-sites'
  if (tags.includes('web-citation')) return 'citations'
  return 'other'
}

const titleCase = (slug: string): string =>
  slug
    .split('-')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')

export function buildSourcesTree(files: WikiFile[]): SourcesTree {
  const articles = files.filter((f) => f.kind === 'article' && f.dir !== 'wiki/theses')
  const label = (a: WikiFile): string => {
    const spec = specFor(a.name)
    const title = stringField(a.data?.title) || a.name
    return spec?.pattern ? stripPrefix(title, spec.labelPrefix) : spec?.navLabel || title
  }
  const citedBy = new Map<string, { path: string; label: string }[]>()
  for (const a of articles)
    for (const s of new Set(stringList(a.data?.sources)))
      citedBy.set(s, [...(citedBy.get(s) ?? []), { path: a.rel, label: label(a) }])
  const competitorName = new Map(
    articles.filter((a) => specFor(a.name)?.slug === 'competitor-').map((a) => [a.name, label(a)])
  )

  const sections = new Map<string, { direct: SourceNode[]; groups: Map<string, SourceGroup> }>()
  for (const r of files.filter((f) => f.kind === 'raw')) {
    const tags = stringList(r.data?.tags)
    const node: SourceNode = {
      path: r.rel,
      title: stringField(r.data?.title) || r.name,
      kind: sourceKind(tags),
      private: tags.includes('private'),
      exists: true,
      ingested: stringField(r.data?.ingested).slice(0, 10),
      summary: stringField(r.data?.summary),
      citedBy: (citedBy.get(r.rel) ?? []).sort((a, b) => a.label.localeCompare(b.label))
    }
    const id = sectionOf(tags)
    const sec = sections.get(id) ?? {
      direct: [] as SourceNode[],
      groups: new Map<string, SourceGroup>()
    }
    sections.set(id, sec)
    let sub: { id: string; label: string } | null = null
    if (id === 'files') {
      const cat = tags.find((t) => FILE_CATEGORIES[t])
      sub = cat ? { id: cat, label: FILE_CATEGORIES[cat] } : null
    } else if (id === 'competitor-sites') {
      const c = tags.find((t) => t.startsWith('competitor-') && t !== 'competitor-site')
      sub = c ? { id: c, label: competitorName.get(c) ?? titleCase(c.slice(11)) } : null
    }
    if (!sub) sec.direct.push(node)
    else {
      const g: SourceGroup = sec.groups.get(sub.id) ?? { ...sub, sources: [] }
      g.sources.push(node)
      sec.groups.set(sub.id, g)
    }
  }

  const newest = (a: SourceNode, b: SourceNode): number =>
    b.ingested.localeCompare(a.ingested) || a.title.localeCompare(b.title)
  const out: SourceSection[] = []
  for (const s of SOURCE_SECTIONS) {
    const sec = sections.get(s.id)
    // Your files always shows, for its Add files action.
    if (!sec && s.id !== 'files') continue
    const direct = (sec?.direct ?? []).sort(newest)
    const groups = [...(sec?.groups.values() ?? [])]
      .map((g) => ({ ...g, sources: g.sources.sort(newest) }))
      .sort((a, b) =>
        s.id === 'files'
          ? Object.keys(FILE_CATEGORIES).indexOf(a.id) - Object.keys(FILE_CATEGORIES).indexOf(b.id)
          : a.label.localeCompare(b.label)
      )
    out.push({
      id: s.id,
      label: s.label,
      help: s.help,
      count: direct.length + groups.reduce((n, g) => n + g.sources.length, 0),
      sources: direct,
      groups
    })
  }
  return { sections: out }
}

import type {
  ArticleDetail,
  ArticleSummary,
  OutputVersion,
  SourceSummary
} from '@shared/wiki-views'
import { specFor } from './article-map'
import { stringField, stringList } from './frontmatter'
import { linkedSlugs } from './links'
import { outputVersions } from './paths'
import { scanWiki, type WikiFile } from './scan'

/** Read-only listings of the wiki for the app's views. Front matter only, plus backlinks. */

const groupOf = (slug: string): string => specFor(slug)?.group ?? 'Other'

function summaryOf(f: WikiFile): ArticleSummary {
  const d = f.data ?? {}
  return {
    slug: f.name,
    path: f.rel,
    title: stringField(d.title) || f.name,
    summary: stringField(d.summary),
    group: groupOf(f.name),
    category: stringField(d.category),
    confidence: stringField(d.confidence),
    volatility: stringField(d.volatility),
    verified: stringField(d.verified) || stringField(d.updated),
    updated: stringField(d.updated),
    private: stringList(d.tags).includes('private')
  }
}

export async function listArticles(root: string): Promise<ArticleSummary[]> {
  return (await scanWiki(root))
    .filter((f) => f.kind === 'article' && f.dir !== 'wiki/theses')
    .map(summaryOf)
    .sort((a, b) => a.group.localeCompare(b.group) || a.title.localeCompare(b.title))
}

/** Sources tab group (REQUIREMENTS-v2 4.1). */
export function sourceGroup(tags: string[]): string {
  if (tags.includes('private')) return 'Your files'
  if (tags.includes('social')) return 'Social'
  if (tags.includes('competitor-site')) return 'Competitor sites'
  if (tags.includes('own-site')) return 'Your website'
  if (tags.includes('web-citation')) return 'Web citations'
  return 'Other'
}

export async function listSources(root: string): Promise<SourceSummary[]> {
  return (await scanWiki(root))
    .filter((f) => f.kind === 'raw')
    .map((f) => {
      const d = f.data ?? {}
      const tags = stringList(d.tags)
      return {
        path: f.rel,
        title: stringField(d.title) || f.name,
        summary: stringField(d.summary),
        source: stringField(d.source),
        ingested: stringField(d.ingested),
        tags,
        group: sourceGroup(tags)
      }
    })
    .sort(
      (a, b) =>
        a.group.localeCompare(b.group) ||
        b.ingested.localeCompare(a.ingested) ||
        a.title.localeCompare(b.title)
    )
}

export async function articleDetail(root: string, path: string): Promise<ArticleDetail | null> {
  const files = await scanWiki(root)
  const f = files.find((x) => x.rel === path && x.kind === 'article')
  if (!f?.data) return null
  const raw = new Map(files.filter((x) => x.kind === 'raw').map((x) => [x.rel, x]))
  const articles = files.filter((x) => x.kind === 'article' && x.dir !== 'wiki/theses')
  const backlinks = articles
    .filter((a) => a.rel !== f.rel && linkedSlugs(a.rel, a.body).includes(f.name))
    .map((a) => ({ path: a.rel, title: stringField(a.data?.title) || a.name }))
    .sort((a, b) => a.title.localeCompare(b.title))
  const spec = specFor(f.name)
  return {
    article: summaryOf(f),
    body: f.body,
    aliases: stringList(f.data.aliases),
    sources: stringList(f.data.sources).map((p) => ({
      path: p,
      title: stringField(raw.get(p)?.data?.title) || p.split('/').pop()!,
      exists: raw.has(p)
    })),
    backlinks,
    taskId: spec && spec.task !== 'app' ? taskFor(f.name, spec.task) : null
  }
}

/** Competitor profiles run one task per competitor; the whole group re-runs together. */
const taskFor = (slug: string, task: string): string =>
  slug.startsWith('competitor-') ? 'competitor-profiles' : task

export async function listOutputs(root: string, kind: string): Promise<OutputVersion[]> {
  const files = await scanWiki(root)
  const byRel = new Map(files.filter((f) => f.kind === 'output').map((f) => [f.rel, f]))
  return (await outputVersions(root, kind))
    .map((v) => {
      const f = byRel.get(v.rel)
      return {
        path: v.rel,
        version: v.version,
        date: /-(\d{4}-\d{2}-\d{2})\.md$/.exec(v.rel)?.[1] ?? '',
        title: stringField(f?.data?.title) || v.rel
      }
    })
    .reverse()
}

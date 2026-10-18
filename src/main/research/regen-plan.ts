import { readFile } from 'fs/promises'
import type { RegenEstimate, RegenPlan } from '@shared/regen'
import { contentHash, profileChanges, readGenerated, readProfileSnapshot } from '../state/history'
import { readProvenance } from '../state/provenance'
import { specFor } from '../wiki/article-map'
import { affectsOf, changesForPage, listChanges } from '../wiki/changes'
import { stringField, stringList } from '../wiki/frontmatter'
import { safeJoin } from '../wiki/paths'
import { scanWiki, type WikiFile } from '../wiki/scan'
import { sourceKind, taskForSlug } from '../wiki/tree'
import { readProfile } from '../workspace/profile'
import type { TaskKind } from './estimates'
import { PLAYBOOK_SECTION_ARTICLES } from '@shared/wiki-views'
import type { TaskDef } from './types'

/**
 * What a regeneration of one page would use (REQUIREMENTS-v3.1 4.1), computed from front matter,
 * file times, provenance and app-state history. Writes nothing and calls no model.
 */

const SLACK_MS = 5_000
const day = (v: unknown): string => stringField(v).slice(0, 10)

export interface PlanDeps {
  tasks: TaskDef[]
  /** Cost and time for these kinds of task with the current model. */
  estimate(kinds: TaskKind[]): {
    costUsd: RegenEstimate['costUsd']
    minutes: RegenEstimate['minutes']
  }
  budgetCapUsd: number
  model: string
}

const zero: RegenEstimate = { costUsd: { low: 0, high: 0 }, minutes: { low: 0, high: 0 } }

export async function planRegeneration(
  root: string,
  slug: string,
  d: PlanDeps
): Promise<RegenPlan | null> {
  const files = await scanWiki(root)
  const page = files.find((f) => f.kind === 'article' && f.name === slug && f.dir !== 'wiki/theses')
  if (!page) return null
  const spec = specFor(slug)
  const taskId = spec?.slug === 'decision-' ? null : taskForSlug(spec, slug)
  const task = taskId ? d.tasks.find((t) => t.id === taskId) : undefined
  const changes = await listChanges(root, files)
  const groups = changesForPage(changes, slug)

  const updated = day(page.data?.updated)
  const provenance = await readProvenance(root)
  const gen = provenance[page.rel]
  const runEnd = gen
    ? Math.max(
        ...Object.values(provenance)
          .filter((e) => e.runId === gen.runId)
          .map((e) => Date.parse(e.at))
          .filter((t) => !Number.isNaN(t))
      )
    : null
  const genAt = gen ? Date.parse(gen.at) : null
  const newer = (f: WikiFile, fileDay: string): boolean =>
    fileDay > updated || (runEnd !== null && fileDay >= updated && f.mtimeMs > runEnd + SLACK_MS)

  // New or newer sources this page's step reads (REQUIREMENTS-v3.1 4.1, item 4).
  const cites = new Set(stringList(page.data?.sources))
  const categories = (task?.inputs?.inputCategories ?? []).map((c) => c.replace(/\s+/g, '-'))
  const readsCrawl = [
    ...(task?.inputs?.outputs ?? []),
    ...(task?.inputs?.optionalOutputs ?? [])
  ].includes('crawl-website')
  const rawTags = task?.rawTags ?? []
  const sources = files
    .filter((f) => f.kind === 'raw' && newer(f, day(f.data?.ingested)))
    .filter((f) => {
      const tags = stringList(f.data?.tags)
      return (
        cites.has(f.rel) ||
        (categories.length > 0 &&
          tags.includes('private') &&
          (tags.some((t) => categories.includes(t)) || tags.length === 1)) ||
        (readsCrawl && tags.includes('own-site')) ||
        tags.some((t) => rawTags.includes(t))
      )
    })
    .map((f) => ({
      path: f.rel,
      title: stringField(f.data?.title) || f.name,
      kind: sourceKind(stringList(f.data?.tags)),
      ingested: day(f.data?.ingested)
    }))
    .sort((a, b) => b.ingested.localeCompare(a.ingested))

  // Pages it depends on that a later run rewrote.
  const bySlug = new Map(
    files.filter((f) => f.kind === 'article' && f.dir !== 'wiki/theses').map((f) => [f.name, f])
  )
  const appliedTo = new Map(
    changes.filter((c) => c.status === 'applied' && c.statusRef).map((c) => [c.statusRef, c])
  )
  const pages: RegenPlan['updates']['pages'] = []
  for (const dep of spec?.dependsOn ?? []) {
    const deps = dep.endsWith('*')
      ? [...bySlug.values()].filter((a) => a.name.startsWith(dep.slice(0, -1)))
      : [bySlug.get(dep)].filter((a): a is WikiFile => !!a)
    for (const a of deps) {
      const theirs = provenance[a.rel]
      if (gen && theirs?.runId === gen.runId) continue
      const later =
        day(a.data?.updated) > updated ||
        (genAt !== null && theirs !== undefined && Date.parse(theirs.at) > genAt + SLACK_MS)
      if (!later) continue
      const change = appliedTo.get(a.name)
      pages.push({
        slug: a.name,
        title: stringField(a.data?.title) || a.name,
        updated: day(a.data?.updated),
        why: change ? `after your change "${change.name}"` : ''
      })
    }
  }

  // Profile fields edited since the run that wrote this page.
  let profile: string[] = []
  const now = await readProfile(root)
  if (gen && now) {
    const snap = await readProfileSnapshot(root, gen.runId)
    if (snap) profile = profileChanges(snap, now)
  }

  const appliedSince = groups.respected
    .filter((c) => c.statusDate > updated)
    .map((c) => ({ id: c.id, name: c.name, date: c.statusDate }))

  // Edited outside the app: its own content no longer matches what the app wrote.
  let edited = false
  if (gen?.contentHash) {
    const text = await readFile(safeJoin(root, page.rel), 'utf8').catch(() => '')
    edited = !!text && contentHash(text) !== gen.contentHash
  }
  const canDescribe = edited && (await readGenerated(root, page.rel)) !== null

  // Pages fed by this one, one regeneration per task.
  const affects = affectsOf(slug, files)
  const seen = new Set<string>()
  const dependents: RegenPlan['dependents'] = []
  for (const p of affects.pages) {
    const t = taskForSlug(specFor(p.slug), p.slug)
    if (!t || t === taskId || seen.has(t)) continue
    seen.add(t)
    dependents.push({ slug: p.slug, title: p.title, taskId: t })
  }
  const inPlaybook = (s: string): boolean =>
    Object.values(PLAYBOOK_SECTION_ARTICLES).some(
      (x) => x.slug === s || (x.prefix && s.startsWith(x.prefix))
    )

  const pagePrivate = stringList(page.data?.tags).includes('private')
  const web = !!task?.web
  const kindOf = (t: TaskDef | undefined, refresh: boolean): TaskKind =>
    !t ? 'synthesis' : t.web && !refresh ? 'synthesis' : t.fanOut ? 'web-profile' : t.kind
  const est = (kinds: TaskKind[]): RegenEstimate => (kinds.length ? d.estimate(kinds) : zero)
  const dependentTasks = dependents.map((x) => d.tasks.find((t) => t.id === x.taskId))

  return {
    page: { slug, title: stringField(page.data?.title) || slug, path: page.rel },
    taskId: task ? taskId : null,
    pending: groups.pending,
    fromOthers: groups.fromOthers,
    respected: groups.respected,
    updates: { sources, pages, profile, changes: appliedSince },
    outsideEdit: { edited, canDescribe },
    web,
    refreshBlocked: !web
      ? ''
      : pagePrivate
        ? 'This page is built partly from your private files, so web research is not refreshed with it. It uses the sources it already has.'
        : '',
    dependents,
    reassemblesPlaybook: inPlaybook(slug) || dependents.some((x) => inPlaybook(x.slug)),
    estimate: {
      base: est(task ? [kindOf(task, false)] : []),
      refresh: est(task ? [kindOf(task, true)] : []),
      dependents: est(dependentTasks.map((t) => kindOf(t, false))),
      budgetCapUsd: d.budgetCapUsd,
      model: d.model
    },
    pagePrivate
  }
}

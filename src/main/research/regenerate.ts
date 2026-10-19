import { readFile } from 'fs/promises'
import type { Change } from '@shared/changes'
import { describeEdits } from '@shared/diff'
import { regenWarnings, type KeepResult, type TakeawaysPlan } from '@shared/regen'
import { readGenerated } from '../state/history'
import { createChange, listChanges } from '../wiki/changes'
import { safeJoin } from '../wiki/paths'
import { scanWiki } from '../wiki/scan'
import type { RegenDeps } from './executor'
import { keepJob, readJob, saveJob, stageFiles } from './regen-job'
import { planRegeneration, type PlanDeps } from './regen-plan'
import { loadArticles } from './article-output'
import { stringList } from '../wiki/frontmatter'
import { takeawayArticles, TAKEAWAYS_TASK } from './takeaways'
import type { ResearchService } from './service'
import { TASKS } from './tasks'

/**
 * Starting and keeping a regeneration (REQUIREMENTS-v3.1 4.3, 5). A regeneration is a scoped
 * research run whose task writes to staging; it is never resumed after a restart.
 */

export class RegenError extends Error {
  constructor(readonly code: 'research_running' | 'review_pending' | 'not_found') {
    super(code)
  }
}

/** A change as the regeneration's prompt states it (REQUIREMENTS-v3.1 4.3, "Must apply"). */
export function changeText(c: Change, page: string): string {
  return [
    c.page !== page
      ? `Made on another page (${c.pageTitle}); apply what it means for this page.`
      : '',
    `Section: ${c.section ?? 'the whole page'}`,
    c.quote ? `The founder quoted: "${c.quote.replace(/\s+/g, ' ')}"` : '',
    `Why: ${c.why}`,
    `Change it to: ${c.changeTo}`,
    c.basedOn.length ? `Based on: ${c.basedOn.map((b) => `${b.title} (${b.path})`).join('; ')}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

export async function startRegeneration(
  research: ResearchService,
  r: string,
  req: {
    page: string
    changeIds: string[]
    refreshWeb: boolean
    queue: string[]
    budgetCapUsd?: number
  }
) {
  if (research.isActive()) throw new RegenError('research_running')
  if ((await readJob(r))?.status === 'review') throw new RegenError('review_pending')
  const plan = await planRegeneration(r, req.page, research.planDeps())
  if (!plan?.taskId) throw new RegenError('not_found')
  const taskId = plan.taskId
  const task = TASKS.find((t) => t.id === taskId)
  const included = (await listChanges(r)).filter(
    (c) => req.changeIds.includes(c.id) && c.status === 'pending'
  )
  // The pages this task rewrites: the page and, for a task that writes several, its siblings.
  const targets =
    task?.writes?.kind === 'articles'
      ? [...task.writes.targets.allowed, ...(task.writes.targets.patches ?? [])]
      : []
  const matches = (slug: string): boolean =>
    targets.some((t) => (t.endsWith('*') ? slug.startsWith(t.slice(0, -1)) : slug === t))
  const slugs = [
    req.page,
    ...(await scanWiki(r))
      .filter((f) => f.kind === 'article' && f.name !== req.page && matches(f.name))
      .map((f) => f.name)
  ]
  // Private evidence never goes to a web call: no refresh when a change brings any.
  const refreshWeb =
    req.refreshWeb && plan.web && !plan.refreshBlocked && !included.some((c) => c.private)
  const replaces = regenWarnings(plan, included)
    .filter((w) => w.kind === 'undoes' && w.replaces)
    .map((w) => w.replaces!)
  return research.start({
    only: [taskId],
    ...(req.budgetCapUsd ? { budgetCapUsd: req.budgetCapUsd } : {}),
    regen: async (runId): Promise<RegenDeps> => {
      await saveJob(r, {
        runId,
        page: req.page,
        pageTitle: plan.page.title,
        taskId,
        changes: included.map((c) => ({ id: c.id, name: c.name })),
        refreshWeb,
        queue: req.queue,
        status: 'running',
        files: [],
        report: [],
        replaces,
        costUsd: 0,
        startedAt: new Date().toISOString()
      })
      return {
        taskId,
        slugs,
        changes: included.map((c, i) => ({
          label: `C${i + 1}`,
          id: c.id,
          text: changeText(c, req.page)
        })),
        basedOn: [...new Set(included.flatMap((c) => c.basedOn.map((b) => b.path)))],
        refreshWeb,
        stage: (x) => stageFiles(r, runId, x)
      }
    }
  })
}

/** The preview for adding key takeaways and gaps (REQUIREMENTS-v4 7.3). Reads only. */
export async function takeawaysPlan(r: string, d: PlanDeps): Promise<TakeawaysPlan | null> {
  const { sections, moats } = takeawayArticles(await loadArticles(r))
  if (!sections.length && !moats.length) return null
  const all = [...sections, ...moats]
  return {
    pages: sections.map((a) => ({ slug: a.slug, title: a.title, path: a.path })),
    advantages: moats.length > 0,
    estimate: d.estimate(['playbook-takeaways']),
    budgetCapUsd: d.budgetCapUsd,
    model: d.model,
    private: all.some((a) => stringList(a.data.tags).includes('private'))
  }
}

/** Runs the takeaways task as a regeneration: staged, then reviewed (REQUIREMENTS-v4 7.3). */
export async function startTakeaways(research: ResearchService, r: string) {
  if (research.isActive()) throw new RegenError('research_running')
  if ((await readJob(r))?.status === 'review') throw new RegenError('review_pending')
  const { sections } = takeawayArticles(await loadArticles(r))
  return research.start({
    only: [TAKEAWAYS_TASK],
    regen: async (runId): Promise<RegenDeps> => {
      await saveJob(r, {
        runId,
        page: TAKEAWAYS_TASK,
        pageTitle: 'Key takeaways and gaps',
        taskId: TAKEAWAYS_TASK,
        changes: [],
        refreshWeb: false,
        queue: [],
        status: 'running',
        files: [],
        report: [],
        replaces: [],
        costUsd: 0,
        startedAt: new Date().toISOString()
      })
      return {
        taskId: TAKEAWAYS_TASK,
        slugs: sections.map((a) => a.slug),
        changes: [],
        basedOn: [],
        refreshWeb: false,
        stage: (x) => stageFiles(r, runId, x)
      }
    }
  })
}

/** Keep the reviewed result; a queued dependent page then regenerates with its own review. */
export async function keepRegeneration(
  research: ResearchService,
  r: string,
  model: string
): Promise<KeepResult> {
  if (research.isActive()) throw new RegenError('research_running')
  const job = await readJob(r)
  const result = await keepJob(r, { model })
  if (result.next && job) {
    try {
      await startRegeneration(research, r, {
        page: result.next,
        changeIds: [],
        refreshWeb: false,
        queue: job.queue.slice(1)
      })
    } catch {
      return { ...result, next: null }
    }
  }
  return result
}

/** "Turn my edits into a change" (REQUIREMENTS-v3.1 4.2). */
export async function editsToChange(r: string, page: string): Promise<Change> {
  const f = (await scanWiki(r)).find((x) => x.kind === 'article' && x.name === page)
  if (!f) throw new RegenError('not_found')
  const before = await readGenerated(r, f.rel)
  const now = await readFile(safeJoin(r, f.rel), 'utf8').catch(() => null)
  if (before === null || now === null) throw new RegenError('not_found')
  const strip = (t: string): string => t.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  const summary = describeEdits(strip(before), strip(now))
  return createChange(r, {
    page,
    section: null,
    quote: '',
    why: 'I edited this page in another editor and want to keep those edits.',
    changeTo: `Keep my edits to this page.\n\n${summary || 'The wording was edited.'}`,
    basedOn: [],
    notes: '',
    affects: []
  })
}

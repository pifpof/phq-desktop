import { readdir } from 'fs/promises'
import { join } from 'path'
import type { DoneStats, RunView } from '@shared/research'
import { PLAYBOOK_STEPS } from '../wiki/article-map'
import { outputVersions } from '../wiki/paths'
import { biggestGap, playbookView } from '../wiki/playbook-view'
import { PLAYBOOK_KIND } from './assemble-playbook'

/**
 * The done screen's numbers (REQUIREMENTS-v4.4 3.3), from the newest playbook version and the run.
 * No model call. The biggest gap uses the messaging scores only when this run's analysis is done;
 * otherwise the priority order (v4 6.3), so an older analysis never ranks a new playbook.
 */
export async function buildDoneStats(
  root: string,
  run: RunView,
  company: string
): Promise<DoneStats> {
  const newest = (await outputVersions(root, PLAYBOOK_KIND)).at(-1) ?? null
  const view = newest ? await playbookView(root, newest.rel, company) : null
  const messaging = run.tasks.find((t) => t.id === 'messaging-analysis')
  const scored = !messaging || messaging.status === 'done'
  const gap = view
    ? scored
      ? view.overview.biggestGap
      : biggestGap(
          view.sections.map((s) => ({ id: s.id, gap: s.gap })),
          null
        )
    : null
  const sources = new Set(view?.sections.flatMap((s) => s.meta.sources) ?? [])
  let competitors = 0
  try {
    competitors = (await readdir(join(root, 'wiki', 'references'))).filter((n) =>
      /^competitor-.+\.md$/.test(n)
    ).length
  } catch {
    // no references yet
  }
  const end = run.playbookReadyAt ?? run.endedAt ?? Date.now()
  return {
    runId: run.id,
    company,
    version: newest?.version ?? null,
    sections: view?.sections.filter((s) => !s.missing).length ?? 0,
    sources: sources.size,
    competitors,
    minutes: Math.max(1, Math.round((end - run.startedAt) / 60_000)),
    costUsd: run.spentUsd,
    biggestGap: gap
      ? {
          step: gap.step,
          label: PLAYBOOK_STEPS.find((p) => p.id === gap.step)?.title ?? gap.step,
          problem: gap.problem
        }
      : null,
    unfinished: run.tasks
      .filter(
        (t) =>
          !t.parent &&
          (t.status === 'failed' ||
            t.status === 'blocked' ||
            (t.status === 'skipped' && !t.note?.includes('stopped')))
      )
      .map((t) => ({ id: t.id, title: t.title })),
    messagingRunning:
      !!messaging && (messaging.status === 'waiting' || messaging.status === 'running')
  }
}

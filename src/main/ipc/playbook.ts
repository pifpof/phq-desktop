import { readFile } from 'fs/promises'
import { join } from 'path'
import { PlaybookNavSchema } from '@shared/playbook'
import type { AppContext } from '../context'
import { PLAYBOOK_TASKS } from '../research/service'
import { stateDir, writeJsonAtomic } from '../state/app-state'
import { PLAYBOOK_STEPS } from '../wiki/article-map'
import { listChanges } from '../wiki/changes'
import { playbookView } from '../wiki/playbook-view'
import { readProfile } from '../workspace/profile'
import { RegenError, startTakeaways, takeawaysPlan } from '../research/regenerate'
import { workspaceRoot, writableRoot } from './guard'
import { HandlerError, type Handle } from './register'

/** The Positioning Playbook page (REQUIREMENTS-v4). Reads only. */
export function registerPlaybook(handle: Handle, ctx: AppContext): void {
  handle('playbook:view', async ({ path }) => {
    const r = workspaceRoot(ctx)
    const company = (await readProfile(r))?.company.name || 'Company'
    return playbookView(r, path, company)
  })
  // Visited steps and the last step: app state, never the wiki (REQUIREMENTS-v4 4.1).
  const navFile = async (): Promise<string> =>
    join(await stateDir(workspaceRoot(ctx)), 'playbook-nav.json')
  handle('playbook:getNav', async () => {
    try {
      const parsed = PlaybookNavSchema.safeParse(
        JSON.parse(await readFile(await navFile(), 'utf8'))
      )
      if (parsed.success) return parsed.data
    } catch {
      // first visit, or an unreadable file: start fresh
    }
    return { visited: {}, last: null }
  })
  handle('playbook:setNav', async (nav) => {
    // Only the newest few versions keep their visited steps.
    const keep = Object.keys(nav.visited).sort().slice(-5)
    await writeJsonAtomic(await navFile(), {
      ...nav,
      visited: Object.fromEntries(keep.map((k) => [k, nav.visited[k]]))
    })
    return null
  })

  // Regenerate playbook: what runs and roughly what it costs. Reads only.
  handle('playbook:regenPlan', async () => {
    const d = ctx.research.planDeps()
    const tasks = d.tasks.filter((t) => PLAYBOOK_TASKS.includes(t.id))
    const pages = new Set(PLAYBOOK_STEPS.flatMap((s) => [s.slug, s.cards ?? ''].filter(Boolean)))
    const waiting = (await listChanges(workspaceRoot(ctx)).catch(() => [])).filter(
      (c) =>
        c.status === 'pending' &&
        [...pages].some((p) => (p.endsWith('-') ? c.page.startsWith(p) : c.page === p))
    ).length
    return {
      tasks: tasks.filter((t) => !t.local).map((t) => ({ id: t.id, title: t.title })),
      estimate: d.estimate(tasks.map((t) => t.kind)),
      budgetCapUsd: d.budgetCapUsd,
      model: d.model,
      waiting
    }
  })

  // Nothing runs and nothing is spent until Start (CLAUDE.md rule 25).
  handle('playbook:takeawaysPlan', async () =>
    takeawaysPlan(workspaceRoot(ctx), ctx.research.planDeps())
  )
  handle('playbook:addTakeaways', async () => {
    const r = await writableRoot(ctx)
    try {
      return await startTakeaways(ctx.research, r)
    } catch (err) {
      if (err instanceof RegenError) throw new HandlerError(err.code)
      throw err
    }
  })
}

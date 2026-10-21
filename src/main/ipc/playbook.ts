import { shell } from 'electron'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { HelpPlanSchema, type HelpPlan } from '@shared/help'
import { PlaybookNavSchema } from '@shared/playbook'
import type { AppContext } from '../context'
import { links } from '@shared/links'
import { exportPlaybookPdf, printReady } from '../export/playbook-pdf'
import { PLAYBOOK_TASKS } from '../research/service'
import { stateDir, writeJsonAtomic } from '../state/app-state'
import { PLAYBOOK_STEPS } from '../wiki/article-map'
import { listChanges } from '../wiki/changes'
import { playbookPreview, playbookView } from '../wiki/playbook-view'
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
  handle('playbook:preview', async () => {
    const r = workspaceRoot(ctx)
    return playbookPreview(r, (await readProfile(r))?.company.name || 'Company')
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
    return { visited: {}, last: null, firstLook: false }
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

  // The Help plan (REQUIREMENTS-v4 9): app state, never the wiki. Nothing is sent from here.
  const helpFile = async (): Promise<string> =>
    join(await stateDir(workspaceRoot(ctx)), 'help-plan.json')
  const readHelp = async (): Promise<HelpPlan> => {
    try {
      const parsed = HelpPlanSchema.safeParse(JSON.parse(await readFile(await helpFile(), 'utf8')))
      if (parsed.success) return parsed.data
    } catch {
      // nothing chosen yet
    }
    return { items: [], helpRequested: [] }
  }
  const writeHelp = async (plan: HelpPlan): Promise<HelpPlan> => {
    await writeJsonAtomic(await helpFile(), plan)
    return plan
  }
  handle('help:get', readHelp)
  handle('help:add', async (item) => {
    const plan = await readHelp()
    if (plan.items.some((i) => i.id === item.id)) return plan
    return writeHelp({
      ...plan,
      items: [...plan.items, { ...item, addedAt: new Date().toISOString() }].slice(-50)
    })
  })
  handle('help:remove', async ({ id }) => {
    const plan = await readHelp()
    return writeHelp({ ...plan, items: plan.items.filter((i) => i.id !== id) })
  })
  handle('help:markRequested', async () => {
    const plan = await readHelp()
    return writeHelp({
      ...plan,
      helpRequested: [...plan.helpRequested, new Date().toISOString()].slice(-100)
    })
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

  // Export PDF: nothing leaves the machine (REQUIREMENTS-v4 8).
  let lastPdf: string | null = null
  handle('playbook:revealPdf', () => {
    if (!lastPdf) throw new HandlerError('not_found')
    shell.showItemInFolder(lastPdf)
    return null
  })
  handle('playbook:exportPdf', async (options) => {
    const r = workspaceRoot(ctx)
    const company = (await readProfile(r))?.company.name || 'Company'
    const view = await playbookView(r, options.path, company)
    if (!view) throw new HandlerError('not_found')
    const saved = await exportPlaybookPdf({
      parent: ctx.getWindow(),
      workspace: r,
      company,
      version: view.version,
      options: { ...options, path: view.path },
      siteUrl: links.pdfSiteUrl
    })
    if (saved) lastPdf = saved.path
    return saved
  })
  handle('print:ready', (_payload, event) => {
    printReady(event.sender.id)
    return null
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

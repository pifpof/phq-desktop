import type { AppContext } from '../context'
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

import type { AppContext } from '../context'
import { playbookView } from '../wiki/playbook-view'
import { readProfile } from '../workspace/profile'
import { workspaceRoot } from './guard'
import type { Handle } from './register'

/** The Positioning Playbook page (REQUIREMENTS-v4). Reads only. */
export function registerPlaybook(handle: Handle, ctx: AppContext): void {
  handle('playbook:view', async ({ path }) => {
    const r = workspaceRoot(ctx)
    const company = (await readProfile(r))?.company.name || 'Company'
    return playbookView(r, path, company)
  })
}

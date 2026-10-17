import type { AppContext } from '../context'
import { checkWiki } from '../wiki/conformance'
import { fixWiki } from '../wiki/fix'
import { HandlerError, type Handle } from './register'

export function registerWiki(handle: Handle, ctx: AppContext): void {
  const root = (): string => {
    const r = ctx.settings.get().workspacePath
    if (!r) throw new HandlerError('no_workspace')
    return r
  }

  handle('wiki:check', () => checkWiki(root()))
  handle('wiki:fix', () => {
    // Fixes move files and regenerate indexes; a run may be writing the same folders.
    if (ctx.research.isActive()) throw new HandlerError('research_running')
    return fixWiki(root())
  })
}

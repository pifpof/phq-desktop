import type { AppContext } from '../context'
import { workspaceStatus } from '../workspace/detect'
import { HandlerError } from './register'

/** The workspace folder, or no_workspace. For handlers that only read. */
export function workspaceRoot(ctx: AppContext): string {
  const r = ctx.settings.get().workspacePath
  if (!r) throw new HandlerError('no_workspace')
  return r
}

/**
 * The workspace folder, for handlers that write to the wiki. A wiki from a newer app is
 * read-only (REQUIREMENTS-v2 2.2); an old layout must be converted first.
 */
export async function writableRoot(ctx: AppContext): Promise<string> {
  const root = workspaceRoot(ctx)
  const status = await workspaceStatus(root)
  if (status === 'read-only') throw new HandlerError('read_only')
  if (status === 'needs-migration') throw new HandlerError('needs_migration')
  if (status === 'other-wiki') throw new HandlerError('other_wiki')
  return root
}

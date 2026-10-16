import { shell } from 'electron'
import type { AppContext } from '../context'
import { listDocs, readDoc } from '../workspace/documents'
import { exists } from '../workspace/fs-util'
import { resolveInside } from '../workspace/paths'
import { HandlerError, type Handle } from './register'
import { readProfile, writeProfile } from '../workspace/profile'

export function registerDocs(handle: Handle, ctx: AppContext): void {
  const root = (): string => {
    const r = ctx.settings.get().workspacePath
    if (!r) throw new HandlerError('no_workspace')
    return r
  }

  handle('profile:get', () => readProfile(root()))
  handle('profile:save', async (profile) => {
    await writeProfile(root(), profile)
    return null
  })

  handle('docs:list', ({ dir }) => listDocs(root(), dir))
  handle('docs:read', ({ path }) => readDoc(root(), path))

  handle('docs:openInEditor', async ({ path }) => {
    const full = resolveInside(root(), path)
    if (!full || !(await exists(full))) throw new HandlerError('not_allowed')
    await shell.openPath(full)
    return null
  })
}

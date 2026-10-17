import { dialog, shell } from 'electron'
import { detectWorkspace } from '../workspace/detect'
import { findHub, hubWorkspacePath } from '../wiki/hub'
import type { AppContext } from '../context'
import {
  confirmWorkspace,
  defaultWorkspacePath,
  ensureWorkspaceDir,
  isPhqWiki
} from '../services/workspace'
import { HandlerError, type Handle } from './register'

export function registerWorkspace(handle: Handle, ctx: AppContext): void {
  handle('workspace:chooseFolder', async () => {
    const win = ctx.getWindow()
    const options = {
      properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    const path = result.filePaths[0]
    if (result.canceled || !path) return null
    return { path, existing: await isPhqWiki(path) }
  })

  handle('workspace:useDefault', async () => {
    const path = defaultWorkspacePath(ctx.documentsDir)
    if (!(await ensureWorkspaceDir(path))) throw new HandlerError('not_writable')
    return { path, existing: await isPhqWiki(path) }
  })

  handle('workspace:confirm', async ({ path }) => {
    // Moving to another folder mid-run would abandon the run. The person has to stop it first.
    if (ctx.research.isActive() && path !== ctx.settings.get().workspacePath)
      throw new HandlerError('research_running')
    const result = await confirmWorkspace(path, ctx.appVersion)
    if (!result.ok) throw new HandlerError(result.reason)
    ctx.settings.update({
      workspacePath: path,
      onboardingComplete: ctx.secrets.loadKey() !== null || ctx.settings.get().onboardingComplete
    })
    ctx.research.reset()
    ctx.watcher.watch(path)
    return { path, existing: result.existing }
  })

  handle('workspace:useHub', async ({ name }) => {
    const hub = await findHub()
    if (!hub) throw new HandlerError('no_hub')
    const path = hubWorkspacePath(hub, name)
    if (!(await ensureWorkspaceDir(path))) throw new HandlerError('not_writable')
    return { path, existing: await isPhqWiki(path) }
  })

  handle('workspace:detect', ({ path }) => detectWorkspace(path))

  handle('workspace:reveal', async () => {
    const path = ctx.settings.get().workspacePath
    if (path) await shell.openPath(path)
    return null
  })
}

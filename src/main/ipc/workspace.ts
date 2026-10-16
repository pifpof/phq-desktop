import { dialog, shell } from 'electron'
import { createLayout } from '../workspace/layout'
import { detectWorkspace } from '../workspace/detect'
import type { AppContext } from '../context'
import {
  confirmWorkspace,
  defaultWorkspacePath,
  ensureWorkspaceDir,
  hasMarker
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
    return { path, existing: await hasMarker(path) }
  })

  handle('workspace:useDefault', async () => {
    const path = defaultWorkspacePath(ctx.documentsDir)
    if (!(await ensureWorkspaceDir(path))) throw new HandlerError('not_writable')
    return { path, existing: await hasMarker(path) }
  })

  handle('workspace:confirm', async ({ path }) => {
    const result = await confirmWorkspace(path, ctx.appVersion)
    if (!result) throw new HandlerError('not_writable')
    ctx.settings.update({
      workspacePath: path,
      onboardingComplete: ctx.secrets.loadKey() !== null || ctx.settings.get().onboardingComplete
    })
    // v1: the full folder tree, alongside anything already in the folder. Never overwrites.
    await createLayout(path)
    ctx.research.reset()
    ctx.watcher.watch(path)
    return { path, existing: result.existing }
  })

  handle('workspace:detect', ({ path }) => detectWorkspace(path))

  handle('workspace:reveal', async () => {
    const path = ctx.settings.get().workspacePath
    if (path) await shell.openPath(path)
    return null
  })
}

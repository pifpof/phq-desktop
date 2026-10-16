import { computeRoute } from '../launch'
import { revealLabel, isMac } from '../platform'
import { defaultWorkspacePath, isWritableDir } from '../services/workspace'
import type { AppState } from '@shared/types'
import type { AppContext } from '../context'
import type { Handle } from './register'

export async function buildState(ctx: AppContext): Promise<AppState> {
  const s = ctx.settings.get()
  const hasKey = ctx.secrets.loadKey() !== null
  const workspaceWritable = s.workspacePath ? await isWritableDir(s.workspacePath) : false
  const { route, note } = computeRoute({ settings: s, hasKey, workspaceWritable })
  return {
    route,
    note,
    provider: s.provider,
    model: s.model,
    modelName: s.modelName,
    workspacePath: s.workspacePath,
    defaultWorkspacePath: defaultWorkspacePath(ctx.documentsDir),
    maskedKey: ctx.secrets.maskedKey(),
    appVersion: ctx.appVersion,
    secureStorage: ctx.secrets.isSecureStorageAvailable(),
    revealLabel: revealLabel(),
    platform: isMac ? 'mac' : 'other'
  }
}

export function registerApp(handle: Handle, ctx: AppContext): void {
  handle('app:getState', () => buildState(ctx))

  handle('settings:setModel', ({ model, displayName }) => {
    ctx.settings.update({ model, modelName: displayName })
    return null
  })

  handle('secrets:disconnect', () => {
    ctx.secrets.deleteKey()
    return null
  })
}

import { app, BrowserWindow, safeStorage } from 'electron'
import { EVENT_OPEN_SETTINGS, EVENT_RESEARCH, EVENT_WORKSPACE_CHANGED } from '@shared/ipc-contract'
import { registerIpc } from './ipc'
import { createLogger } from './log'
import { isSecureStorageAvailable, quitWhenAllWindowsClosed } from './platform'
import { buildMenu } from './platform/menu'
import { createWorkspaceWatcher } from './workspace/watcher'
import { getProvider } from './providers/registry'
import { localHandlers } from './research/local-handlers'
import { diskSkillReader } from './research/prompt-builder'
import { loadPricing, skillsDir } from './research/resources'
import { createResearchService } from './research/service'
import { createChatService } from './services/chat'
import { createSecretsStore } from './services/secrets'
import { createSettingsStore } from './services/settings'
import { createWindow, lockDownSession } from './window'

app.setName('PositioningHQ')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let win: BrowserWindow | null = null

  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  void app.whenReady().then(() => {
    const userData = app.getPath('userData')
    const log = createLogger(app.getPath('logs'))
    const settings = createSettingsStore(userData)
    // safeStorage is only touched after ready.
    const secrets = createSecretsStore({
      dir: userData,
      safeStorage,
      isSecure: isSecureStorageAvailable,
      log
    })
    const chat = createChatService()
    const watcher = createWorkspaceWatcher((paths) =>
      win?.webContents.send(EVENT_WORKSPACE_CHANGED, { paths })
    )

    let pricing: ReturnType<typeof loadPricing> | null = null
    const research = createResearchService({
      getRoot: () => settings.get().workspacePath,
      getModel: () => settings.get().model,
      getKey: () => secrets.loadKey(),
      provider: () => getProvider(settings.get().provider),
      pricing: () => (pricing ??= loadPricing()),
      readSkill: diskSkillReader(skillsDir()),
      local: localHandlers(app.getVersion()),
      send: (run) => win?.webContents.send(EVENT_RESEARCH, run),
      log
    })

    registerIpc({
      research,
      settings,
      secrets,
      chat,
      watcher,
      log,
      getWindow: () => win,
      appVersion: app.getVersion(),
      documentsDir: app.getPath('documents')
    })

    lockDownSession()
    buildMenu(() => win?.webContents.send(EVENT_OPEN_SETTINGS))
    const open = (): void => {
      win = createWindow(settings)
      win.on('closed', () => (win = null))
    }
    open()
    watcher.watch(settings.get().workspacePath)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) open()
    })
    let quitting = false
    app.on('before-quit', (event) => {
      if (quitting) return
      quitting = true
      chat.cancelAll()
      research.interrupt()
      // Let the final save of an interrupted run reach the disk before the app exits.
      event.preventDefault()
      const done = Promise.all([research.flush(), watcher.close()])
      void Promise.race([done, new Promise((r) => setTimeout(r, 2000))]).finally(() => app.quit())
    })
  })

  app.on('window-all-closed', () => {
    if (quitWhenAllWindowsClosed) app.quit()
  })
}

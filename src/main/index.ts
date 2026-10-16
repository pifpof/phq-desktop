import { app, BrowserWindow, safeStorage } from 'electron'
import { EVENT_OPEN_SETTINGS, EVENT_WORKSPACE_CHANGED } from '@shared/ipc-contract'
import { registerIpc } from './ipc'
import { createLogger } from './log'
import { isSecureStorageAvailable, quitWhenAllWindowsClosed } from './platform'
import { buildMenu } from './platform/menu'
import { createWorkspaceWatcher } from './workspace/watcher'
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

    registerIpc({
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
    app.on('before-quit', () => {
      chat.cancelAll()
      void watcher.close()
    })
  })

  app.on('window-all-closed', () => {
    if (quitWhenAllWindowsClosed) app.quit()
  })
}

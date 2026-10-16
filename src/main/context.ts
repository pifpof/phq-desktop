import type { BrowserWindow } from 'electron'
import type { Logger } from './log'
import type { ChatService } from './services/chat'
import type { SecretsStore } from './services/secrets'
import type { SettingsStore } from './services/settings'

/** Everything IPC handlers need, built once in index.ts. */
export interface AppContext {
  settings: SettingsStore
  secrets: SecretsStore
  chat: ChatService
  log: Logger
  getWindow: () => BrowserWindow | null
  appVersion: string
  documentsDir: string
}

import type { BrowserWindow } from 'electron'
import type { Logger } from './log'
import type { ResearchService } from './research/service'
import type { WorkspaceWatcher } from './workspace/watcher'
import type { WikiTreeService } from './wiki/tree-service'
import type { ChatService } from './services/chat'
import type { SecretsStore } from './services/secrets'
import type { SettingsStore } from './services/settings'

/** Everything IPC handlers need, built once in index.ts. */
export interface AppContext {
  settings: SettingsStore
  secrets: SecretsStore
  chat: ChatService
  watcher: WorkspaceWatcher
  research: ResearchService
  wikiTree: WikiTreeService
  log: Logger
  getWindow: () => BrowserWindow | null
  appVersion: string
  documentsDir: string
}

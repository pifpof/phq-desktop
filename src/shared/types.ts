import type { ErrorCode } from './errors'

export type ModeId = 'general'
export type ProviderId = 'anthropic' | 'openai' | 'gemini'

export type Route = 'welcome' | 'connect' | 'workspace' | 'chat'

export interface ModelInfo {
  id: string
  displayName: string
  createdAt: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatUsage {
  inputTokens: number
  outputTokens: number
}

export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'usage'; usage: ChatUsage }
  | { type: 'done'; stopped: boolean }
  | { type: 'error'; code: ErrorCode; message: string }

export interface AppState {
  route: Route
  /** Shown above the first control of the routed screen, e.g. "Reconnect your AI to continue". */
  note: string | null
  provider: ProviderId
  model: string | null
  modelName: string | null
  workspacePath: string | null
  defaultWorkspacePath: string
  maskedKey: string | null
  appVersion: string
  secureStorage: boolean
  /** Label for the reveal action: "Show in Finder", "Show in Explorer" or "Show in file manager". */
  revealLabel: string
  platform: 'mac' | 'other'
}

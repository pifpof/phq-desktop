import type { ChatMessage, ChatStreamEvent, ModelInfo, ProviderId } from '@shared/types'
import type { ProviderErrorCode } from '@shared/errors'

export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    /** Provider error type, safe to show. Never contains the key. */
    public readonly detail?: string
  ) {
    super(code)
    this.name = 'ProviderError'
  }
}

export type VerifyResult =
  | { ok: true; models: ModelInfo[]; defaultModelId: string | null }
  | { ok: false; code: ProviderErrorCode; detail?: string }

export interface StreamChatArgs {
  key: string
  model: string
  system: string
  messages: ChatMessage[]
  signal: AbortSignal
  onEvent: (e: ChatStreamEvent) => void
}

export interface Provider {
  id: ProviderId
  displayName: string
  /** Lists models, then sends one tiny message. */
  verifyKey(key: string): Promise<VerifyResult>
  /** The default selection rule for this provider (newest sonnet for Anthropic). */
  pickDefaultModel(models: ModelInfo[]): string | null
  /** Throws ProviderError. */
  listModels(key: string): Promise<ModelInfo[]>
  /** Never throws: failures are delivered as an `error` event, aborts as `done` with stopped. */
  streamChat(args: StreamChatArgs): Promise<void>
}

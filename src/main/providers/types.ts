import type { ChatMessage, ChatStreamEvent, ModelInfo, ProviderId } from '@shared/types'
import type { ProviderErrorCode } from '@shared/errors'

export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    /** Provider error type, safe to show. Never contains the key. */
    public readonly detail?: string,
    /** From the retry-after header on a rate limit. */
    public readonly retryAfterSeconds?: number
  ) {
    super(code)
    this.name = 'ProviderError'
  }
}

/** Thrown by runTask when its signal is aborted. Not a failure: the run was stopped. */
export class TaskAbortedError extends Error {
  constructor() {
    super('aborted')
    this.name = 'TaskAbortedError'
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

/** A chunk of prompt text. `cache` marks a cache breakpoint after it. */
export interface PromptBlock {
  text: string
  cache?: boolean
}

export interface TaskTools {
  webSearch?: { maxUses: number }
  webFetch?: { maxUses: number; maxContentTokens: number }
}

export interface RunTaskArgs {
  key: string
  model: string
  system: PromptBlock[]
  /** One user message made of these blocks, in order. */
  user: PromptBlock[]
  tools: TaskTools
  maxTokens?: number
  signal: AbortSignal
}

export interface TaskUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  webSearchRequests: number
  webFetchRequests: number
  /** Largest single request prompt (input, cache reads and writes). Some models price long prompts higher. */
  maxRequestInputTokens: number
  requests: number
}

export interface Citation {
  url: string
  title: string
}

export interface RunTaskResult {
  /** The answer only: narration between tool calls is dropped. */
  text: string
  /** Sources the answer cites. */
  citations: Citation[]
  /** Every page the search and fetch tools returned, cited or not. */
  consulted: Citation[]
  usage: TaskUsage
  stopReason: string
  /** True when the model hit the output token limit. */
  truncated: boolean
}

export interface Capabilities {
  webSearch: boolean
  webFetch: boolean
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
  /** What a model can do, from the provider's own model data. Throws ProviderError. */
  capabilities(key: string, modelId: string): Promise<Capabilities>
  /**
   * Runs one research task to completion, with optional web tools. Continues paused turns itself.
   * Throws ProviderError, or TaskAbortedError when the signal is aborted.
   */
  runTask(args: RunTaskArgs): Promise<RunTaskResult>
  /** Never throws: failures are delivered as an `error` event, aborts as `done` with stopped. */
  streamChat(args: StreamChatArgs): Promise<void>
}

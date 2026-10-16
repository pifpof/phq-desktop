import { randomUUID } from 'crypto'
import type { ChatMessage, ChatStreamEvent } from '@shared/types'
import type { PromptBlock, Provider } from '../providers/types'

export interface StartStreamArgs {
  provider: Provider
  key: string
  model: string
  /** Built by the mode in the main process. */
  system: string | PromptBlock[]
  messages: ChatMessage[]
  send: (streamId: string, event: ChatStreamEvent) => void
}

/** Registry of in-flight streams. The system prompt comes from the mode, in main, never from the renderer. */
export function createChatService() {
  const streams = new Map<string, AbortController>()

  return {
    start({ provider, key, model, system, messages, send }: StartStreamArgs): string {
      const streamId = randomUUID()
      const controller = new AbortController()
      streams.set(streamId, controller)
      void provider
        .streamChat({
          key,
          model,
          system,
          messages,
          signal: controller.signal,
          onEvent: (e) => send(streamId, e)
        })
        .finally(() => streams.delete(streamId))
      return streamId
    },
    cancel(streamId: string): void {
      streams.get(streamId)?.abort()
    },
    cancelAll(): void {
      for (const c of streams.values()) c.abort()
    },
    activeCount: () => streams.size
  }
}

export type ChatService = ReturnType<typeof createChatService>

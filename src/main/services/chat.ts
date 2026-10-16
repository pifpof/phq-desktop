import { randomUUID } from 'crypto'
import type { ChatMessage, ChatStreamEvent, ModeId } from '@shared/types'
import { modes } from '../modes'
import type { Provider } from '../providers/types'

export interface StartStreamArgs {
  provider: Provider
  key: string
  model: string
  modeId: ModeId
  messages: ChatMessage[]
  send: (streamId: string, event: ChatStreamEvent) => void
}

/** Registry of in-flight streams. The system prompt is always looked up here, never taken from the renderer. */
export function createChatService() {
  const streams = new Map<string, AbortController>()

  return {
    start({ provider, key, model, modeId, messages, send }: StartStreamArgs): string {
      const streamId = randomUUID()
      const controller = new AbortController()
      streams.set(streamId, controller)
      void provider
        .streamChat({
          key,
          model,
          system: modes[modeId].systemPrompt,
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

import { create } from 'zustand'
import type { ErrorCode } from '@shared/errors'
import type { ChatUsage, ModeId } from '@shared/types'
import type { ChatEnvelope } from '@shared/ipc-contract'
import { api } from '@/lib/api'

export type MessageStatus = 'streaming' | 'done' | 'stopped' | 'error'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: MessageStatus
  usage?: ChatUsage
  error?: { code: ErrorCode; message: string }
}

interface ChatStore {
  messages: Message[]
  streamId: string | null
  /** Events that arrive before chat:start has returned the stream ID. */
  early: ChatEnvelope[]
  starting: boolean
  send(modeId: ModeId, text: string): Promise<void>
  retry(modeId: ModeId): Promise<void>
  stop(): void
  reset(): void
  handleEvent(env: ChatEnvelope): void
}

const uid = (): string => crypto.randomUUID()

function history(messages: Message[]): { role: 'user' | 'assistant'; content: string }[] {
  return messages
    .filter(
      (m) => (m.status === 'done' || m.status === 'stopped' || m.role === 'user') && m.content
    )
    .map((m) => ({ role: m.role, content: m.content }))
}

export const useChat = create<ChatStore>((set, get) => {
  const patchLast = (patch: Partial<Message>): void =>
    set((s) => {
      const messages = s.messages.slice()
      const last = messages[messages.length - 1]
      if (last?.role === 'assistant') messages[messages.length - 1] = { ...last, ...patch }
      return { messages }
    })

  const apply = (env: ChatEnvelope): void => {
    const e = env.event
    if (e.type === 'delta') {
      set((s) => {
        const messages = s.messages.slice()
        const last = messages[messages.length - 1]
        if (last?.role === 'assistant') {
          messages[messages.length - 1] = { ...last, content: last.content + e.text }
        }
        return { messages }
      })
    } else if (e.type === 'usage') {
      patchLast({ usage: e.usage })
    } else if (e.type === 'done') {
      patchLast({ status: e.stopped ? 'stopped' : 'done' })
      set({ streamId: null })
    } else {
      patchLast({ status: 'error', error: { code: e.code, message: e.message } })
      set({ streamId: null })
    }
  }

  const run = async (modeId: ModeId): Promise<void> => {
    set({ starting: true, early: [], streamId: null })
    try {
      const res = await api.startChat({ modeId, messages: history(get().messages.slice(0, -1)) })
      if (!res.ok) {
        patchLast({ status: 'error', error: res.error })
        return
      }
      const { streamId } = res.data
      const { early, starting } = get()
      // Stop pressed while starting: cancel the stream we just created.
      if (!starting) {
        void api.cancelChat(streamId)
        return
      }
      set({ streamId, early: [] })
      early.filter((env) => env.streamId === streamId).forEach(apply)
    } catch {
      patchLast({
        status: 'error',
        error: { code: 'internal', message: 'Something went wrong. Please try again.' }
      })
    } finally {
      set({ starting: false })
    }
  }

  return {
    messages: [],
    streamId: null,
    early: [],
    starting: false,

    async send(modeId, text) {
      const content = text.trim()
      if (!content || get().streamId || get().starting) return
      set((s) => ({
        messages: [
          ...s.messages,
          { id: uid(), role: 'user', content, status: 'done' },
          { id: uid(), role: 'assistant', content: '', status: 'streaming' }
        ]
      }))
      await run(modeId)
    },

    async retry(modeId) {
      const { messages, streamId, starting } = get()
      if (streamId || starting) return
      const last = messages[messages.length - 1]
      if (last?.role !== 'assistant' || last.status !== 'error') return
      set({
        messages: [
          ...messages.slice(0, -1),
          { id: uid(), role: 'assistant', content: '', status: 'streaming' }
        ]
      })
      await run(modeId)
    },

    stop() {
      const { streamId, starting } = get()
      if (!streamId && !starting) return
      if (streamId) void api.cancelChat(streamId)
      // Mark stopped now; late events for this stream are ignored.
      patchLast({ status: 'stopped' })
      set({ streamId: null, starting: starting ? false : starting })
    },

    reset() {
      const { streamId } = get()
      if (streamId) void api.cancelChat(streamId)
      set({ messages: [], streamId: null, early: [], starting: false })
    },

    handleEvent(env) {
      const { streamId, starting } = get()
      if (streamId === env.streamId) apply(env)
      else if (starting) set((s) => ({ early: [...s.early, env] }))
    }
  }
})

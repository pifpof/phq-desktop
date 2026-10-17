import { create } from 'zustand'
import type { ErrorCode } from '@shared/errors'
import type { ChatUsage, ModeId } from '@shared/types'
import type { ChatEnvelope } from '@shared/ipc-contract'
import { chatTitle } from '@shared/chat'
import { api, unwrap } from '@/lib/api'
import { useChats } from './chats'

export type MessageStatus = 'streaming' | 'done' | 'stopped' | 'error'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: MessageStatus
  usage?: ChatUsage
  /** Wiki articles the answer is grounded in ("Answered from"). */
  sources?: { path: string; title: string }[]
  error?: { code: ErrorCode; message: string }
}

interface ChatStore {
  messages: Message[]
  streamId: string | null
  /** Events that arrive before chat:start has returned the stream ID. */
  early: ChatEnvelope[]
  starting: boolean
  /** The saved chat this conversation belongs to, or null before the first message. */
  chatId: string | null
  createdAt: number
  modeId: ModeId
  send(modeId: ModeId, text: string): Promise<void>
  /** Opens a saved chat. */
  open(id: string): Promise<void>
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
      void persist()
    } else {
      patchLast({ status: 'error', error: { code: e.code, message: e.message } })
      set({ streamId: null })
      void persist()
    }
  }

  /** Saves the conversation to the workspace after each reply. Failed replies are not kept. */
  const persist = async (): Promise<void> => {
    const { chatId, createdAt, modeId, messages } = get()
    const firstUser = messages.find((m) => m.role === 'user')
    if (!chatId || !firstUser) return
    const kept = messages.filter(
      (m) => m.role === 'user' || ((m.status === 'done' || m.status === 'stopped') && m.content)
    )
    await api.saveChat({
      id: chatId,
      title: chatTitle(firstUser.content),
      modeId,
      createdAt,
      updatedAt: Date.now(),
      messages: kept.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.role === 'assistant' ? { status: m.status as 'done' | 'stopped' } : {}),
        ...(m.usage ? { usage: m.usage } : {}),
        ...(m.sources?.length ? { sources: m.sources } : {})
      }))
    })
    void useChats.getState().refresh()
  }

  const run = async (modeId: ModeId): Promise<void> => {
    set({ starting: true, early: [], streamId: null })
    try {
      const res = await api.startChat({ modeId, messages: history(get().messages.slice(0, -1)) })
      if (!res.ok) {
        patchLast({ status: 'error', error: res.error })
        return
      }
      const { streamId, sources } = res.data
      if (sources.length) patchLast({ sources })
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
    chatId: null,
    createdAt: 0,
    modeId: 'general',

    async send(modeId, text) {
      const content = text.trim()
      if (!content || get().streamId || get().starting) return
      if (!get().chatId) set({ chatId: uid(), createdAt: Date.now(), modeId })
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
      void persist()
    },

    async open(id) {
      get().reset()
      const chat = await unwrap(api.getChat(id)).catch(() => null)
      if (!chat) return
      set({
        chatId: chat.id,
        createdAt: chat.createdAt,
        modeId: chat.modeId,
        messages: chat.messages.map((m) => ({
          id: uid(),
          role: m.role,
          content: m.content,
          status: m.role === 'assistant' ? (m.status ?? 'done') : 'done',
          ...(m.usage ? { usage: m.usage } : {}),
          ...(m.sources ? { sources: m.sources } : {})
        }))
      })
    },

    reset() {
      const { streamId } = get()
      if (streamId) void api.cancelChat(streamId)
      set({ messages: [], streamId: null, early: [], starting: false, chatId: null, createdAt: 0 })
    },

    handleEvent(env) {
      const { streamId, starting } = get()
      if (streamId === env.streamId) apply(env)
      else if (starting) set((s) => ({ early: [...s.early, env] }))
    }
  }
})

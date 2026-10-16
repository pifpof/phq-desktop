import { create } from 'zustand'
import type { ChatSummary } from '@shared/chat'
import { api, unwrap } from '@/lib/api'

interface ChatsStore {
  chats: ChatSummary[]
  refresh(): Promise<void>
  rename(id: string, title: string): Promise<void>
  remove(id: string): Promise<void>
}

/** Saved chats, newest first, from .positioninghq/chats in the workspace. */
export const useChats = create<ChatsStore>((set, get) => ({
  chats: [],
  async refresh() {
    set({ chats: await unwrap(api.listChats()).catch(() => []) })
  },
  async rename(id, title) {
    await unwrap(api.renameChat(id, title)).catch(() => undefined)
    await get().refresh()
  },
  async remove(id) {
    await unwrap(api.deleteChat(id)).catch(() => undefined)
    await get().refresh()
  }
}))

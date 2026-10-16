import { useEffect, useRef } from 'react'
import type { ModeId } from '@shared/types'
import { api } from '@/lib/api'
import { useChat } from '@/store/chat'
import { Composer, type ComposerHandle } from './Composer'
import { EmptyState } from './EmptyState'
import { MessageList } from './MessageList'

/** Reusable chat surface. The mode picks the system prompt in the main process. */
export function ChatSession({ modeId }: { modeId: ModeId }) {
  const messages = useChat((s) => s.messages)
  const streaming = useChat((s) => s.streamId !== null || s.starting)
  const composer = useRef<ComposerHandle>(null)

  useEffect(() => api.onChatEvent((env) => useChat.getState().handleEvent(env)), [])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {messages.length === 0 ? (
        <EmptyState onPick={(t) => composer.current?.fill(t)} />
      ) : (
        <MessageList messages={messages} onRetry={() => void useChat.getState().retry(modeId)} />
      )}
      <Composer
        ref={composer}
        streaming={streaming}
        onSend={(t) => void useChat.getState().send(modeId, t)}
        onStop={() => useChat.getState().stop()}
      />
    </div>
  )
}

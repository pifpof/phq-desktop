import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { ModeId } from '@shared/types'
import { api } from '@/lib/api'
import { useChat } from '@/store/chat'
import { Composer, type ComposerHandle } from './Composer'
import { EmptyState } from './EmptyState'
import { MessageList } from './MessageList'

/** Reusable chat surface. The mode picks the system prompt in the main process. */
export function ChatSession({
  modeId,
  starters,
  note
}: {
  modeId: ModeId
  starters?: string[]
  note?: string
}) {
  const messages = useChat((s) => s.messages)
  const streaming = useChat((s) => s.streamId !== null || s.starting)
  const composer = useRef<ComposerHandle>(null)
  const focus = useChat((s) => s.focus)

  useEffect(() => api.onChatEvent((env) => useChat.getState().handleEvent(env)), [])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {focus && (
        <p className="bg-accent text-primary mx-auto mt-3 flex max-w-[760px] items-center gap-2 rounded-full px-3 py-1 text-[13px]">
          {focus.label} is loaded in this chat.
          <button
            type="button"
            aria-label={`Stop loading ${focus.label}`}
            onClick={() => useChat.getState().clearFocus()}
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>
        </p>
      )}
      {messages.length === 0 ? (
        <EmptyState onPick={(t) => composer.current?.fill(t)} starters={starters} note={note} />
      ) : (
        <MessageList messages={messages} onRetry={() => void useChat.getState().retry(modeId)} />
      )}
      <Composer
        ref={composer}
        streaming={streaming}
        placeholder={focus ? `Ask about ${focus.label}…` : undefined}
        onSend={(t) => void useChat.getState().send(modeId, t)}
        onStop={() => useChat.getState().stop()}
      />
    </div>
  )
}

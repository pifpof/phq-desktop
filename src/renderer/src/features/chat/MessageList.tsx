import { useEffect, useLayoutEffect, useRef } from 'react'
import type { Message as Msg } from '@/store/chat'
import { Message } from './Message'

interface Props {
  messages: Msg[]
  onRetry: () => void
}

export function MessageList({ messages, onRetry }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onScroll = (): void => {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Follow the stream unless the reader has scrolled up.
  useLayoutEffect(() => {
    const el = ref.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const last = messages[messages.length - 1]
  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-6 py-8">
        {messages.map((m) => (
          <Message key={m.id} message={m} canRetry={m === last} onRetry={onRetry} />
        ))}
      </div>
    </div>
  )
}

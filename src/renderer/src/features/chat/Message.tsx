import { memo } from 'react'
import { RotateCcw } from 'lucide-react'
import { isRetryable } from '@shared/errors'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/Markdown'
import type { Message as Msg } from '@/store/chat'

const fmt = new Intl.NumberFormat('en-US')

interface Props {
  message: Msg
  canRetry: boolean
  onRetry: () => void
}

export const Message = memo(function Message({ message: m, canRetry, onRetry }: Props) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-secondary max-w-[85%] rounded-xl px-4 py-3 break-words whitespace-pre-wrap">
          {m.content}
        </div>
      </div>
    )
  }

  const waiting = m.status === 'streaming' && !m.content
  return (
    <div className="min-w-0 break-words">
      {waiting && (
        <div className="flex h-6 items-center gap-1" role="status" aria-label="Thinking">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="bg-primary-light size-1.5 animate-pulse rounded-full"
              style={{ animationDelay: `${i * 160}ms` }}
            />
          ))}
        </div>
      )}
      {m.content && (
        <div aria-live={m.status === 'streaming' ? 'polite' : 'off'}>
          <Markdown>{m.content}</Markdown>
        </div>
      )}
      {m.status === 'stopped' && (
        <p className="text-muted-foreground mt-2 text-[13px] font-semibold">Stopped</p>
      )}
      {m.status === 'done' && m.usage && (
        <p className="text-muted-foreground mt-2 text-[13px]">
          {fmt.format(m.usage.inputTokens)} in · {fmt.format(m.usage.outputTokens)} out
        </p>
      )}
      {m.status === 'error' && m.error && (
        <div
          role="alert"
          className="border-destructive/30 mt-2 flex items-center justify-between gap-4 rounded-[10px] border bg-white px-4 py-3"
        >
          <p className="text-destructive text-sm">{m.error.message}</p>
          {canRetry && isRetryable(m.error.code) && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RotateCcw strokeWidth={1.8} />
              Retry
            </Button>
          )}
        </div>
      )}
    </div>
  )
})

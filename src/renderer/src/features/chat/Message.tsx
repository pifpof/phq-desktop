import { memo, useState } from 'react'
import { RotateCcw, Scale } from 'lucide-react'
import { isRetryable } from '@shared/errors'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/Markdown'
import type { Message as Msg } from '@/store/chat'
import { useApp } from '@/store/app'
import { RecordDecisionDialog } from '@/features/decisions/RecordDecisionDialog'

const fmt = new Intl.NumberFormat('en-US')

const open = (path: string): void => useApp.getState().openWikiFile(path)

/** Wiki paths the answer cites (`wiki/topics/x.md`) become links that open the article. */
export const linkWikiPaths = (md: string): string =>
  md.replace(
    /(`?)(\b(?:wiki|raw|output)\/[a-z0-9/_.-]+\.md)\1(?!\))/g,
    (_m, _tick: string, path: string) => `[${path}](${path})`
  )

interface Props {
  message: Msg
  canRetry: boolean
  onRetry: () => void
}

export const Message = memo(function Message({ message: m, canRetry, onRetry }: Props) {
  const [deciding, setDeciding] = useState(false)
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
          <Markdown docPath="answer.md" onWikiLink={open}>
            {linkWikiPaths(m.content)}
          </Markdown>
        </div>
      )}
      {m.status === 'stopped' && (
        <p className="text-muted-foreground mt-2 text-[13px] font-semibold">Stopped</p>
      )}
      {m.status !== 'streaming' && m.sources && m.sources.length > 0 && (
        <p className="text-muted-foreground mt-3 text-[13px]">
          Answered from:{' '}
          {m.sources.map((src, i) => (
            <span key={src.path}>
              {i > 0 && ', '}
              <button
                type="button"
                className="hover:text-primary underline underline-offset-2"
                onClick={() => open(src.path)}
              >
                {src.title}
              </button>
            </span>
          ))}
        </p>
      )}
      {m.status === 'done' && (
        <div className="text-muted-foreground mt-2 flex items-center gap-3 text-[13px]">
          {m.usage && (
            <span>
              {fmt.format(m.usage.inputTokens)} in · {fmt.format(m.usage.outputTokens)} out
            </span>
          )}
          {/* REQUIREMENTS-v2 3.5: "make that our decision" from a reply. */}
          <button
            type="button"
            className="hover:text-primary inline-flex items-center gap-1"
            onClick={() => setDeciding(true)}
          >
            <Scale className="size-3.5" strokeWidth={1.8} />
            Record as decision
          </button>
        </div>
      )}
      {deciding && (
        <RecordDecisionDialog
          open
          onOpenChange={setDeciding}
          decided={m.content}
          onRecorded={(p) => useApp.getState().openWikiFile(p)}
        />
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

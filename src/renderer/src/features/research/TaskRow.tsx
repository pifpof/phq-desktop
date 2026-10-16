import { Ban, Check, Circle, Loader2, Minus, RotateCcw, X } from 'lucide-react'
import type { TaskView } from '@shared/research'
import { Button } from '@/components/ui/button'
import { duration, money } from '@/lib/research'
import { cn } from '@/lib/utils'

const ICON = {
  waiting: { Icon: Circle, cls: 'text-border', label: 'Waiting' },
  running: { Icon: Loader2, cls: 'text-primary animate-spin', label: 'Running' },
  done: { Icon: Check, cls: 'text-primary', label: 'Done' },
  failed: { Icon: X, cls: 'text-destructive', label: 'Failed' },
  skipped: { Icon: Minus, cls: 'text-muted-foreground', label: 'Skipped' },
  blocked: { Icon: Ban, cls: 'text-muted-foreground', label: 'Waiting on a failed step' }
} as const

interface Props {
  task: TaskView
  now: number
  child?: boolean
  onRetry?: () => void
}

export function TaskRow({ task: t, now, child, onRetry }: Props) {
  const { Icon, cls, label } = ICON[t.status]
  const elapsed = t.startedAt
    ? (t.endedAt ?? (t.status === 'running' ? now : t.startedAt)) - t.startedAt
    : null
  const detail = t.error?.message ?? (t.status === 'blocked' ? label : t.note)
  const quiet = t.status === 'waiting' || t.status === 'skipped' || t.status === 'blocked'
  return (
    <li className={cn('flex items-start gap-3 py-2.5', child && 'pl-7')}>
      <Icon className={cn('mt-0.5 size-4 shrink-0', cls)} strokeWidth={2} aria-label={label} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-[15px]', quiet && 'text-muted-foreground')}>{t.title}</p>
        {detail && (
          <p
            className={cn(
              'mt-0.5 text-[13px]',
              t.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {detail}
          </p>
        )}
      </div>
      <div className="text-muted-foreground flex shrink-0 items-center gap-3 text-[13px] tabular-nums">
        {!t.local && t.costUsd > 0 && <span>{money(t.costUsd)}</span>}
        {elapsed !== null && t.status !== 'waiting' && (
          <span className="w-14 text-right">{duration(elapsed)}</span>
        )}
        {t.status === 'failed' && onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCcw strokeWidth={1.8} />
            Retry
          </Button>
        )}
      </div>
    </li>
  )
}

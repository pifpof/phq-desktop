import { Ban, Check, Circle, Loader2, Minus, RotateCcw, X } from 'lucide-react'
import type { StepState, TaskView } from '@shared/research'
import { Button } from '@/components/ui/button'
import { aboutCost, duration, money } from '@/lib/research'
import { cn } from '@/lib/utils'
import { TaskRow } from './TaskRow'

const LIVE = {
  waiting: { Icon: Circle, cls: 'text-primary', label: 'Waiting to start' },
  running: { Icon: Loader2, cls: 'text-primary animate-spin', label: 'Running' },
  done: { Icon: Check, cls: 'text-primary', label: 'Done' },
  failed: { Icon: X, cls: 'text-destructive', label: 'Failed' },
  skipped: { Icon: Minus, cls: 'text-muted-foreground', label: 'Skipped' },
  blocked: { Icon: Ban, cls: 'text-muted-foreground', label: 'Waiting on a failed step' }
} as const

const DISK = {
  done: { Icon: Check, cls: 'text-primary' },
  skipped: { Icon: Minus, cls: 'text-muted-foreground' },
  failed: { Icon: X, cls: 'text-destructive' },
  'not-run': { Icon: Circle, cls: 'text-border' }
} as const

const day = (iso: string | null): string => {
  const d = iso ? new Date(iso) : null
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : ''
}

/** What the step's last result was, in a few words. */
function diskStatus(s: StepState): string {
  const when = day(s.at)
  if (s.status === 'done') return when ? `Done ${when}` : 'Done'
  if (s.status === 'skipped')
    return [when ? `Skipped ${when}` : 'Skipped', s.note?.replace(/^Skipped:\s*/i, '')]
      .filter(Boolean)
      .join('. ')
  if (s.status === 'failed') return ['Failed', s.note].filter(Boolean).join('. ')
  return 'Not run yet'
}

interface Props {
  step: StepState
  /** The step in the run that is going, if it is part of it. */
  live: TaskView | undefined
  /** Its children in that run (competitor profiles). */
  children: TaskView[]
  now: number
  ticked: boolean
  tickable: boolean
  /** Titles of the steps it needs that have no output (empty when it can run). */
  needs: string[]
  /** It can run on its own right now. */
  runnable: boolean
  busy: boolean
  onToggle(): void
  onRun(): void
  onRetry(id: string): void
  onOpen(path: string): void
  onRegenerate(slug: string): void
}

export function StepRow(p: Props) {
  const { step: s, live } = p
  const checkbox = `step-${s.id}`
  const showChildren = live && (live.status === 'running' || live.status === 'failed')
  const elapsed =
    live?.startedAt && live.status !== 'waiting'
      ? (live.endedAt ?? (live.status === 'running' ? p.now : live.startedAt)) - live.startedAt
      : null
  const icon = live ? LIVE[live.status] : DISK[s.status]
  const Icon = icon.Icon
  const statusText = live
    ? (live.error?.message ?? live.note ?? LIVE[live.status].label)
    : p.needs.length
      ? `Needs: ${p.needs.join(', ')}`
      : diskStatus(s)
  const showCost = !live && (s.status !== 'done' || s.rerunnable)
  const runLabel = s.status === 'done' ? 'Run again' : s.status === 'failed' ? 'Try again' : 'Run'

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <div className="flex h-6 w-4 shrink-0 items-center">
          {live ? (
            <Icon
              className={cn('size-4', icon.cls)}
              strokeWidth={2}
              aria-label={LIVE[live.status].label}
            />
          ) : s.status === 'done' && !s.rerunnable ? (
            // Done for good: changed through Regenerate, so there is nothing to tick.
            <Check className="text-primary size-4" strokeWidth={2} aria-label="Done" />
          ) : (
            <input
              id={checkbox}
              type="checkbox"
              className="accent-primary size-4 cursor-pointer disabled:cursor-default disabled:opacity-40"
              checked={p.ticked}
              disabled={!p.tickable || p.busy}
              onChange={p.onToggle}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <label
            htmlFor={live || (s.status === 'done' && !s.rerunnable) ? undefined : checkbox}
            className={cn(
              'block text-[15px] leading-6',
              !live && p.tickable && 'cursor-pointer',
              !live && !p.tickable && s.status !== 'done' && 'text-muted-foreground'
            )}
          >
            {s.title}
          </label>
          {s.description && (
            <p className="text-muted-foreground mt-0.5 text-[13px]">{s.description}</p>
          )}
          <p
            className={cn(
              'mt-1 flex items-center gap-1.5 text-[13px]',
              (live?.status ?? s.status) === 'failed' ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {!live && s.status !== 'done' && (
              <Icon className={cn('size-3.5 shrink-0', icon.cls)} strokeWidth={2} />
            )}
            <span>{statusText}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <span className="text-muted-foreground text-[13px] tabular-nums">
            {live
              ? [
                  live.costUsd > 0 ? money(live.costUsd) : '',
                  elapsed !== null ? duration(elapsed) : ''
                ]
                  .filter(Boolean)
                  .join(' · ')
              : showCost
                ? aboutCost(s.costUsd)
                : ''}
          </span>
          {live?.status === 'failed' && (
            <Button variant="outline" size="sm" onClick={() => p.onRetry(s.id)}>
              <RotateCcw strokeWidth={1.8} />
              Retry
            </Button>
          )}
          {!live && s.open && (
            <Button variant="ghost" size="sm" onClick={() => p.onOpen(s.open!)}>
              Open
            </Button>
          )}
          {!live && s.regenerate && (
            <Button variant="outline" size="sm" onClick={() => p.onRegenerate(s.regenerate!)}>
              Regenerate
            </Button>
          )}
          {!live && p.runnable && (
            <Button
              variant={s.status === 'done' ? 'ghost' : 'outline'}
              size="sm"
              disabled={p.busy}
              onClick={p.onRun}
            >
              {runLabel}
            </Button>
          )}
        </div>
      </div>
      {showChildren && p.children.length > 0 && (
        <ul className="mt-1 ml-7">
          {p.children.map((c) => (
            <TaskRow key={c.id} task={c} now={p.now} onRetry={() => p.onRetry(c.id)} />
          ))}
        </ul>
      )}
    </li>
  )
}

import { useMemo, useRef } from 'react'
import type { RunView, StepState } from '@shared/research'
import { minutesLeft, smooth, stageLine, timeLeftText } from '@/lib/eta'
import { money, progressCounts } from '@/lib/research'

/**
 * While a run is going (REQUIREMENTS-v4.4 4.2): a bar from finished tasks, what is happening in
 * plain words, time left once 3 tasks are done, and the running cost against the budget.
 */
export function ProgressHeader({ run, steps }: { run: RunView; steps: StepState[] }) {
  const { done, total } = progressCounts(run)
  const pct = total ? Math.round((done / total) * 100) : 0
  const deps = useMemo(() => new Map(steps.map((s) => [s.id, s.dependsOn])), [steps])
  const titles = useMemo(
    () => new Map(steps.filter((s) => s.stage === 4).map((s) => [s.id, s.title])),
    [steps]
  )
  const shown = useRef<number | null>(null)
  const raw = run.status === 'running' ? minutesLeft(run, deps) : null
  // The ref keeps the last shown number between renders, so it never jumps up by much.
  // eslint-disable-next-line react-hooks/refs -- smoothing across renders is the point
  shown.current = smooth(shown.current, raw)
  // eslint-disable-next-line react-hooks/refs -- read right after it is set
  const left = timeLeftText(shown.current)
  const stage = run.status === 'running' ? stageLine(run, titles) : null

  return (
    <div className="mt-6 rounded-xl border p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <p className="font-semibold" aria-live="polite">
          {stage ?? (run.status === 'paused' ? 'Paused' : 'Starting')}
        </p>
        <p className="text-muted-foreground tabular-nums">
          <span className="text-foreground font-semibold">{money(run.spentUsd)}</span> so far, of{' '}
          {money(run.budgetCapUsd)} budget
        </p>
      </div>
      <div
        className="bg-secondary mt-3 h-2 overflow-hidden rounded-full"
        role="progressbar"
        aria-label="Research progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${done} of ${total} steps done`}
      >
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-muted-foreground mt-2 flex justify-between text-[13px] tabular-nums">
        <span>
          {done} of {total} steps done
        </span>
        {left && <span>{left}</span>}
      </p>
    </div>
  )
}

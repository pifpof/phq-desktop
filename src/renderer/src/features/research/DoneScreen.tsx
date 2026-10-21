import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import type { DoneStats } from '@shared/research'
import { Button } from '@/components/ui/button'
import { api, unwrap } from '@/lib/api'
import { money } from '@/lib/research'
import { useApp } from '@/store/app'
import { useResearch } from '@/store/research'
import { HeldPrompt } from './HeldPrompt'

const COUNTDOWN_S = 5

const reducedMotion = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border px-4 py-4 text-center">
      <p className="font-serif text-[28px] leading-none font-bold tabular-nums">{value}</p>
      <p className="text-muted-foreground mt-2 text-[13px]">{label}</p>
    </div>
  )
}

/**
 * "Your positioning playbook is ready" (REQUIREMENTS-v4.4 3.3). Calm: a check, the numbers, one
 * button. It opens the playbook by itself after 5 seconds unless the founder moves, types or clicks,
 * and never under reduced motion. Leaving it in any way records that it was seen.
 */
export function DoneScreen({ runId }: { runId: string }) {
  const run = useResearch((s) => s.run)
  const [stats, setStats] = useState<DoneStats | null>(null)
  const [left, setLeft] = useState<number | null>(reducedMotion() ? null : COUNTDOWN_S)
  const [held, setHeld] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const messagingRunning =
    run?.id === runId &&
    ['waiting', 'running'].includes(
      run.tasks.find((t) => t.id === 'messaging-analysis')?.status ?? ''
    )

  useEffect(() => {
    void unwrap(api.doneStats(runId))
      .then(setStats)
      .catch(() => setStats(null))
  }, [runId])

  // Focus the heading so screen readers announce the screen; the button is next in tab order.
  useEffect(() => heading.current?.focus(), [])

  // Leaving the screen, however it happens, counts as seeing it.
  useEffect(() => () => useResearch.getState().closeDone(), [])

  // Any pointer move, key or click stops the countdown.
  useEffect(() => {
    if (left === null || held) return
    const hold = (): void => setHeld(true)
    const events = ['pointermove', 'pointerdown', 'keydown'] as const
    for (const e of events) window.addEventListener(e, hold, { once: true })
    return () => {
      for (const e of events) window.removeEventListener(e, hold)
    }
  }, [left, held])

  const open = (): void => {
    useResearch.getState().closeDone()
    useApp.getState().openPlaybook({ step: 'overview', from: 'run' })
  }

  useEffect(() => {
    if (left === null || held) return
    if (left <= 0) {
      open()
      return
    }
    const t = setTimeout(() => setLeft(left - 1), 1000)
    return () => clearTimeout(t)
  }, [left, held])

  const retry = async (): Promise<void> => {
    if (!stats) return
    for (const t of stats.unfinished) await useResearch.getState().retry(t.id)
  }

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto px-6 py-14">
      <div className="w-full max-w-[640px] text-center">
        <div className="bg-accent mx-auto flex size-14 items-center justify-center rounded-full">
          <Check className="text-primary size-7" strokeWidth={2.2} aria-hidden />
        </div>
        <h1 ref={heading} tabIndex={-1} className="mt-6 text-[32px] leading-tight outline-none">
          Your positioning playbook is ready
        </h1>
        {stats && (
          <p className="lede mt-3">
            {stats.company ? `${stats.company}'s playbook` : 'Your playbook'}, built from{' '}
            {stats.sources} {stats.sources === 1 ? 'source' : 'sources'}.
          </p>
        )}

        {stats && (
          <>
            <div className="mt-8 grid grid-cols-3 gap-3">
              <Tile value={stats.sections} label="Sections" />
              <Tile value={stats.sources} label="Sources cited" />
              <Tile value={stats.competitors} label="Competitors profiled" />
            </div>
            <p className="text-muted-foreground mt-3 text-[13px]">
              Took {stats.minutes} min · Cost {money(stats.costUsd)}
            </p>
            {stats.biggestGap && (
              <p className="mt-5 text-left text-sm">
                <span className="text-warning mr-1.5 font-semibold">Biggest gap:</span>
                {stats.biggestGap.problem}
              </p>
            )}
            {stats.unfinished.length > 0 && (
              <p className="bg-secondary mt-4 flex flex-wrap items-center justify-between gap-2 rounded-[10px] px-4 py-2.5 text-left text-sm">
                <span>
                  {stats.unfinished.length} research{' '}
                  {stats.unfinished.length === 1 ? "step didn't" : "steps didn't"} finish. Your
                  playbook used everything else.
                </span>
                <Button variant="outline" size="sm" onClick={() => void retry()}>
                  Retry them
                </Button>
              </p>
            )}
          </>
        )}

        <Button className="mt-8 min-w-[220px]" onClick={open}>
          Open your playbook
        </Button>
        {left !== null && (
          <p className="text-muted-foreground mt-3 text-[13px]" aria-hidden={!held}>
            {held ? 'Take your time.' : `Opening in ${left} ${left === 1 ? 'second' : 'seconds'}`}
          </p>
        )}
        <p className="mt-4">
          <button
            type="button"
            className="text-primary text-sm font-medium underline-offset-2 hover:underline"
            onClick={() => useResearch.getState().closeDone()}
          >
            See research details
          </button>
        </p>
        <HeldPrompt className="bg-secondary mt-6 flex flex-wrap items-center justify-between gap-2 rounded-[10px] px-4 py-2.5 text-left" />
        {messagingRunning && (
          <p className="text-muted-foreground mt-6 text-[13px]">
            Messaging analysis is still running. We'll let you know.
          </p>
        )}
      </div>
    </div>
  )
}

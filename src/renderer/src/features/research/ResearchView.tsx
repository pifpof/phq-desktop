import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_BUDGET_USD, missingDeps, type StepState } from '@shared/research'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { DragRegion } from '@/components/DragRegion'
import { ApiError } from '@/lib/api'
import {
  aboutCost,
  canTick,
  costOf,
  duration,
  inRun,
  isActive,
  money,
  pauseText,
  playbookPublished,
  progressCounts,
  remaining,
  STAGE_TITLES,
  toggleStep
} from '@/lib/research'
import { useNow } from '@/lib/useNow'
import { useApp } from '@/store/app'
import { useResearch } from '@/store/research'
import { CostMeter } from './CostMeter'
import { StepRow } from './StepRow'

/**
 * The Research page (REQUIREMENTS-v4.4 4A): every research step with its status from disk. The founder
 * runs one step, ticks a few, or runs everything that is left, and opens each result as it lands.
 */
export function ResearchView() {
  const run = useResearch((s) => s.run)
  const steps = useResearch((s) => s.steps)
  const stepsError = useResearch((s) => s.stepsError)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [budgetText, setBudgetText] = useState<string | null>(null)
  const [editingBudget, setEditingBudget] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmStop, setConfirmStop] = useState(false)
  const now = useNow(run?.status === 'running')

  const active = isActive(run)
  // Statuses on disk change as tasks finish: read them again on every change in the run.
  const signature = run
    ? `${run.id}:${run.status}:${run.tasks.map((t) => t.status[0]).join('')}`
    : ''
  useEffect(() => {
    void useResearch.getState().loadSteps()
  }, [signature])

  const running = useMemo(() => inRun(run), [run])
  const list = useMemo(() => steps ?? [], [steps])
  const byId = useMemo(() => new Map(list.map((s) => [s.id, s])), [list])
  // A ticked step that joined the run, or lost what it needs, is no longer ticked.
  const ticked = useMemo(() => {
    const keep = new Set<string>()
    for (const id of selected) {
      const s = byId.get(id)
      if (s && canTick(s, list, selected, running)) keep.add(id)
    }
    return keep
  }, [selected, byId, list, running])

  const defaultBudget = run?.budgetCapUsd ?? DEFAULT_BUDGET_USD
  const budget = budgetText === null ? defaultBudget : Number(budgetText)
  const budgetValid = Number.isFinite(budget) && budget >= 1 && budget <= 1000

  if (!steps) {
    return (
      <div className="bg-background relative flex h-full items-center justify-center">
        <DragRegion />
        <p className="text-muted-foreground text-sm">{stepsError ?? 'Loading research steps...'}</p>
      </div>
    )
  }

  const left = remaining(list, running)
  const withOutput = list.filter((s) => s.status === 'done').length
  const published = playbookPublished(run)
  const { done, total } = run ? progressCounts(run) : { done: 0, total: 0 }

  const runIds = async (ids: string[]): Promise<void> => {
    if (!ids.length || busy) return
    setBusy(true)
    setError(null)
    try {
      await useResearch.getState().runTasks(ids, active ? undefined : budget)
      setSelected(new Set())
      setEditingBudget(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start. Please try again.')
    } finally {
      setBusy(false)
    }
  }
  const act = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const summary = active
    ? run!.status === 'paused'
      ? pauseText(run!)
      : `${done} of ${total} steps done in this run`
    : run?.status === 'done' && published
      ? 'Your playbook is ready.'
      : withOutput === 0
        ? 'Nothing has run yet. Start with one step, or run everything.'
        : `${withOutput} of ${list.length} steps have output. Run one, a few, or all.`

  const selectedSteps = [...ticked].map((id) => byId.get(id)!).filter(Boolean)
  const stages = [...new Set(list.map((s) => s.stage))].sort()
  const needsOf = (s: StepState): string[] =>
    running.has(s.id) || (s.status === 'done' && !s.rerunnable)
      ? []
      : missingDeps(s, byId, new Set([...ticked, ...running])).map((d) => byId.get(d)?.title ?? d)

  return (
    <div className="bg-background relative flex h-full flex-col">
      <DragRegion />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[820px] px-6 pt-14 pb-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Research</p>
              <h2 className="mt-3">Build your positioning</h2>
            </div>
            {left.length > 0 && (
              <Button
                variant={active ? 'outline' : 'default'}
                disabled={busy || (!active && !budgetValid)}
                onClick={() => void runIds(left.map((s) => s.id))}
              >
                {active ? 'Add all remaining' : 'Run all remaining'} ·{' '}
                {aboutCost(costOf(left)).replace(/^./, (c) => c.toLowerCase())}
              </Button>
            )}
          </div>
          <p className="lede mt-3" aria-live="polite">
            {summary}
            {active && run && (
              <span className="text-muted-foreground text-[15px]">
                {' '}
                {duration((run.endedAt ?? now) - run.startedAt)} so far
              </span>
            )}
          </p>

          {active && run && (
            <>
              <div className="mt-6 rounded-xl border p-5">
                <CostMeter spent={run.spentUsd} cap={run.budgetCapUsd} />
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {run.status === 'paused' ? (
                  <Button
                    disabled={busy}
                    onClick={() => void act(() => useResearch.getState().resume())}
                  >
                    Resume research
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void act(() => useResearch.getState().pause())}
                  >
                    Pause
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="border-destructive/50 text-destructive hover:bg-destructive/5"
                  onClick={() => setConfirmStop(true)}
                >
                  Stop research
                </Button>
              </div>
            </>
          )}
          {!active && published && (
            <Button className="mt-5" onClick={() => void useApp.getState().goHome('playbook')}>
              Open your playbook
            </Button>
          )}

          {run?.skipWeb && active && (
            <p className="bg-secondary mt-4 rounded-[10px] px-4 py-3 text-sm">
              Web research is being skipped. Your playbook will be built from your website and
              files.
            </p>
          )}
          {error && (
            <p className="text-destructive mt-4 text-sm" role="alert">
              {error}
            </p>
          )}

          <div className="mt-10 space-y-8">
            {stages.map((stage) => (
              <section key={stage} aria-labelledby={`stage-${stage}`}>
                <h3
                  id={`stage-${stage}`}
                  className="text-muted-foreground font-sans text-[13px] font-semibold tracking-[0.14em] uppercase"
                >
                  {STAGE_TITLES[stage] ?? `Stage ${stage}`}
                </h3>
                {stage === 4 && (
                  <p className="text-muted-foreground mt-1 text-[13px]">
                    Each step ends with key takeaways and, where needed, a gap to close.
                  </p>
                )}
                <ul className="mt-2 divide-y">
                  {list
                    .filter((s) => s.stage === stage)
                    .map((s) => {
                      const live = running.has(s.id)
                        ? run!.tasks.find((t) => t.id === s.id)
                        : undefined
                      const alone = new Set(running)
                      return (
                        <StepRow
                          key={s.id}
                          step={s}
                          live={live}
                          children={live ? run!.tasks.filter((c) => c.parent === s.id) : []}
                          now={now}
                          ticked={ticked.has(s.id)}
                          tickable={ticked.has(s.id) || canTick(s, list, ticked, running)}
                          needs={needsOf(s)}
                          runnable={canTick(s, list, alone, running)}
                          busy={busy}
                          onToggle={() => setSelected(toggleStep(s.id, list, ticked, running))}
                          onRun={() => void runIds([s.id])}
                          onRetry={(id) => void useResearch.getState().retry(id)}
                          onOpen={(path) => useApp.getState().openWikiFile(path)}
                          onRegenerate={(slug) => useApp.getState().openRegenerate(slug)}
                        />
                      )
                    })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>

      {ticked.size > 0 && (
        <div className="bg-background shrink-0 border-t py-3">
          <div className="mx-auto flex max-w-[820px] flex-wrap items-center justify-between gap-3 px-6">
            <div className="text-sm">
              <span className="font-semibold">{ticked.size} selected</span>
              <span className="text-muted-foreground">
                {' · '}
                {aboutCost(costOf(selectedSteps)).replace(/^./, (c) => c.toLowerCase())}
              </span>
              <span className="text-muted-foreground"> · </span>
              {active ? (
                <span className="text-muted-foreground">
                  This run pauses at {money(run!.budgetCapUsd)}
                </span>
              ) : editingBudget ? (
                <span className="inline-flex items-center gap-1.5">
                  <label htmlFor="run-budget" className="text-muted-foreground">
                    Pauses at $
                  </label>
                  <Input
                    id="run-budget"
                    autoFocus
                    inputMode="decimal"
                    className="h-8 w-20"
                    value={budgetText ?? String(defaultBudget)}
                    aria-invalid={!budgetValid}
                    onChange={(e) => setBudgetText(e.target.value.replace(/[^0-9.]/g, ''))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && budgetValid) setEditingBudget(false)
                    }}
                  />
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Pauses at {money(budget)}{' '}
                  <button
                    type="button"
                    className="text-primary font-medium underline-offset-2 hover:underline"
                    onClick={() => setEditingBudget(true)}
                  >
                    Change
                  </button>
                </span>
              )}
              {!budgetValid && !active && (
                <span className="text-destructive block text-[13px]">
                  Enter an amount between $1 and $1,000.
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
              <Button
                disabled={busy || (!active && !budgetValid)}
                onClick={() => void runIds([...ticked])}
              >
                {active ? 'Add to this run' : 'Run selected'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={confirmStop} onOpenChange={setConfirmStop}>
        <DialogContent className="max-w-[440px]">
          <DialogTitle>Stop research?</DialogTitle>
          <DialogDescription className="mt-2">
            Finished steps are kept. You can run the rest later.
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-3">
            <DialogClose asChild>
              <Button variant="outline">Keep going</Button>
            </DialogClose>
            <Button
              className="bg-destructive hover:bg-destructive/90 text-white"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await useResearch.getState().cancel()
                  setConfirmStop(false)
                })
              }
            >
              Stop research
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

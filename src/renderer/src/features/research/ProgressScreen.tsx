import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@/components/ui/dialog'
import { DragRegion } from '@/components/DragRegion'
import {
  duration,
  pauseText,
  playbookPublished,
  progressCounts,
  STAGE_TITLES
} from '@/lib/research'
import { useNow } from '@/lib/useNow'
import { useApp } from '@/store/app'
import { useResearch } from '@/store/research'
import { CostMeter } from './CostMeter'
import { TaskRow } from './TaskRow'

export function ProgressScreen() {
  const run = useResearch((s) => s.run)
  const [confirmStop, setConfirmStop] = useState(false)
  const [busy, setBusy] = useState(false)
  const now = useNow(run?.status === 'running')

  if (!run) {
    return (
      <div className="flex h-full items-center justify-center">
        <Button variant="outline" onClick={() => void useApp.getState().goHome()}>
          Back home
        </Button>
      </div>
    )
  }

  const { done, total } = progressCounts(run)
  const published = playbookPublished(run)
  const active = run.status === 'running' || run.status === 'paused'
  const elapsed = (run.endedAt ?? now) - run.startedAt
  const act = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const summary =
    run.status === 'done'
      ? published
        ? 'Your playbook is ready.'
        : 'Research finished.'
      : run.status === 'failed'
        ? published
          ? 'Your playbook is ready. Some steps did not finish.'
          : 'Some steps did not finish. Retry them below.'
        : run.status === 'cancelled'
          ? 'Research stopped. Finished steps are kept.'
          : run.status === 'paused'
            ? pauseText(run)
            : `${done} of ${total} steps done`

  const top = run.tasks.filter((t) => !t.parent)
  const stages = [...new Set(top.map((t) => t.stage))].sort()

  return (
    <div className="bg-background relative flex h-full flex-col">
      <DragRegion />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-6 pt-14 pb-16">
          <p className="eyebrow">Research</p>
          <h2 className="mt-3">Building your positioning</h2>
          <p className="lede mt-3" aria-live="polite">
            {summary}
            {active && (
              <span className="text-muted-foreground text-[15px]"> {duration(elapsed)} so far</span>
            )}
          </p>

          <div className="mt-6 rounded-xl border p-5">
            <CostMeter spent={run.spentUsd} cap={run.budgetCapUsd} />
          </div>

          {run.skipWeb && (
            <p className="bg-secondary mt-4 rounded-[10px] px-4 py-3 text-sm">
              Web research is being skipped. Your playbook will be built from your website and
              files.
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {published && (
              <Button onClick={() => void useApp.getState().goHome('playbook')}>
                Open your playbook
              </Button>
            )}
            {run.status === 'paused' && (
              <Button
                disabled={busy}
                onClick={() => void act(() => useResearch.getState().resume())}
              >
                Resume research
              </Button>
            )}
            <Button
              variant={published ? 'outline' : active ? 'outline' : 'default'}
              onClick={() => void useApp.getState().goHome()}
            >
              {active ? 'Continue in the background' : 'Back home'}
            </Button>
            {active && (
              <Button
                variant="outline"
                className="border-destructive/50 text-destructive hover:bg-destructive/5"
                onClick={() => setConfirmStop(true)}
              >
                Stop research
              </Button>
            )}
          </div>

          <div className="mt-10 space-y-8">
            {stages.map((stage) => (
              <section key={stage}>
                <h3 className="text-muted-foreground font-sans text-[13px] font-semibold tracking-[0.14em] uppercase">
                  {STAGE_TITLES[stage] ?? `Stage ${stage}`}
                </h3>
                <ul className="mt-2 divide-y">
                  {top
                    .filter((t) => t.stage === stage)
                    .flatMap((t) => [
                      <TaskRow
                        key={t.id}
                        task={t}
                        now={now}
                        onRetry={() => void useResearch.getState().retry(t.id)}
                      />,
                      ...run.tasks
                        .filter((c) => c.parent === t.id)
                        .map((c) => (
                          <TaskRow
                            key={c.id}
                            task={c}
                            now={now}
                            child
                            onRetry={() => void useResearch.getState().retry(c.id)}
                          />
                        ))
                    ])}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={confirmStop} onOpenChange={setConfirmStop}>
        <DialogContent className="max-w-[440px]">
          <DialogTitle>Stop research?</DialogTitle>
          <DialogDescription className="mt-2">
            Finished steps are kept. You can run research again later.
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

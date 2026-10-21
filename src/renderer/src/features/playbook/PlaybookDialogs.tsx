import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { PlaybookRegenPlan, RegenEstimate, TakeawaysPlan } from '@shared/regen'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api, ApiError, unwrap } from '@/lib/api'
import { money, range } from '@/lib/research'
import { useApp } from '@/store/app'
import { useResearch } from '@/store/research'

/**
 * Previews for the playbook's own runs (CLAUDE.md rule 25): they only read, with no model call and
 * no cost, until Start.
 */

function Estimate({ e, cap }: { e: RegenEstimate; cap: number }) {
  return (
    <p className="text-sm">
      {range(e.costUsd.low, e.costUsd.high, money)} · about{' '}
      {range(Math.max(1, Math.round(e.minutes.low)), Math.max(1, Math.round(e.minutes.high)), (n) =>
        String(n)
      )}{' '}
      {Math.round(e.minutes.high) <= 1 ? 'minute' : 'minutes'}
      <span className="text-muted-foreground"> · budget cap {money(cap)}</span>
    </p>
  )
}

function Shell({
  title,
  description,
  children,
  busy,
  error,
  onClose,
  onStart,
  startLabel,
  ready
}: {
  title: string
  description: string
  children: ReactNode
  busy: boolean
  error: string | null
  onClose: () => void
  onStart: () => void
  startLabel: string
  ready: boolean
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[560px] gap-0 p-0">
        <div className="border-b px-6 pt-6 pb-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="mt-1.5">{description}</DialogDescription>
        </div>
        <div className="px-6 py-5">
          {children}
          {error && (
            <p role="alert" className="text-destructive mt-4 text-sm">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t px-6 py-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!ready || busy} onClick={onStart}>
            {busy ? 'Starting...' : startLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const failed = (err: unknown): string =>
  err instanceof ApiError ? err.message : 'Could not start. Please try again.'

/** Regenerate playbook (REQUIREMENTS-v4 4): the seven sections and the messaging analysis again. */
export function RegeneratePlaybookDialog({ onClose }: { onClose: () => void }) {
  const [plan, setPlan] = useState<PlaybookRegenPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void unwrap(api.playbookRegenPlan())
      .then(setPlan)
      .catch(() => setError('Could not read the playbook. Please try again.'))
  }, [])
  const start = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await useResearch.getState().rerun({ preset: 'playbook' })
      onClose()
      void useApp.getState().goHome('research')
    } catch (err) {
      setError(failed(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Shell
      title="Regenerate playbook"
      description="Writes the seven sections and the messaging analysis again from your wiki. Nothing changes until you start."
      busy={busy}
      error={error}
      onClose={onClose}
      onStart={() => void start()}
      startLabel="Start"
      ready={!!plan}
    >
      {plan ? (
        <>
          <h3 className="eyebrow text-[12px]">What runs again</h3>
          <ul className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            {plan.tasks.map((t) => (
              <li key={t.id}>{t.title}</li>
            ))}
          </ul>
          {plan.waiting > 0 && (
            <p className="border-warning/30 bg-warning-bg mt-4 flex items-start gap-2 rounded-xl border px-3 py-2 text-sm">
              <AlertTriangle className="text-warning mt-[3px] size-4 shrink-0" strokeWidth={2} />
              <span>
                {plan.waiting === 1 ? '1 change is' : `${plan.waiting} changes are`} waiting on
                playbook pages. A full re-run keeps to applied changes only. To apply{' '}
                {plan.waiting === 1 ? 'it' : 'them'}, regenerate the page from its Make a change
                review.
              </span>
            </p>
          )}
          <h3 className="eyebrow mt-5 text-[12px]">Estimate</h3>
          <div className="mt-2">
            <Estimate e={plan.estimate} cap={plan.budgetCapUsd} />
          </div>
        </>
      ) : (
        !error && <p className="text-muted-foreground text-sm">Looking at the playbook...</p>
      )}
    </Shell>
  )
}

/** Add key takeaways and gaps to an older playbook (REQUIREMENTS-v4 7.3). */
export function TakeawaysDialog({ onClose }: { onClose: () => void }) {
  const [plan, setPlan] = useState<TakeawaysPlan | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void unwrap(api.takeawaysPlan())
      .then(setPlan)
      .catch(() => setPlan(null))
  }, [])
  const start = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await unwrap(api.addTakeaways())
      await useResearch.getState().load()
      onClose()
    } catch (err) {
      setError(failed(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Shell
      title="Add key takeaways and gaps"
      description="Reads your playbook pages and writes three key takeaways for each section, plus a gap to close where the evidence is weak. The rest of each page stays as it is. You review the result before anything changes."
      busy={busy}
      error={error}
      onClose={onClose}
      onStart={() => void start()}
      startLabel="Start"
      ready={!!plan}
    >
      {plan === undefined && (
        <p className="text-muted-foreground text-sm">Looking at the pages...</p>
      )}
      {plan === null && (
        <p className="text-muted-foreground text-sm">There are no playbook pages yet.</p>
      )}
      {plan && (
        <>
          <h3 className="eyebrow text-[12px]">Pages</h3>
          <ul className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            {plan.pages.map((p) => (
              <li key={p.slug}>{p.title}</li>
            ))}
            {plan.advantages && <li>Distinct Advantages (playbook only)</li>}
          </ul>
          {plan.private && (
            <p className="text-muted-foreground mt-4 text-sm">
              Some pages use your own files. Their takeaways can too, so they stay private like the
              pages.
            </p>
          )}
          <h3 className="eyebrow mt-5 text-[12px]">Estimate</h3>
          <div className="mt-2">
            <Estimate e={plan.estimate} cap={plan.budgetCapUsd} />
          </div>
        </>
      )}
    </Shell>
  )
}

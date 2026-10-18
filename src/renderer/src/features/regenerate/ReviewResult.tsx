import { useEffect, useState } from 'react'
import { Check, CircleAlert } from 'lucide-react'
import type { KeepResult, RegenReview } from '@shared/regen'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api, ApiError, unwrap } from '@/lib/api'
import { money } from '@/lib/research'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useChanges } from '@/store/changes'
import { useResearch } from '@/store/research'
import { useWikiNav } from '@/store/wiki-nav'
import { MakeChangeDialog } from '@/features/changes/MakeChangeDialog'
import { BeforeAfter } from './BeforeAfter'

const APPLIED = {
  yes: { label: 'Applied', className: 'border-primary-light bg-accent text-primary' },
  partly: { label: 'Partly applied', className: 'border-warning/40 bg-warning-bg text-warning' },
  no: { label: 'Not applied', className: 'border-warning/40 bg-warning-bg text-warning' }
} as const

/**
 * Review the result (REQUIREMENTS-v3.1 5): before and after, the change report, and Keep or
 * Discard. Opens by itself when a regeneration finishes, and at launch if one is waiting.
 */
export function ReviewResult() {
  const runStatus = useResearch((s) => s.run?.status)
  const [review, setReview] = useState<RegenReview | null>(null)
  const [kept, setKept] = useState<KeepResult | null>(null)
  const [another, setAnother] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The job is marked ready just after the run ends, so keep asking for a few seconds.
  useEffect(() => {
    if (runStatus === 'running' || runStatus === 'paused') return
    let cancelled = false
    let tries = 0
    const check = async (): Promise<void> => {
      const job = await unwrap(api.regenJob()).catch(() => null)
      if (cancelled || !job) return
      if (job.status === 'running' && tries++ < 30) {
        setTimeout(() => void check(), 500)
        return
      }
      if (job.status !== 'review') return
      const r = await unwrap(api.regenReview()).catch(() => null)
      if (!cancelled && r) {
        setKept(null)
        setReview(r)
      }
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [runStatus])

  const page = review?.job.page ?? null
  const done = async (): Promise<void> => {
    await useChanges.getState().load()
    await useWikiNav.getState().reloadTrees()
  }

  const keep = async (thenChange: boolean): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const r = await unwrap(api.keepRegeneration())
      await done()
      if (thenChange && page) {
        setReview(null)
        setAnother(page)
      } else setKept(r)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not keep it. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const discard = async (): Promise<void> => {
    setBusy(true)
    try {
      await unwrap(api.discardRegeneration())
      await done()
      setReview(null)
    } finally {
      setBusy(false)
    }
  }

  const close = (): void => {
    setReview(null)
    setKept(null)
  }

  return (
    <>
      {review && (
        <Dialog open onOpenChange={(o) => !o && kept && close()}>
          <DialogContent
            className={cn(
              'gap-0 p-0',
              kept ? 'max-w-[560px]' : 'h-[calc(100vh-48px)] max-w-[1180px]'
            )}
            onInteractOutside={(e) => e.preventDefault()}
          >
            {kept ? (
              <div className="p-6">
                <DialogTitle className="flex items-center gap-2">
                  <Check className="text-primary size-5" strokeWidth={2.2} />
                  Kept
                </DialogTitle>
                <DialogDescription className="mt-2 text-[15px]">
                  {review.job.pageTitle} is updated.{' '}
                  {kept.applied.length
                    ? `${kept.applied.length} ${kept.applied.length === 1 ? 'change is' : 'changes are'} now applied, and future regenerations keep to ${kept.applied.length === 1 ? 'it' : 'them'}.`
                    : ''}
                </DialogDescription>
                {review.job.report.some((r) => r.applied === 'partly') && (
                  <p className="text-muted-foreground mt-3 text-sm">
                    Partly applied changes count as applied. If something is still missing, make a
                    related change from the Changes tab.
                  </p>
                )}
                {kept.notApplied.length > 0 && (
                  <p className="border-warning/40 bg-warning-bg mt-4 rounded-xl border px-3 py-2 text-sm">
                    Not applied, so still waiting: {kept.notApplied.join(', ')}. Edit{' '}
                    {kept.notApplied.length === 1 ? 'it' : 'them'} and regenerate again.
                  </p>
                )}
                {kept.next && (
                  <p className="text-muted-foreground mt-4 text-sm">
                    Now regenerating the next page that depends on it. You&apos;ll review it when
                    it&apos;s done.
                  </p>
                )}
                <div className="mt-6 flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      close()
                      useApp.getState().openWikiFile(review.files[0]?.rel ?? '')
                    }}
                  >
                    Open the page
                  </Button>
                  <Button onClick={close}>Done</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="border-b px-6 pt-5 pb-3">
                  <DialogTitle>Review {review.job.pageTitle}</DialogTitle>
                  <DialogDescription className="mt-1">
                    The new version is ready. Nothing in your wiki has changed yet. This run cost{' '}
                    {money(review.job.costUsd)}.
                  </DialogDescription>
                  {review.job.report.length > 0 && (
                    <ul className="mt-3 space-y-1.5" aria-label="Change report">
                      {review.job.report.map((r) => {
                        const a = APPLIED[r.applied]
                        return (
                          <li key={r.id} className="flex flex-wrap items-start gap-2 text-sm">
                            <span
                              className={cn(
                                'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-semibold',
                                a.className
                              )}
                            >
                              {r.applied === 'yes' ? (
                                <Check className="size-3" strokeWidth={2.4} />
                              ) : (
                                <CircleAlert className="size-3" strokeWidth={2.4} />
                              )}
                              {a.label}
                            </span>
                            <span className="min-w-0">
                              <span className="font-medium">{r.name}</span>
                              {r.note && <span className="text-muted-foreground">: {r.note}</span>}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
                <BeforeAfter files={review.files} />
                <div className="flex flex-wrap items-center justify-end gap-3 border-t px-6 py-4">
                  {error && (
                    <p role="alert" className="text-destructive mr-auto text-sm">
                      {error}
                    </p>
                  )}
                  <Button variant="outline" disabled={busy} onClick={() => void discard()}>
                    Discard
                  </Button>
                  <Button variant="outline" disabled={busy} onClick={() => void keep(true)}>
                    Keep, and make another change
                  </Button>
                  <Button disabled={busy} onClick={() => void keep(false)}>
                    Keep this version
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}
      {another && (
        <MakeChangeDialog open onOpenChange={(o) => !o && setAnother(null)} pages={[another]} />
      )}
    </>
  )
}

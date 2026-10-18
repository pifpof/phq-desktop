import { useMemo, useState } from 'react'
import { ChevronDown, PencilLine, RefreshCw } from 'lucide-react'
import type { Change } from '@shared/changes'
import { Button } from '@/components/ui/button'
import { api, ApiError, unwrap } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useChanges, waitingFor } from '@/store/changes'
import { isActive } from '@/lib/research'
import { regenerating, useRegen } from '@/store/regen'
import { useResearch } from '@/store/research'
import { MakeChangeDialog } from './MakeChangeDialog'

/** "2 changes waiting" under a page's header (REQUIREMENTS-v3.1 3.5). */
export function PendingBanner({ page }: { page: string }) {
  const all = useChanges((s) => s.changes)
  const runActive = useResearch((s) => isActive(s.run))
  const job = useRegen((s) => s.job)
  const busy = regenerating(job, runActive, page)
  const changes = useMemo(() => waitingFor(all, page), [all, page])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Change | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!changes.length) return null
  const n = changes.length

  const withdraw = async (c: Change): Promise<void> => {
    setError(null)
    try {
      await unwrap(api.withdrawChange(c.id))
      await useChanges.getState().load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not withdraw it. Please try again.')
    }
  }

  return (
    <div className="bg-accent border-b px-6 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <PencilLine className="text-primary size-4 shrink-0" strokeWidth={2} />
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">
            {n} {n === 1 ? 'change' : 'changes'} waiting.
          </span>{' '}
          {n === 1 ? "It'll" : "They'll"} be applied when you regenerate.
        </p>
        <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Show'}
          <ChevronDown
            className={cn('transition-transform', open && 'rotate-180')}
            strokeWidth={1.8}
          />
        </Button>
        <Button
          size="sm"
          disabled={runActive}
          aria-busy={busy}
          className={cn(busy && 'disabled:opacity-100')}
          onClick={() => useApp.getState().openRegenerate(page)}
        >
          {busy && <RefreshCw className="animate-spin" strokeWidth={1.8} />}
          {busy ? 'Regenerating...' : 'Review and regenerate'}
        </Button>
      </div>
      {open && (
        <ul className="mt-3 space-y-2">
          {changes.map((c) => (
            <li key={c.id} className="rounded-xl border bg-white px-4 py-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-muted-foreground text-[13px]">{c.section ?? 'Whole page'}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>
                    Edit
                  </Button>
                  {confirming === c.id ? (
                    <Button variant="outline" size="sm" onClick={() => void withdraw(c)}>
                      Yes, withdraw
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => setConfirming(c.id)}>
                      Withdraw
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-1.5">
                <span className="text-muted-foreground">Why: </span>
                {c.why}
              </p>
              <p className="mt-1">
                <span className="text-muted-foreground">Change it to: </span>
                {c.changeTo}
              </p>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-destructive mt-2 text-sm">
          {error}
        </p>
      )}
      {editing && (
        <MakeChangeDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          pages={[page]}
          edit={editing}
        />
      )}
    </div>
  )
}

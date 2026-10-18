import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, FileText, Globe, Quote, RefreshCw } from 'lucide-react'
import type { Change } from '@shared/changes'
import { regenWarnings, type RegenPlan } from '@shared/regen'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api, ApiError, unwrap } from '@/lib/api'
import { money, range } from '@/lib/research'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useChanges } from '@/store/changes'
import { formatDay } from '@/features/wiki/format'
import { MakeChangeDialog } from '@/features/changes/MakeChangeDialog'

/** Regenerate <page> (REQUIREMENTS-v3.1 4.1): what will shape the new version, then Start. */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <h3 className="eyebrow text-[12px]">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}

const KIND_ICON: Record<string, typeof FileText> = {
  page: Globe,
  citation: Quote,
  file: FileText
}

function ChangeCard({
  c,
  checked,
  onToggle,
  onEdit,
  onWithdraw,
  label
}: {
  c: Change
  checked: boolean
  onToggle: () => void
  onEdit?: () => void
  onWithdraw?: () => void
  label: string
}) {
  return (
    <li className={cn('rounded-xl border px-4 py-3 text-sm', checked ? 'bg-white' : 'bg-muted')}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={`${label}: ${c.name}`}
          className="accent-primary mt-1"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold">{c.name}</p>
            <span className="flex gap-1">
              {onEdit && (
                <button type="button" className="text-primary text-[13px]" onClick={onEdit}>
                  Edit
                </button>
              )}
              {onWithdraw && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground ml-2 text-[13px]"
                  onClick={onWithdraw}
                >
                  Withdraw
                </button>
              )}
            </span>
          </div>
          <p className="text-muted-foreground text-[13px]">
            {c.pageTitle} · {c.section ?? 'whole page'}
          </p>
          <p className="mt-1.5">
            <span className="text-muted-foreground">Why: </span>
            {c.why}
          </p>
          <p className="mt-0.5">
            <span className="text-muted-foreground">Change it to: </span>
            {c.changeTo}
          </p>
        </div>
      </div>
    </li>
  )
}

export function RegeneratePreview() {
  const page = useApp((s) => s.regenPage)
  const close = (): void => useApp.getState().openRegenerate(null)
  const [plan, setPlan] = useState<RegenPlan | null | undefined>(undefined)
  const [included, setIncluded] = useState<Set<string>>(new Set())
  const [refresh, setRefresh] = useState(false)
  const [dependents, setDependents] = useState(false)
  const [respectOpen, setRespectOpen] = useState(false)
  const [editing, setEditing] = useState<Change | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async (keep = false): Promise<void> => {
    if (!page) return
    const p = await unwrap(api.planRegeneration(page)).catch(() => null)
    setPlan(p)
    if (p && !keep) setIncluded(new Set(p.pending.map((c) => c.id)))
    // After an edit or withdrawal: keep what was ticked, if it is still there.
    if (p && keep) {
      const ids = new Set([...p.pending, ...p.fromOthers].map((c) => c.id))
      setIncluded((cur) => new Set([...cur].filter((id) => ids.has(id))))
    }
  }

  useEffect(() => {
    if (!page) return
    /* eslint-disable react-hooks/set-state-in-effect -- a fresh preview each time it opens */
    setPlan(undefined)
    setRefresh(false)
    setDependents(false)
    setRespectOpen(false)
    setError(null)
    /* eslint-enable react-hooks/set-state-in-effect */
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only for a new page
  }, [page])

  const includedChanges = useMemo(
    () => (plan ? [...plan.pending, ...plan.fromOthers].filter((c) => included.has(c.id)) : []),
    [plan, included]
  )
  const warnings = plan ? regenWarnings(plan, includedChanges) : []
  const toggle = (id: string): void =>
    setIncluded((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (!page) return null
  const p = plan
  const anyPrivate = includedChanges.some((c) => c.private)
  const canRefresh = !!p?.web && !p.refreshBlocked && !anyPrivate
  const updates = p
    ? p.updates.sources.length +
      p.updates.pages.length +
      p.updates.profile.length +
      p.updates.changes.length
    : 0
  const nothing = !!p && includedChanges.length === 0 && updates === 0
  const base = p ? (refresh && canRefresh ? p.estimate.refresh : p.estimate.base) : null
  const cost =
    base && p
      ? {
          low: base.costUsd.low + (dependents ? p.estimate.dependents.costUsd.low : 0),
          high: base.costUsd.high + (dependents ? p.estimate.dependents.costUsd.high : 0)
        }
      : null
  const minutes =
    base && p
      ? {
          low: base.minutes.low + (dependents ? p.estimate.dependents.minutes.low : 0),
          high: base.minutes.high + (dependents ? p.estimate.dependents.minutes.high : 0)
        }
      : null

  const openThing = (path: string): void => {
    close()
    useApp.getState().openWikiFile(path)
  }

  const start = async (): Promise<void> => {
    if (!p) return
    setBusy(true)
    setError(null)
    try {
      await unwrap(
        api.startRegeneration({
          page: p.page.slug,
          changeIds: includedChanges.map((c) => c.id),
          refreshWeb: refresh && canRefresh,
          dependents
        })
      )
      close()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const withdraw = async (c: Change): Promise<void> => {
    await unwrap(api.withdrawChange(c.id)).catch(() => undefined)
    await useChanges.getState().load()
    await load(true)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-[720px] gap-0 p-0">
        <div className="border-b px-6 pt-6 pb-4">
          <DialogTitle>Regenerate {p?.page.title ?? ''}</DialogTitle>
          <DialogDescription className="mt-1.5">
            Here&apos;s what will shape the new version. Nothing changes until you start.
          </DialogDescription>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {p === undefined && (
            <p className="text-muted-foreground text-sm">Looking at the page...</p>
          )}
          {p === null && (
            <p className="text-muted-foreground text-sm">This page is no longer in the wiki.</p>
          )}
          {p && !p.taskId && (
            <p className="text-sm">
              The app writes this page from what you tell it, so there is nothing to regenerate.
              Edit it directly instead.
            </p>
          )}
          {p && p.taskId && (
            <>
              {p.pending.length > 0 && (
                <Section title="Your changes">
                  <ul className="space-y-2">
                    {p.pending.map((c) => (
                      <ChangeCard
                        key={c.id}
                        c={c}
                        label="Apply"
                        checked={included.has(c.id)}
                        onToggle={() => toggle(c.id)}
                        onEdit={() => setEditing(c)}
                        onWithdraw={() => void withdraw(c)}
                      />
                    ))}
                  </ul>
                  <p className="text-muted-foreground mt-1.5 text-[13px]">
                    Unticked changes stay waiting for later.
                  </p>
                </Section>
              )}
              {p.fromOthers.length > 0 && (
                <Section title="Changes from other pages">
                  <ul className="space-y-2">
                    {p.fromOthers.map((c) => (
                      <ChangeCard
                        key={c.id}
                        c={c}
                        label="Include"
                        checked={included.has(c.id)}
                        onToggle={() => toggle(c.id)}
                      />
                    ))}
                  </ul>
                </Section>
              )}
              {p.respected.length > 0 && (
                <Section title="Earlier changes it keeps to">
                  <button
                    type="button"
                    className="text-primary flex items-center gap-1 text-sm"
                    aria-expanded={respectOpen}
                    onClick={() => setRespectOpen((o) => !o)}
                  >
                    Respects {p.respected.length} earlier{' '}
                    {p.respected.length === 1 ? 'change' : 'changes'}
                    <ChevronDown
                      className={cn('size-4 transition-transform', respectOpen && 'rotate-180')}
                      strokeWidth={1.8}
                    />
                  </button>
                  {respectOpen && (
                    <ul className="mt-2 space-y-1 text-sm">
                      {p.respected.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className="hover:text-primary text-left underline underline-offset-2"
                            onClick={() => openThing(c.path)}
                          >
                            {c.name}
                          </button>{' '}
                          <span className="text-muted-foreground">({formatDay(c.statusDate)})</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              )}
              {updates > 0 && (
                <Section title="Updates since this page was last generated">
                  <ul className="space-y-1.5 text-sm">
                    {p.updates.sources.map((s) => {
                      const Icon = KIND_ICON[s.kind] ?? FileText
                      return (
                        <li key={s.path} className="flex items-start gap-2">
                          <Icon
                            className="text-muted-foreground mt-[3px] size-3.5 shrink-0"
                            strokeWidth={1.8}
                          />
                          <span>
                            New source:{' '}
                            <button
                              type="button"
                              className="hover:text-primary underline underline-offset-2"
                              onClick={() => openThing(s.path)}
                            >
                              {s.title}
                            </button>{' '}
                            <span className="text-muted-foreground">({formatDay(s.ingested)})</span>
                          </span>
                        </li>
                      )
                    })}
                    {p.updates.pages.map((x) => (
                      <li key={x.slug} className="flex items-start gap-2">
                        <RefreshCw
                          className="text-muted-foreground mt-[3px] size-3.5 shrink-0"
                          strokeWidth={1.8}
                        />
                        <span>
                          {x.title} updated {formatDay(x.updated)}
                          {x.why ? ` ${x.why}` : ''}
                        </span>
                      </li>
                    ))}
                    {p.updates.profile.length > 0 && (
                      <li className="flex items-start gap-2">
                        <FileText
                          className="text-muted-foreground mt-[3px] size-3.5 shrink-0"
                          strokeWidth={1.8}
                        />
                        <span>Company profile edited: {p.updates.profile.join(', ')}</span>
                      </li>
                    )}
                    {p.updates.changes.map((c) => (
                      <li key={c.id} className="flex items-start gap-2">
                        <RefreshCw
                          className="text-muted-foreground mt-[3px] size-3.5 shrink-0"
                          strokeWidth={1.8}
                        />
                        <span>
                          Change applied {formatDay(c.date)}: {c.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              <Section title="Options">
                {p.web && (
                  <label
                    className={cn('flex items-start gap-2 text-sm', !canRefresh && 'opacity-60')}
                  >
                    <input
                      type="checkbox"
                      className="accent-primary mt-1"
                      disabled={!canRefresh}
                      checked={refresh && canRefresh}
                      onChange={(e) => setRefresh(e.target.checked)}
                    />
                    <span>
                      Also refresh web research for this page
                      <span className="text-muted-foreground block text-[13px]">
                        {canRefresh
                          ? 'Searches the web again. Costs more and takes longer.'
                          : p.refreshBlocked ||
                            'A change uses your private files, so the web is not searched with it. It uses the sources it already has.'}
                      </span>
                    </span>
                  </label>
                )}
                {p.dependents.length > 0 && (
                  <label className="mt-3 flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="accent-primary mt-1"
                      checked={dependents}
                      onChange={(e) => setDependents(e.target.checked)}
                    />
                    <span>
                      Then update pages that depend on this
                      <span className="text-muted-foreground block text-[13px]">
                        {p.dependents.map((x) => x.title).join(', ')}, one at a time, each with its
                        own review.
                        {p.reassemblesPlaybook &&
                          ' The playbook can then be reassembled at no cost.'}
                      </span>
                    </span>
                  </label>
                )}
                {!p.web && !p.dependents.length && (
                  <p className="text-muted-foreground text-sm">No options for this page.</p>
                )}
              </Section>
              {cost && minutes && (
                <Section title="Estimate">
                  <p className="text-sm">
                    {range(cost.low, cost.high, money)} · about{' '}
                    {range(
                      Math.max(1, Math.round(minutes.low)),
                      Math.max(1, Math.round(minutes.high)),
                      (n) => String(n)
                    )}{' '}
                    {Math.round(minutes.high) <= 1 ? 'minute' : 'minutes'}
                    <span className="text-muted-foreground">
                      {' '}
                      · budget cap {money(p.estimate.budgetCapUsd)}
                    </span>
                  </p>
                </Section>
              )}
              {warnings.length > 0 && (
                <Section title="Before you start">
                  <ul className="space-y-2">
                    {warnings.map((w, i) => (
                      <li
                        key={i}
                        className="border-warning/30 bg-warning-bg flex items-start gap-2 rounded-xl border px-3 py-2 text-sm"
                      >
                        <AlertTriangle
                          className="text-warning mt-[3px] size-4 shrink-0"
                          strokeWidth={2}
                        />
                        <span>
                          {w.text}
                          {w.kind === 'outsideEdit' && p.outsideEdit.canDescribe && (
                            <button
                              type="button"
                              className="text-primary ml-1 font-medium underline underline-offset-2"
                              onClick={async () => {
                                const c = await unwrap(api.editsToChange(p.page.slug)).catch(
                                  () => null
                                )
                                if (!c) return
                                await useChanges.getState().load()
                                await load(true)
                                setIncluded((cur) => new Set([...cur, c.id]))
                              }}
                            >
                              Turn my edits into a change
                            </button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {error && (
                <p role="alert" className="text-destructive mt-4 text-sm">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 border-t px-6 py-4">
          {nothing && (
            <p className="text-muted-foreground mr-auto text-sm">
              Nothing new to apply. Regenerate anyway?
            </p>
          )}
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button disabled={!p?.taskId || busy} onClick={() => void start()}>
            Start regenerating
          </Button>
        </div>
      </DialogContent>
      {editing && (
        <MakeChangeDialog
          open
          onOpenChange={(o) => {
            if (!o) {
              setEditing(null)
              void load(true)
            }
          }}
          pages={[editing.page]}
          edit={editing}
        />
      )}
    </Dialog>
  )
}

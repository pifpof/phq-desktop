import { useEffect, useMemo, useState } from 'react'
import { Check, PencilLine, RefreshCw, X, type LucideIcon } from 'lucide-react'
import type { Change, Regeneration } from '@shared/changes'
import { api, unwrap } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useChanges } from '@/store/changes'
import { useWikiNav } from '@/store/wiki-nav'
import { formatDay } from '@/features/wiki/format'
import { Highlight } from '@/features/wiki/tree-parts'
import { buildChangeLog, changeLine, type ChangeFilter } from './change-log'

const ICON: Record<Change['status'], { Icon: LucideIcon; className: string; label: string }> = {
  pending: { Icon: PencilLine, className: 'text-primary', label: 'Waiting' },
  applied: { Icon: Check, className: 'text-primary', label: 'Applied' },
  withdrawn: { Icon: X, className: 'text-muted-foreground', label: 'Withdrawn' },
  replaced: { Icon: X, className: 'text-muted-foreground', label: 'Replaced' }
}

const today = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The Changes tab (REQUIREMENTS-v3.1 3.6): a log, newest first, waiting changes pinned on top. */
export function ChangesTab({
  query,
  selected,
  page,
  onClearPage,
  onOpen
}: {
  query: string
  selected: string | null
  /** Filtered to this page (from a page's waiting marker). */
  page: { slug: string; title: string } | null
  onClearPage: () => void
  onOpen: (path: string) => void
}) {
  const changes = useChanges((s) => s.changes)
  const showRegenerations = useWikiNav((s) => s.showRegenerations)
  const [filter, setFilter] = useState<ChangeFilter>('all')
  const [regenerations, setRegenerations] = useState<Regeneration[]>([])

  useEffect(() => {
    if (!showRegenerations) return
    let cancelled = false
    const load = (): void => {
      void unwrap(api.listRegenerations())
        .then((r) => !cancelled && setRegenerations(r))
        .catch(() => undefined)
    }
    load()
    const off = api.onWikiTreeChanged(load)
    return () => {
      cancelled = true
      off()
    }
  }, [showRegenerations])

  const groups = useMemo(
    () =>
      buildChangeLog(changes, regenerations, {
        filter,
        query,
        page: page?.slug ?? null,
        showRegenerations,
        today: today()
      }),
    [changes, regenerations, filter, query, page, showRegenerations]
  )
  const waiting = changes.filter((c) => c.status === 'pending').length

  return (
    <div className="pb-2">
      <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-1 px-1">
        {(
          [
            ['all', 'All'],
            ['waiting', waiting ? `Waiting ${waiting}` : 'Waiting'],
            ['applied', 'Applied'],
            ['withdrawn', 'Withdrawn']
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={filter === id}
            onClick={() => setFilter(id)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[12px] font-medium',
              filter === id
                ? 'border-primary-light bg-accent text-primary'
                : 'text-muted-foreground hover:bg-secondary'
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="text-muted-foreground mt-2 flex items-center gap-2 px-1 text-[12px]">
        <input
          type="checkbox"
          className="accent-primary"
          checked={showRegenerations}
          onChange={(e) => useWikiNav.getState().setShowRegenerations(e.target.checked)}
        />
        Show regenerations
      </label>
      {page && (
        <p className="bg-accent text-primary mt-2 flex items-center justify-between gap-2 rounded-[8px] px-2 py-1 text-[12px]">
          <span className="truncate">Only {page.title}</span>
          <button type="button" aria-label="Show every page" onClick={onClearPage}>
            <X className="size-3.5" strokeWidth={2} />
          </button>
        </p>
      )}

      {!groups.length && (
        <p className="text-muted-foreground mt-4 px-1 text-sm">
          {changes.length
            ? 'No changes match.'
            : 'No changes yet. Open an article and choose Make a change.'}
        </p>
      )}
      {groups.map((g) => (
        <section key={g.id} className="mt-4" aria-label={g.label}>
          <h3 className="eyebrow px-1 pb-1 text-[12px]">{g.label}</h3>
          <ul>
            {g.entries.map((e) => {
              if (e.kind === 'regeneration')
                return (
                  <li key={e.id} className="flex items-start gap-2 px-2 py-1.5 text-sm">
                    <RefreshCw
                      className="text-muted-foreground mt-[3px] size-3.5 shrink-0"
                      strokeWidth={2}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="line-clamp-2">Regenerated {e.regeneration.text}</span>
                      <span className="text-muted-foreground block text-[12px]">
                        {formatDay(e.regeneration.date)}
                      </span>
                    </span>
                  </li>
                )
              const c = e.change
              const { Icon, className, label } = ICON[c.status]
              const gone = c.status === 'withdrawn' || c.status === 'replaced'
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    aria-current={selected === c.path ? 'true' : undefined}
                    onClick={() => onOpen(c.path)}
                    className={cn(
                      'focus-visible:ring-ring/50 flex w-full items-start gap-2 rounded-[8px] px-2 py-1.5 text-left outline-none focus-visible:ring-[3px]',
                      selected === c.path ? 'bg-accent' : 'hover:bg-secondary'
                    )}
                  >
                    <Icon
                      className={cn('mt-[3px] size-3.5 shrink-0', className)}
                      strokeWidth={2}
                      aria-label={label}
                    />
                    <span className="min-w-0">
                      <span
                        className={cn(
                          'line-clamp-2 text-sm leading-5',
                          selected === c.path && 'text-primary',
                          gone && 'text-muted-foreground line-through'
                        )}
                      >
                        <Highlight text={c.name} query={query} />
                      </span>
                      <span className="text-muted-foreground block text-[12px] leading-4">
                        {changeLine(c, formatDay)}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

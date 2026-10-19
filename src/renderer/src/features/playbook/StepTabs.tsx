import { useEffect, useRef, type KeyboardEvent } from 'react'
import { Star } from 'lucide-react'
import type { StepId } from '@shared/playbook'
import { cn } from '@/lib/utils'

export type StepKey = StepId | 'overview'

export interface StepPill {
  id: StepKey
  /** 0 for Overview. */
  n: number
  label: string
  gap: boolean
}

export const PANEL_ID = 'playbook-panel'
export const tabId = (id: StepKey): string => `playbook-tab-${id}`

/**
 * Overview plus the seven sections as numbered pills, with a progress bar (REQUIREMENTS-v4 4.1).
 * ARIA tabs: arrow keys move between tabs, Home and End jump.
 */
export function StepTabs({
  pills,
  current,
  visited,
  onSelect
}: {
  pills: StepPill[]
  current: StepKey
  visited: Set<StepKey>
  onSelect: (id: StepKey) => void
}) {
  const refs = useRef(new Map<StepKey, HTMLButtonElement>())
  const index = Math.max(
    0,
    pills.findIndex((p) => p.id === current)
  )
  const steps = pills.filter((p) => p.n > 0).length
  const progress = steps ? (pills[index]?.n ?? 0) / steps : 0

  // Narrow windows scroll the pills: keep the current one in view.
  useEffect(() => {
    refs.current.get(current)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [current])

  const move = (to: number): void => {
    const p = pills[(to + pills.length) % pills.length]
    if (!p) return
    onSelect(p.id)
    refs.current.get(p.id)?.focus()
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const keys: Record<string, () => void> = {
      ArrowRight: () => move(index + 1),
      ArrowLeft: () => move(index - 1),
      Home: () => move(0),
      End: () => move(pills.length - 1)
    }
    const f = keys[e.key]
    if (!f) return
    e.preventDefault()
    f()
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Playbook steps"
        onKeyDown={onKey}
        className="-mx-1 flex [scrollbar-width:thin] gap-1 overflow-x-auto px-1 pb-1"
      >
        {pills.map((p) => {
          const isCurrent = p.id === current
          const seen = visited.has(p.id) || isCurrent
          return (
            <button
              key={p.id}
              ref={(el) => {
                if (el) refs.current.set(p.id, el)
                else refs.current.delete(p.id)
              }}
              id={tabId(p.id)}
              type="button"
              role="tab"
              aria-selected={isCurrent}
              aria-controls={PANEL_ID}
              tabIndex={isCurrent ? 0 : -1}
              onClick={() => onSelect(p.id)}
              className={cn(
                'focus-visible:ring-ring/50 flex shrink-0 items-center gap-2 rounded-full border py-1 pr-3.5 pl-1 text-[14px] whitespace-nowrap outline-none focus-visible:ring-[3px]',
                isCurrent
                  ? 'border-primary-light bg-accent text-primary font-semibold'
                  : 'text-foreground hover:bg-secondary border-transparent font-medium'
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'flex size-[26px] shrink-0 items-center justify-center rounded-full font-serif text-[12px] font-bold',
                  seen
                    ? 'bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground border bg-white'
                )}
              >
                {p.n === 0 ? <Star className="size-3.5" strokeWidth={2.2} /> : p.n}
              </span>
              <span className={cn(!seen && 'text-muted-foreground')}>{p.label}</span>
              {p.gap && (
                <span
                  role="img"
                  aria-label="Has a gap to close"
                  title="Has a gap to close"
                  className="bg-warning size-1.5 rounded-full"
                />
              )}
            </button>
          )
        })}
      </div>
      <div
        className="bg-border mt-2 h-1 overflow-hidden rounded-full"
        role="progressbar"
        aria-label="Progress through the playbook"
        aria-valuemin={0}
        aria-valuemax={steps}
        aria-valuenow={pills[index]?.n ?? 0}
      >
        <div
          className="bg-primary h-full rounded-full motion-safe:transition-[width] motion-safe:duration-300"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  )
}

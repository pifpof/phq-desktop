import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TreeRowModel } from './tree-rows'

/**
 * One accessible tree for both Wiki tabs (REQUIREMENTS-v3 3.7). Rows arrive flattened with their
 * level and parent, so the tree can use aria-level, aria-setsize and aria-posinset and stay
 * cheap to render. Roving tabindex; arrows, Home, End, Enter, Space and type-ahead.
 */

const INDENT = 14
/** Above this many rows, off-screen rows skip layout and paint. */
const VIRTUALISE_AT = 300

export function Tree({
  rows,
  label,
  selectedId,
  render
}: {
  rows: TreeRowModel[]
  label: string
  selectedId: string | null
  render: (row: TreeRowModel) => ReactNode
}) {
  const [focusId, setFocusId] = useState<string | null>(null)
  const refs = useRef(new Map<string, HTMLDivElement>())
  const typed = useRef({ text: '', at: 0 })

  const index = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows])
  const sets = useMemo(() => {
    const size = new Map<string, number>()
    const pos = new Map<string, number>()
    for (const r of rows) {
      const key = `${r.parentId ?? ''}|${r.level}`
      const n = (size.get(key) ?? 0) + 1
      size.set(key, n)
      pos.set(r.id, n)
    }
    return { size, pos }
  }, [rows])

  const current = focusId !== null && index.has(focusId) ? focusId : null
  const tabStop = current ?? (selectedId && index.has(selectedId) ? selectedId : rows[0]?.id)

  // Opened from elsewhere (a link in the playbook): bring the selected row into view.
  useEffect(() => {
    if (selectedId) refs.current.get(selectedId)?.scrollIntoView({ block: 'nearest' })
  }, [selectedId, rows])

  const move = (id: string | undefined): void => {
    if (!id) return
    setFocusId(id)
    const el = refs.current.get(id)
    el?.focus()
    el?.scrollIntoView({ block: 'nearest' })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const id = tabStop
    if (!id) return
    const i = index.get(id) ?? 0
    const row = rows[i]
    const stop = (): void => {
      e.preventDefault()
      e.stopPropagation()
    }
    switch (e.key) {
      case 'ArrowDown':
        stop()
        return move(rows[i + 1]?.id)
      case 'ArrowUp':
        stop()
        return move(rows[i - 1]?.id)
      case 'Home':
        stop()
        return move(rows[0]?.id)
      case 'End':
        stop()
        return move(rows.at(-1)?.id)
      case 'ArrowRight':
        stop()
        if (row.expanded === false) return row.toggle?.(false)
        if (row.expanded && rows[i + 1]?.parentId === row.id) return move(rows[i + 1].id)
        return
      case 'ArrowLeft':
        stop()
        if (row.expanded) return row.toggle?.(false)
        return move(row.parentId ?? undefined)
      case 'Enter':
        stop()
        return (row.activate ?? (() => row.toggle?.(e.altKey)))()
      case ' ':
        stop()
        return (row.secondary ?? (() => row.toggle?.(false)))()
    }
    if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = Date.now()
      const t = typed.current
      t.text = now - t.at > 700 ? e.key.toLowerCase() : t.text + e.key.toLowerCase()
      t.at = now
      const order = [...rows.slice(i + (t.text.length === 1 ? 1 : 0)), ...rows.slice(0, i + 1)]
      const hit = order.find((r) => r.label.toLowerCase().startsWith(t.text))
      if (hit) {
        stop()
        move(hit.id)
      }
    }
  }

  const virtual = rows.length > VIRTUALISE_AT

  return (
    <div role="tree" aria-label={label} onKeyDown={onKeyDown} className="pb-2">
      {rows.map((r) => {
        const selected = r.id === selectedId
        return (
          <div
            key={r.id}
            ref={(el) => {
              if (el) refs.current.set(r.id, el)
              else refs.current.delete(r.id)
            }}
            role="treeitem"
            aria-level={r.level}
            aria-setsize={sets.size.get(`${r.parentId ?? ''}|${r.level}`)}
            aria-posinset={sets.pos.get(r.id)}
            aria-expanded={r.expanded}
            aria-selected={r.heading ? undefined : selected}
            tabIndex={r.id === tabStop ? 0 : -1}
            onFocus={() => setFocusId(r.id)}
            onClick={(e) => {
              setFocusId(r.id)
              if (r.activate) r.activate()
              else r.toggle?.(e.altKey)
            }}
            style={{
              paddingLeft: 8 + (r.level - 1) * INDENT,
              ...(virtual ? { contentVisibility: 'auto', containIntrinsicSize: 'auto 32px' } : {})
            }}
            className={cn(
              'focus-visible:ring-ring/50 flex w-full cursor-default items-start gap-1 rounded-[8px] pr-2 text-left outline-none select-none focus-visible:ring-[3px]',
              r.heading ? 'mt-3 py-1.5 first:mt-0' : 'py-1',
              selected ? 'bg-accent text-primary' : 'hover:bg-secondary',
              r.dim && 'opacity-60'
            )}
          >
            <span className="flex h-5 w-4 shrink-0 items-center justify-center">
              {r.chevron && (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  onClick={(e) => {
                    e.stopPropagation()
                    setFocusId(r.id)
                    r.toggle?.(e.altKey)
                  }}
                  className="text-muted-foreground hover:text-foreground flex size-4 items-center justify-center rounded"
                >
                  <ChevronRight
                    className={cn('size-3.5 transition-transform', r.expanded && 'rotate-90')}
                    strokeWidth={2}
                  />
                </button>
              )}
            </span>
            <div className="min-w-0 flex-1">{render(r)}</div>
          </div>
        )
      })}
    </div>
  )
}

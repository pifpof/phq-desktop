import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TreeRowModel } from './tree-rows'

/**
 * One accessible tree for both Wiki tabs (REQUIREMENTS-v3 3.7). Rows arrive flattened with their
 * level and parent, so the tree can use aria-level, aria-setsize and aria-posinset and stay
 * cheap to render. Roving tabindex; arrows, Home, End, Enter, Space and type-ahead. Each row can
 * have a help tooltip, shown on hover and on keyboard focus.
 */

const INDENT = 14
/** Above this many rows, off-screen rows skip layout and paint. */
const VIRTUALISE_AT = 300
const HOVER_DELAY = 450
const FOCUS_DELAY = 150
const TIP_ID = 'wiki-tree-tip'
const TIP_WIDTH = 300

interface Tip {
  id: string
  top: number
  left: number
}

export function Tree<R extends TreeRowModel>({
  rows,
  label,
  selectedId,
  render,
  tip
}: {
  rows: R[]
  label: string
  selectedId: string | null
  render: (row: R) => ReactNode
  /** Help shown beside a row. */
  tip?: (row: R) => ReactNode
}) {
  const [focusId, setFocusId] = useState<string | null>(null)
  const [shown, setShown] = useState<Tip | null>(null)
  const refs = useRef(new Map<string, HTMLDivElement>())
  const typed = useRef({ text: '', at: 0 })
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const keyboard = useRef(false)

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

  useEffect(() => () => clearTimeout(timer.current), [])
  // The tooltip is placed once; any scroll would leave it behind.
  useEffect(() => {
    if (!shown) return
    const hide = (): void => setShown(null)
    window.addEventListener('scroll', hide, true)
    return () => window.removeEventListener('scroll', hide, true)
  }, [shown])

  const hideTip = (): void => {
    clearTimeout(timer.current)
    setShown(null)
  }
  const showTip = (id: string, delay: number): void => {
    clearTimeout(timer.current)
    if (!tip) return
    timer.current = setTimeout(() => {
      const el = refs.current.get(id)
      if (!el) return
      const r = el.getBoundingClientRect()
      const pane = el.closest('[data-tree-pane]')?.getBoundingClientRect() ?? r
      const left = Math.min(pane.right + 8, window.innerWidth - TIP_WIDTH - 8)
      setShown({ id, top: Math.max(8, Math.min(r.top - 4, window.innerHeight - 200)), left })
    }, delay)
  }

  const move = (id: string | undefined): void => {
    if (!id) return
    setFocusId(id)
    const el = refs.current.get(id)
    el?.focus()
    el?.scrollIntoView({ block: 'nearest' })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    keyboard.current = true
    const id = tabStop
    if (!id) return
    const i = index.get(id) ?? 0
    const row = rows[i]
    const stop = (): void => {
      e.preventDefault()
      e.stopPropagation()
    }
    switch (e.key) {
      case 'Escape':
        if (shown) {
          stop()
          hideTip()
        }
        return
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
        return row.toggle ? row.toggle(e.altKey) : row.activate?.()
    }
    if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = e.timeStamp
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
  const tipRow = shown ? rows[index.get(shown.id) ?? -1] : undefined
  const tipContent = tipRow && tip ? tip(tipRow) : null

  return (
    <div
      role="tree"
      aria-label={label}
      onKeyDown={onKeyDown}
      onMouseDown={() => (keyboard.current = false)}
      onMouseLeave={hideTip}
      className="pb-2"
    >
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
            aria-describedby={shown?.id === r.id && tipContent ? TIP_ID : undefined}
            tabIndex={r.id === tabStop ? 0 : -1}
            onFocus={() => {
              setFocusId(r.id)
              if (keyboard.current) showTip(r.id, FOCUS_DELAY)
            }}
            onBlur={hideTip}
            onMouseEnter={() => showTip(r.id, HOVER_DELAY)}
            onClick={(e) => {
              setFocusId(r.id)
              hideTip()
              if (r.activate) r.activate()
              else r.toggle?.(e.altKey)
            }}
            style={{
              paddingLeft: 8 + (r.level - 1) * INDENT,
              ...(virtual ? { contentVisibility: 'auto', containIntrinsicSize: 'auto 32px' } : {})
            }}
            className={cn(
              'focus-visible:ring-ring/50 flex w-full cursor-default items-start gap-1 rounded-[8px] pr-2 text-left outline-none select-none focus-visible:ring-[3px]',
              r.heading ? 'mt-1 py-2 first:mt-0' : 'py-1',
              selected ? 'bg-accent text-primary' : 'hover:bg-secondary',
              r.dim && 'opacity-60'
            )}
          >
            <span className="flex h-5 w-4 shrink-0 items-center justify-center">
              {r.expanded !== undefined && (
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
      {shown &&
        tipContent &&
        createPortal(
          <div
            id={TIP_ID}
            role="tooltip"
            style={{ top: shown.top, left: shown.left, width: TIP_WIDTH }}
            className="pointer-events-none fixed z-50 rounded-xl border bg-white p-3 text-[13px] leading-5 shadow-[var(--shadow-menu)]"
          >
            {tipContent}
          </div>,
          document.body
        )}
    </div>
  )
}

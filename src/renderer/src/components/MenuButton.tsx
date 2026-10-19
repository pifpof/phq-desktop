import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Ellipsis } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MenuItem {
  label: string
  icon?: ReactNode
  disabled?: boolean
  onSelect: () => void
}

/** An icon button that opens a small menu (16px radius, per the design system). */
export function MenuButton({
  label,
  items,
  className
}: {
  label: string
  items: MenuItem[]
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      setOpen(false)
      ref.current?.querySelector<HTMLButtonElement>('[aria-haspopup]')?.focus()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const buttons = [
      ...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ??
        [])
    ]
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === 'ArrowDown' ? i + 1 : i - 1
    buttons[(next + buttons.length) % buttons.length]?.focus()
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="text-primary hover:bg-accent focus-visible:ring-ring/50 flex size-8 items-center justify-center rounded-[10px] outline-none focus-visible:ring-[3px]"
      >
        <Ellipsis className="size-4" strokeWidth={2} />
      </button>
      {open && (
        <div
          role="menu"
          onKeyDown={onKey}
          className="absolute top-9 right-0 z-30 w-56 rounded-2xl border bg-white p-1.5 text-sm shadow-[var(--shadow-menu)]"
        >
          {items.map((item, i) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              autoFocus={i === 0}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className="hover:bg-secondary focus-visible:bg-secondary [&_svg]:text-muted-foreground flex w-full items-center gap-2 rounded-[10px] px-3 py-1.5 text-left outline-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

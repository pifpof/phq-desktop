import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  id?: string
  value: string[]
  onChange: (next: string[]) => void
  max: number
  placeholder?: string
}

/** Type a name, press Enter or comma to add it. Backspace on an empty field removes the last tag. */
export function TagInput({ id, value, onChange, max, placeholder }: Props) {
  const [draft, setDraft] = useState('')
  const full = value.length >= max

  const add = (raw: string): void => {
    const tag = raw.replace(/,/g, ' ').trim()
    setDraft('')
    if (!tag || full || value.some((v) => v.toLowerCase() === tag.toLowerCase())) return
    onChange([...value, tag])
  }

  return (
    <div
      className={cn(
        'focus-within:border-primary-light focus-within:ring-ring/50 flex min-h-10 flex-wrap items-center gap-2 rounded-[10px] border bg-white px-2 py-1.5 transition-shadow focus-within:ring-[3px]'
      )}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="bg-accent text-primary inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-3 text-sm font-semibold"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => onChange(value.filter((v) => v !== tag))}
            className="hover:bg-primary-light/20 focus-visible:ring-ring/50 rounded-full p-1 outline-none focus-visible:ring-2"
          >
            <X className="size-3" strokeWidth={2} />
          </button>
        </span>
      ))}
      {!full && (
        <input
          id={id}
          value={draft}
          placeholder={value.length === 0 ? placeholder : undefined}
          onChange={(e) => {
            if (e.target.value.includes(',')) add(e.target.value)
            else setDraft(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add(draft)
            } else if (e.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
          onBlur={() => add(draft)}
          className="placeholder:text-muted-foreground min-w-32 flex-1 bg-transparent px-1 py-1 text-[15px] outline-none"
        />
      )}
    </div>
  )
}

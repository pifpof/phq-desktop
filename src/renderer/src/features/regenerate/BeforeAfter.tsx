import { useMemo, useState } from 'react'
import { diffLines } from '@shared/diff'
import { Markdown } from '@/components/Markdown'
import { cn } from '@/lib/utils'

/** Before and after for one or more pages (REQUIREMENTS-v3.1 5): side by side, or inline. */

export interface VersionPair {
  rel: string
  title: string
  before: string | null
  after: string
}

const body = (text: string): string =>
  text
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    .trim()
    .replace(/^#\s+.*\n+/, '')
    .trim()

function Inline({ before, after }: { before: string; after: string }) {
  const ops = useMemo(() => diffLines(before, after), [before, after])
  return (
    <div className="text-[14px] leading-6" aria-label="Changes, inline">
      {ops.map((o, i) =>
        o.type === 'same' ? (
          <p key={i} className="min-h-6 px-3 whitespace-pre-wrap">
            {o.text}
          </p>
        ) : o.type === 'add' ? (
          <p
            key={i}
            className="bg-accent border-primary min-h-6 border-l-2 px-3 whitespace-pre-wrap"
          >
            <span className="sr-only">Added: </span>
            {o.text}
          </p>
        ) : (
          <p
            key={i}
            className="bg-secondary text-muted-foreground border-destructive/50 min-h-6 border-l-2 px-3 whitespace-pre-wrap line-through"
          >
            <span className="sr-only">Removed: </span>
            {o.text}
          </p>
        )
      )}
    </div>
  )
}

export function BeforeAfter({ files }: { files: VersionPair[] }) {
  const [index, setIndex] = useState(0)
  const [mode, setMode] = useState<'side' | 'inline'>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 1100 ? 'side' : 'inline'
  )
  const f = files[Math.min(index, files.length - 1)]
  if (!f) return null
  const before = f.before === null ? '' : body(f.before)
  const after = body(f.after)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-6 py-2">
        {files.length > 1 && (
          <div role="tablist" aria-label="Pages" className="flex flex-wrap gap-1">
            {files.map((x, i) => (
              <button
                key={x.rel}
                type="button"
                role="tab"
                aria-selected={i === index}
                onClick={() => setIndex(i)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-[12px] font-medium',
                  i === index
                    ? 'border-primary-light bg-accent text-primary'
                    : 'text-muted-foreground hover:bg-secondary'
                )}
              >
                {x.title}
              </button>
            ))}
          </div>
        )}
        <div
          role="radiogroup"
          aria-label="View"
          className="bg-secondary ml-auto grid grid-cols-2 rounded-[10px] p-0.5 text-[13px]"
        >
          {(
            [
              ['side', 'Side by side'],
              ['inline', 'Changes only']
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'rounded-[8px] px-3 py-1 font-medium',
                mode === m ? 'text-primary bg-white shadow-sm' : 'text-muted-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {mode === 'side' ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 divide-x overflow-hidden">
          {(
            [
              ['Before', before],
              ['After', after]
            ] as const
          ).map(([label, text]) => (
            <div key={label} className="min-h-0 overflow-y-auto px-6 py-4">
              <p className="eyebrow mb-3 text-[12px]">{label}</p>
              {text ? (
                <div className={cn('text-[14px]', label === 'Before' && 'text-muted-foreground')}>
                  <Markdown>{text}</Markdown>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">A new page.</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto py-4">
          <Inline before={before} after={after} />
        </div>
      )}
    </div>
  )
}

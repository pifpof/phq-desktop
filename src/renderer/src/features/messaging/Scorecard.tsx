import type { Score } from '@shared/scorecard'
import { cn } from '@/lib/utils'

/** Five score tiles: dimension, score as a serif numeral, a five-dot meter, and the evidence. */
export function Scorecard({ scores }: { scores: Score[] }) {
  return (
    <div
      className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3"
      role="list"
      aria-label="Scorecard"
    >
      {scores.map((s) => (
        <div key={s.dimension} role="listitem" className="rounded-xl border bg-white p-4">
          <p className="text-muted-foreground text-[12px] font-semibold tracking-[0.12em] uppercase">
            {s.dimension}
          </p>
          <p className="mt-2 flex items-baseline gap-1" aria-label={`${s.score} out of 5`}>
            <span className="text-primary font-serif text-[34px] leading-none font-bold">
              {s.score}
            </span>
            <span className="text-muted-foreground text-sm">/5</span>
          </p>
          <div className="mt-2 flex gap-1" aria-hidden>
            {[1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                className={cn('size-2 rounded-full', n <= s.score ? 'bg-primary' : 'bg-border')}
              />
            ))}
          </div>
          <p className="text-muted-foreground mt-3 text-[13px] leading-snug">{s.evidence}</p>
        </div>
      ))}
    </div>
  )
}

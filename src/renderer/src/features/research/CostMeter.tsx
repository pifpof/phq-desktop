import { money } from '@/lib/research'

export function CostMeter({ spent, cap }: { spent: number; cap: number }) {
  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span>
          <span className="font-semibold tabular-nums">{money(spent)}</span>
          <span className="text-muted-foreground"> of {money(cap)} budget</span>
        </span>
        <span className="text-muted-foreground text-[13px]">Approximate</span>
      </div>
      <div
        className="bg-secondary mt-2 h-2 overflow-hidden rounded-full"
        role="meter"
        aria-label="Research spend"
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={spent}
      >
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

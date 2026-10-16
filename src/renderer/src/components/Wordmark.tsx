import { cn } from '@/lib/utils'

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-serif text-lg font-bold tracking-[-0.01em]', className)}>
      PositioningHQ
    </span>
  )
}

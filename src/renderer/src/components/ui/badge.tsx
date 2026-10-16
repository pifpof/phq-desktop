import * as React from 'react'
import { cn } from '@/lib/utils'

function Badge({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="badge"
      className={cn(
        'border-primary-light bg-accent text-primary inline-flex items-center rounded-full border px-2.5 py-0.5 text-[13px] leading-5 font-semibold whitespace-nowrap',
        className
      )}
      {...props}
    />
  )
}

export { Badge }

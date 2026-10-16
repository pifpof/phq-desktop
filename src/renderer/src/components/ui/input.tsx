import * as React from 'react'
import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'border-input placeholder:text-muted-foreground h-10 w-full min-w-0 rounded-[10px] border bg-white px-3 text-[15px] transition-[border-color,box-shadow] outline-none',
        'focus-visible:border-primary-light focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}

export { Input }

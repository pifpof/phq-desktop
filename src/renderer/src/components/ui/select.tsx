import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const Select = SelectPrimitive.Root

function SelectTrigger({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        'border-input data-[placeholder]:text-muted-foreground flex h-10 w-full items-center justify-between gap-2 rounded-[10px] border bg-white px-3 text-left text-[15px] outline-none',
        'focus-visible:border-primary-light focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      <span className="truncate">
        <SelectPrimitive.Value />
      </span>
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="text-muted-foreground size-4 shrink-0" strokeWidth={1.8} />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={6}
        className={cn(
          'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=open]:fade-in-0 z-[60] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-2xl border shadow-[var(--shadow-menu)]',
          className
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1.5">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'data-[highlighted]:bg-secondary relative flex w-full cursor-pointer items-center rounded-[10px] py-2 pr-8 pl-3 text-[15px] outline-none select-none',
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-3">
        <Check className="text-primary size-4" strokeWidth={1.8} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

export { Select, SelectContent, SelectItem, SelectTrigger }

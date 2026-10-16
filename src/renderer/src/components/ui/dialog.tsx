import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogClose = DialogPrimitive.Close

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-[#17181c]/30" />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'bg-popover data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-48px)] w-[calc(100%-48px)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border p-6 shadow-[var(--shadow-menu)] outline-none',
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className="text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-ring/50 absolute top-4 right-4 rounded-[10px] p-1.5 outline-none focus-visible:ring-[3px]"
        >
          <X className="size-4" strokeWidth={1.8} />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('font-serif text-[22px] leading-tight font-bold tracking-[-0.01em]', className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle }

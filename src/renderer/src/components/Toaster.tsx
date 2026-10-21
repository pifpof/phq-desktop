import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToasts } from '@/store/toasts'

/** Toasts, bottom right, announced politely. */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div
      className="pointer-events-none fixed right-5 bottom-5 z-50 flex w-[360px] max-w-[calc(100vw-40px)] flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="bg-background pointer-events-auto flex items-center gap-3 rounded-xl border py-3 pr-2 pl-4 shadow-lg"
        >
          <p className="min-w-0 flex-1 text-sm">{t.text}</p>
          {t.action && (
            <Button
              size="sm"
              onClick={() => {
                useToasts.getState().dismiss(t.id)
                t.action!.run()
              }}
            >
              {t.action.label}
            </Button>
          )}
          <button
            type="button"
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 rounded-md p-1 outline-none focus-visible:ring-[3px]"
            onClick={() => useToasts.getState().dismiss(t.id)}
          >
            <X className="size-4" strokeWidth={1.8} />
          </button>
        </div>
      ))}
    </div>
  )
}

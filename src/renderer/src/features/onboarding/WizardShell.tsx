import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WIZARD_TOTAL } from './steps'
import { DragRegion } from '@/components/DragRegion'

interface Props {
  /** Step number during first-run setup. Null hides the indicator. */
  step?: number | null
  onBack?: () => void
  children: ReactNode
}

export function WizardShell({ step, onBack, children }: Props) {
  return (
    <div className="bg-muted relative flex h-full items-center justify-center overflow-y-auto p-6">
      <DragRegion />
      <div className="my-auto w-full max-w-[560px] rounded-2xl border bg-white p-10 shadow-[var(--shadow-header)]">
        {(onBack || step) && (
          <div className="mb-6 flex h-8 items-center justify-between">
            {onBack ? (
              <Button variant="ghost" size="sm" className="-ml-3" onClick={onBack}>
                <ArrowLeft strokeWidth={1.8} />
                Back
              </Button>
            ) : (
              <span />
            )}
            {step ? (
              <span className="text-muted-foreground text-[13px]">
                Step {step} of {WIZARD_TOTAL}
              </span>
            ) : null}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="bg-accent text-foreground mb-5 rounded-[10px] px-4 py-3 text-sm" role="status">
      {children}
    </p>
  )
}

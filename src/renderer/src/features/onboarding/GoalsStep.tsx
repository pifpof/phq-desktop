import { useState } from 'react'
import { Check } from 'lucide-react'
import { GOALS } from '@shared/profile'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { stepNumber } from './steps'
import { WizardShell } from './WizardShell'

export function GoalsStep() {
  const [goals, setGoals] = useState<string[]>(useApp.getState().profile?.goals ?? [])

  const toggle = (id: string): void =>
    setGoals((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]))

  return (
    <WizardShell step={stepNumber('goals')} onBack={() => useApp.getState().go('about')}>
      <h2>What do you want to get done?</h2>
      <p className="lede mt-3">Choose everything that applies.</p>
      <div role="group" aria-label="Goals" className="mt-6 space-y-3">
        {GOALS.map((g) => {
          const on = goals.includes(g.id)
          return (
            <button
              key={g.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(g.id)}
              className={cn(
                'focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-xl border bg-white px-4 py-3.5 text-left transition-colors outline-none focus-visible:ring-[3px]',
                on ? 'border-primary-light bg-accent border-[1.5px]' : 'hover:bg-muted'
              )}
            >
              <span
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-md border',
                  on ? 'border-primary bg-primary text-primary-foreground' : 'bg-white'
                )}
              >
                {on && <Check className="size-3.5" strokeWidth={2.4} />}
              </span>
              <span className="font-semibold">{g.label}</span>
            </button>
          )
        })}
      </div>
      <Button
        className="mt-8 w-full"
        disabled={goals.length === 0}
        onClick={() =>
          void useApp.getState().advance((p) => ({ ...p, goals: goals as typeof p.goals }), 'loop')
        }
      >
        Continue
      </Button>
    </WizardShell>
  )
}

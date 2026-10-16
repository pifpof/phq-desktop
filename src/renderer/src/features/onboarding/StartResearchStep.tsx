import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { DEFAULT_BUDGET_USD } from '@shared/research'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumberedStep } from '@/components/NumberedStep'
import { ApiError } from '@/lib/api'
import { money, range } from '@/lib/research'
import { useApp } from '@/store/app'
import { useResearch } from '@/store/research'
import { Field } from './Field'
import { stepNumber } from './steps'
import { Note, WizardShell } from './WizardShell'

const formatDate = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function StartResearchStep() {
  const flow = useApp((s) => s.flow)
  const website = useApp((s) => s.profile?.company.website ?? '')
  const vault = useApp((s) => s.detection?.kind === 'skillpack-vault')
  const { estimate, estimateError, loadEstimate } = useResearch()
  const [budget, setBudget] = useState(String(DEFAULT_BUDGET_USD))
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadEstimate()
  }, [loadEstimate])

  const budgetUsd = Number(budget)
  const budgetValid = Number.isFinite(budgetUsd) && budgetUsd >= 1 && budgetUsd <= 1000

  const finishOnboarding = (): Promise<void> =>
    useApp.getState().saveProfile((p) => ({ ...p, onboarding: { step: 'start', complete: true } }))

  const start = async (): Promise<void> => {
    if (!budgetValid || starting) return
    setStarting(true)
    setError(null)
    try {
      await finishOnboarding()
      await useResearch.getState().start({ budgetCapUsd: budgetUsd })
      await useApp.getState().goHome()
      useApp.getState().go('progress')
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not start research. Please try again.'
      )
    } finally {
      setStarting(false)
    }
  }

  const notNow = async (): Promise<void> => {
    await finishOnboarding()
    await useApp.getState().goHome()
  }

  const back =
    flow === 'wizard' ? () => useApp.getState().go('files') : () => void useApp.getState().goHome()

  return (
    <WizardShell step={flow === 'wizard' ? stepNumber('start') : null} onBack={back}>
      <h2>Build your positioning</h2>
      <p className="lede mt-3">
        PositioningHQ will research your company and write your first playbook.
      </p>

      {vault && (
        <div className="mt-5">
          <Note>
            Your vault already has research. Run it again for a fresh playbook, or use what is
            there.
          </Note>
        </div>
      )}

      <ol className="mt-6 space-y-5">
        <NumberedStep n={1} title="Read your website">
          Up to 30 pages of {website.replace(/^https?:\/\//, '') || 'your site'}.
        </NumberedStep>
        <NumberedStep n={2} title="Find your social profiles">
          Taglines and bios from LinkedIn, X and others.
        </NumberedStep>
        <NumberedStep n={3} title="Research your market and competitors">
          Your product, your customers and the alternatives buyers consider.
        </NumberedStep>
        <NumberedStep n={4} title="Write your playbook and messaging analysis">
          A seven-section positioning playbook, then a critical review of your current messaging.
        </NumberedStep>
      </ol>

      <div className="bg-muted mt-7 rounded-xl border p-5">
        {estimate ? (
          <div className="space-y-1.5 text-sm">
            <p>
              <span className="font-semibold">Estimated cost:</span> about{' '}
              {range(estimate.costUsd.low, estimate.costUsd.high, money)} on your Anthropic account.
            </p>
            <p>
              <span className="font-semibold">Estimated time:</span>{' '}
              {range(estimate.minutes.low, estimate.minutes.high, (n) => `${n}`)} minutes.
            </p>
            <p className="text-muted-foreground text-[13px]">
              Approximate, based on Anthropic prices on {formatDate(estimate.pricingUpdated)}
              {estimate.modelKnown
                ? ''
                : '. Your model is not in our price list, so this is a rough guess'}
              .
            </p>
            {estimate.webSearch === false && (
              <p className="text-[13px]">
                Web search is not available on your Anthropic account, so web research will be
                skipped. You will still get a playbook from your website and files.
              </p>
            )}
          </div>
        ) : estimateError ? (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{estimateError}</span>
            <Button variant="outline" size="sm" onClick={() => void loadEstimate()}>
              Try again
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground flex items-center gap-2 text-sm" role="status">
            <Loader2 className="size-4 animate-spin" strokeWidth={1.8} />
            Working out the cost...
          </p>
        )}

        <div className="mt-5 max-w-[220px]">
          <Field
            id="budget"
            label="Budget cap"
            required
            error={budgetValid ? null : 'Enter an amount between $1 and $1,000.'}
            helper="Research pauses and asks before going over this."
          >
            <div className="relative">
              <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
                $
              </span>
              <Input
                id="budget"
                inputMode="decimal"
                value={budget}
                onChange={(e) => setBudget(e.target.value.replace(/[^0-9.]/g, ''))}
                className="pl-7"
              />
            </div>
          </Field>
        </div>
      </div>

      {error && (
        <p className="text-destructive mt-4 text-sm" role="alert">
          {error}
        </p>
      )}

      <div className="mt-8 flex gap-3">
        <Button
          className="flex-1"
          autoFocus
          disabled={!budgetValid || starting}
          onClick={() => void start()}
        >
          {starting ? 'Starting...' : 'Start research'}
        </Button>
        <Button className="flex-1" variant="outline" onClick={() => void notNow()}>
          {vault ? 'Use what is there' : 'Not now'}
        </Button>
      </div>
    </WizardShell>
  )
}

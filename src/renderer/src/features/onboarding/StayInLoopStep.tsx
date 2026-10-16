import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { isEmail } from '@shared/url'
import { links, signupUrl } from '@shared/links'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { openExternal } from '@/lib/api'
import { useApp } from '@/store/app'
import { Field } from './Field'
import { stepNumber } from './steps'
import { WizardShell } from './WizardShell'

/** Nothing is sent from the app. The browser form does the sending. */
export function StayInLoopStep() {
  const [email, setEmail] = useState('')
  const [clicked, setClicked] = useState(useApp.getState().profile?.updates.clicked ?? false)
  const emailError =
    email.trim() !== '' && !isEmail(email) ? "That doesn't look like an email address." : null

  const click = (url: string): void => {
    openExternal(url)
    setClicked(true)
  }

  const next = (): void =>
    void useApp.getState().advance((p) => ({ ...p, updates: { prompted: true, clicked } }), 'files')

  return (
    <WizardShell step={stepNumber('loop')} onBack={() => useApp.getState().go('goals')}>
      <h2>Stay in the loop</h2>
      <p className="lede mt-3">
        Get product updates and join other founders working on their positioning. Optional.
      </p>
      <div className="mt-6">
        <Field
          id="updates-email"
          label="Email"
          error={emailError}
          helper="Only used to fill in the sign-up form in your browser."
        >
          <Input
            id="updates-email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          disabled={emailError !== null}
          onClick={() => click(signupUrl(isEmail(email) ? email : ''))}
        >
          Get updates
          <ExternalLink strokeWidth={1.8} />
        </Button>
        <Button variant="outline" onClick={() => click(links.communityUrl)}>
          Join the community
          <ExternalLink strokeWidth={1.8} />
        </Button>
      </div>
      <Button variant={clicked ? 'default' : 'outline'} className="mt-3 w-full" onClick={next}>
        {clicked ? 'Continue' : 'Skip'}
      </Button>
    </WizardShell>
  )
}

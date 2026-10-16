import { Button } from '@/components/ui/button'
import { Wordmark } from '@/components/Wordmark'
import { openExternal } from '@/lib/api'
import { useApp } from '@/store/app'
import { WizardShell } from './WizardShell'

export function Welcome() {
  return (
    <WizardShell>
      <Wordmark className="text-[22px]" />
      <h1 className="mt-8">Positioning your whole company can use.</h1>
      <p className="lede mt-5">
        Build your positioning and competitive intelligence with an AI guide. Free and open source.
        Your work stays on this computer.
      </p>
      <Button
        size="lg"
        className="mt-9 w-full"
        autoFocus
        onClick={() => useApp.getState().go('connect')}
      >
        Get started
      </Button>
      <p className="text-muted-foreground mt-6 text-center text-[13px]">
        Made by{' '}
        <button
          type="button"
          className="text-primary hover:text-primary-hover underline underline-offset-2"
          onClick={() => openExternal('https://parallel79.com')}
        >
          Parallel79°
        </button>
      </p>
    </WizardShell>
  )
}

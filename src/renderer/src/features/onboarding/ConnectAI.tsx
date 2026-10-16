import { useState } from 'react'
import { Eye, EyeOff, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NumberedStep } from '@/components/NumberedStep'
import { links } from '@shared/links'
import { openExternal } from '@/lib/api'
import { useApp } from '@/store/app'
import { stepNumber } from './steps'
import { Note, WizardShell } from './WizardShell'

function ProviderCard({ name, disabled }: { name: string; disabled?: boolean }) {
  return (
    <div
      aria-disabled={disabled}
      className={
        disabled
          ? 'flex flex-col items-start gap-1.5 rounded-xl border bg-white px-4 py-3 opacity-70'
          : 'border-primary-light bg-accent flex flex-col items-start gap-1.5 rounded-xl border-[1.5px] px-4 py-3'
      }
    >
      <span className="text-sm font-semibold">{name}</span>
      {disabled && <Badge>Coming soon</Badge>}
    </div>
  )
}

export function ConnectAI() {
  const { flow, note, pendingKey } = useApp()
  const [key, setKey] = useState(pendingKey)
  const [show, setShow] = useState(false)
  const trimmed = key.trim()
  const looksWrong = trimmed.length > 0 && !trimmed.startsWith('sk-ant-')

  const submit = (): void => {
    if (!trimmed) return
    useApp.getState().setPendingKey(trimmed)
    useApp.getState().go('verify')
  }

  const back =
    flow === 'replaceKey'
      ? () => void useApp.getState().endFlow()
      : () => useApp.getState().go('welcome')

  return (
    <WizardShell step={flow === 'wizard' ? stepNumber('connect') : null} onBack={back}>
      {note && <Note>{note}</Note>}
      <h2>Connect your AI</h2>
      <p className="lede mt-3">
        PositioningHQ uses your own AI account. You pay the provider directly for what you use, and
        your key is stored encrypted on this computer. It is never sent anywhere except to the
        provider.
      </p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <ProviderCard name="Claude (Anthropic)" />
        <ProviderCard name="OpenAI" disabled />
        <ProviderCard name="Gemini" disabled />
      </div>

      <div className="mt-6 rounded-xl border p-6">
        <p className="eyebrow">How to get a key</p>
        <ol className="mt-5 space-y-5">
          <NumberedStep n={1} title="Open the Anthropic Console">
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => openExternal(links.anthropicConsole)}
            >
              Open the Console
              <ExternalLink strokeWidth={1.8} />
            </Button>
          </NumberedStep>
          <NumberedStep n={2} title="Add credits under Billing">
            Pay-as-you-go. A few dollars is plenty to start.
          </NumberedStep>
          <NumberedStep n={3} title="Create an API key">
            Copy it and paste it below.
          </NumberedStep>
        </ol>
      </div>

      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Label htmlFor="api-key">API key</Label>
        <div className="relative mt-2">
          <Input
            id="api-key"
            autoFocus
            type={show ? 'text' : 'password'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-ant-..."
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Hide key' : 'Show key'}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute top-1 right-1 flex size-8 items-center justify-center rounded-lg outline-none focus-visible:ring-[3px]"
          >
            {show ? (
              <EyeOff className="size-4" strokeWidth={1.8} />
            ) : (
              <Eye className="size-4" strokeWidth={1.8} />
            )}
          </button>
        </div>
        {looksWrong && (
          <p className="text-destructive mt-2 text-[13px]" role="alert">
            This doesn&apos;t look like an Anthropic key.
          </p>
        )}
        <Button type="submit" className="mt-5 w-full" disabled={!trimmed}>
          Verify key
        </Button>
      </form>
    </WizardShell>
  )
}

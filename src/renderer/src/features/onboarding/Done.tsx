import { Button } from '@/components/ui/button'
import { useApp } from '@/store/app'
import { WizardShell } from './WizardShell'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 py-3">
      <dt className="text-muted-foreground w-24 shrink-0 text-sm">{label}</dt>
      <dd className="min-w-0 text-sm font-semibold break-all">{value}</dd>
    </div>
  )
}

export function Done() {
  const s = useApp((st) => st.state)
  return (
    <WizardShell step={4} onBack={() => useApp.getState().go('workspace')}>
      <h2>You&apos;re set up.</h2>
      <dl className="mt-6 divide-y rounded-xl border px-5">
        <Row label="Provider" value="Claude (Anthropic)" />
        <Row label="Model" value={s?.modelName ?? s?.model ?? ''} />
        <Row label="Workspace" value={s?.workspacePath ?? ''} />
      </dl>
      <Button className="mt-8 w-full" autoFocus onClick={() => void useApp.getState().endFlow()}>
        Start a chat
      </Button>
    </WizardShell>
  )
}

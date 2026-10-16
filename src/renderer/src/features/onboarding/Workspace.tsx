import { useEffect, useState } from 'react'
import { Folder, FolderOpen } from 'lucide-react'
import type { Detection } from '@shared/workspace'
import { Button } from '@/components/ui/button'
import { api, ApiError, unwrap } from '@/lib/api'
import { useApp } from '@/store/app'
import { stepNumber } from './steps'
import { Note, WizardShell } from './WizardShell'

interface Choice {
  kind: 'default' | 'custom'
  path: string
  existing: boolean
  detection: Detection
}

function Option({
  selected,
  icon,
  title,
  detail,
  onClick
}: {
  selected: boolean
  icon: React.ReactNode
  title: string
  detail?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`focus-visible:ring-ring/50 flex w-full items-start gap-3 rounded-xl border bg-white p-4 text-left transition-colors outline-none focus-visible:ring-[3px] ${selected ? 'border-primary-light bg-accent border-[1.5px]' : 'hover:bg-muted'}`}
    >
      <span className="text-primary-light mt-0.5">{icon}</span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        {detail && <span className="text-muted-foreground block text-sm break-all">{detail}</span>}
      </span>
    </button>
  )
}

export function Workspace() {
  const { flow, note } = useApp()
  const defaultPath = useApp((s) => s.state?.defaultWorkspacePath ?? '')
  const [choice, setChoice] = useState<Choice | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [acknowledged, setAcknowledged] = useState(false)

  const select = async (
    kind: Choice['kind'],
    r: { path: string; existing: boolean }
  ): Promise<Choice> => {
    const detection = await unwrap(api.detectWorkspace(r.path))
    return { kind, ...r, detection }
  }

  const pickDefault = async (): Promise<void> => {
    try {
      const next = await select('default', await unwrap(api.useDefaultFolder()))
      setError(null)
      setAcknowledged(false)
      setChoice(next)
    } catch (err) {
      setChoice(null)
      setError(err instanceof ApiError ? err.message : null)
    }
  }

  // The default folder is pre-selected (and created if missing).
  useEffect(() => {
    let cancelled = false
    unwrap(api.useDefaultFolder())
      .then(async (r) => {
        const next = await select('default', r)
        if (!cancelled) setChoice((c) => c ?? next)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const choose = async (): Promise<void> => {
    setError(null)
    try {
      const r = await unwrap(api.chooseFolder())
      if (!r) return
      const next = await select('custom', r)
      setAcknowledged(false)
      setChoice(next)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : null)
    }
  }

  const confirm = async (): Promise<void> => {
    if (!choice || busy) return
    setBusy(true)
    setError(null)
    try {
      await unwrap(api.confirmWorkspace(choice.path))
      useApp.getState().setDetection(choice.detection)
      await useApp.getState().refresh()
      await useApp.getState().beginOnboarding(choice.detection)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : null)
    } finally {
      setBusy(false)
    }
  }

  const kind = choice?.detection.kind
  const needsAck = kind === 'non-empty' && !acknowledged

  // The key is already saved by now, so Back from the wizard goes to Connect, not Verify.
  const back =
    flow === 'wizard'
      ? () => useApp.getState().go('connect')
      : () => void useApp.getState().endFlow()

  return (
    <WizardShell step={flow === 'wizard' ? stepNumber('workspace') : null} onBack={back}>
      {note && <Note>{note}</Note>}
      <h2>Choose where your work lives</h2>
      <p className="lede mt-3">
        PositioningHQ saves everything as plain files in a folder you choose. Open them in Obsidian,
        put them in GitHub, or back them up however you like.
      </p>

      <div role="radiogroup" aria-label="Workspace folder" className="mt-6 space-y-3">
        <Option
          selected={choice?.kind === 'default'}
          icon={<Folder className="size-5" strokeWidth={1.8} />}
          title="Use the default"
          detail={defaultPath}
          onClick={() => void pickDefault()}
        />
        <Option
          selected={choice?.kind === 'custom'}
          icon={<FolderOpen className="size-5" strokeWidth={1.8} />}
          title="Choose a folder..."
          detail={choice?.kind === 'custom' ? choice.path : undefined}
          onClick={() => void choose()}
        />
      </div>

      {(kind === 'phq-complete' || kind === 'phq-incomplete') && (
        <p className="text-primary mt-4 text-sm font-semibold" role="status">
          Found an existing PositioningHQ workspace.
        </p>
      )}
      {kind === 'skillpack-vault' && (
        <p className="text-primary mt-4 text-sm font-semibold" role="status">
          Found a PositioningHQ vault
          {choice?.detection.company?.name ? ` for ${choice.detection.company.name}` : ''}.
          We&apos;ll keep your existing files.
        </p>
      )}
      {needsAck && (
        <p className="bg-secondary mt-4 rounded-[10px] px-4 py-3 text-sm" role="alert">
          This folder already has files in it. PositioningHQ will add its own folders alongside
          them.
        </p>
      )}
      {error && (
        <p className="text-destructive mt-4 text-sm" role="alert">
          {error}
        </p>
      )}

      {needsAck ? (
        <div className="mt-8 flex gap-3">
          <Button className="flex-1" onClick={() => setAcknowledged(true)}>
            Use it anyway
          </Button>
          <Button className="flex-1" variant="outline" onClick={() => void choose()}>
            Choose another folder
          </Button>
        </div>
      ) : (
        <Button className="mt-8 w-full" disabled={!choice || busy} onClick={() => void confirm()}>
          Continue
        </Button>
      )}
    </WizardShell>
  )
}

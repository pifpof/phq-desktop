import { useEffect, useState } from 'react'
import { Folder, FolderOpen, Library } from 'lucide-react'
import type { Detection } from '@shared/workspace'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, ApiError, unwrap } from '@/lib/api'
import { useApp } from '@/store/app'
import { stepNumber } from './steps'
import { Note, WizardShell } from './WizardShell'

interface Choice {
  kind: 'default' | 'custom' | 'hub'
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
  const [hub, setHub] = useState<{ topicsPath: string } | null>(null)
  const [hubName, setHubName] = useState('')
  const [register, setRegister] = useState(false)

  // The hub option shows only when an llm-wiki hub is set up and readable (REQUIREMENTS-v2 2.3).
  useEffect(() => {
    let cancelled = false
    unwrap(api.getHub())
      .then((h) => {
        if (!cancelled) setHub(h)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const hubSlug = hubName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const pickHub = async (): Promise<void> => {
    setError(null)
    if (!hubSlug) {
      setChoice((c) => (c?.kind === 'hub' ? null : c))
      setError('Type a folder name for the hub, for example your company name.')
      return
    }
    try {
      const next = await select('hub', await unwrap(api.useHubFolder(hubSlug)))
      setAcknowledged(false)
      setChoice(next)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : null)
    }
  }

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
      // Writing to the hub only with explicit consent (REQUIREMENTS-v2 7.3).
      if (choice.kind === 'hub' && register) await unwrap(api.registerInHub())
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
  const convertible = kind === 'v1-workspace' || kind === 'skillpack-vault'
  const blocked = convertible || kind === 'phq-older' || kind === 'other-wiki'

  const convert = async (): Promise<void> => {
    if (!choice || busy) return
    setBusy(true)
    setError(null)
    try {
      await unwrap(api.selectForMigration(choice.path))
      useApp.getState().setDetection(choice.detection)
      // Home shows the conversion until it is done.
      await useApp.getState().goHome()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : null)
    } finally {
      setBusy(false)
    }
  }

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
        {hub && (
          <div
            className={`rounded-xl border bg-white p-4 ${choice?.kind === 'hub' ? 'border-primary-light bg-accent border-[1.5px]' : ''}`}
          >
            <button
              type="button"
              role="radio"
              aria-checked={choice?.kind === 'hub'}
              onClick={() => void pickHub()}
              className="focus-visible:ring-ring/50 flex w-full items-start gap-3 rounded-lg text-left outline-none focus-visible:ring-[3px]"
            >
              <span className="text-primary-light mt-0.5">
                <Library className="size-5" strokeWidth={1.8} />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">Create inside my llm-wiki hub</span>
                <span className="text-muted-foreground block text-sm break-all">
                  {hub.topicsPath}/{hubSlug || 'your-company'}
                </span>
              </span>
            </button>
            <div className="mt-3 space-y-3 pl-8">
              <Input
                aria-label="Folder name in the hub"
                placeholder="Folder name, for example acme"
                value={hubName}
                maxLength={80}
                onChange={(e) => setHubName(e.target.value)}
                onBlur={() => {
                  if (choice?.kind === 'hub' && hubSlug) void pickHub()
                }}
              />
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary mt-0.5 size-4"
                  checked={register}
                  onChange={(e) => setRegister(e.target.checked)}
                />
                <span>
                  Add it to my hub&apos;s list of wikis, so llm-wiki commands like /wiki:query can
                  find it. This adds one entry to wikis.json and one line to the hub log.
                </span>
              </label>
            </div>
          </div>
        )}
      </div>

      {(kind === 'phq-complete' || kind === 'phq-incomplete') && (
        <p className="text-primary mt-4 text-sm font-semibold" role="status">
          Found an existing PositioningHQ workspace.
        </p>
      )}
      {kind === 'phq-newer' && (
        <p className="bg-secondary mt-4 rounded-[10px] px-4 py-3 text-sm" role="status">
          This wiki was made by a newer version of PositioningHQ. You can read it here, but update
          the app to edit it.
        </p>
      )}
      {(kind === 'v1-workspace' || kind === 'skillpack-vault' || kind === 'phq-older') && (
        <p className="bg-secondary mt-4 rounded-[10px] px-4 py-3 text-sm" role="alert">
          This workspace uses the old PositioningHQ format
          {choice?.detection.company?.name ? ` (${choice.detection.company.name})` : ''}. Convert it
          to the new wiki format to keep working with it. A full backup is made first.
        </p>
      )}
      {kind === 'other-wiki' && (
        <p className="bg-secondary mt-4 rounded-[10px] px-4 py-3 text-sm" role="alert">
          This is an llm-wiki about something else. Choose an empty folder or a PositioningHQ wiki.
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
      ) : convertible ? (
        <Button className="mt-8 w-full" disabled={busy} onClick={() => void convert()}>
          Convert this workspace
        </Button>
      ) : (
        <Button
          className="mt-8 w-full"
          disabled={!choice || busy || blocked}
          onClick={() => void confirm()}
        >
          Continue
        </Button>
      )}
    </WizardShell>
  )
}

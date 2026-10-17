import { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import type { Res } from '@shared/ipc-contract'
import { Button } from '@/components/ui/button'
import { api, ApiError, unwrap } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'

type Result = Res<'migrate:start'>
type Phase = 'choose' | 'running' | 'result' | 'failed' | 'done'

/** Converting a v1 workspace to the wiki format (REQUIREMENTS-v2 6.1). */
export function MigrationWizard() {
  const [phase, setPhase] = useState<Phase>('choose')
  const [mode, setMode] = useState<'convert' | 'rebuild'>('convert')
  const [steps, setSteps] = useState<string[]>([])
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => api.onMigrateStep((s) => setSteps((x) => [...x, s])), [])

  const start = async (): Promise<void> => {
    setPhase('running')
    setSteps(['Backing up the workspace'])
    try {
      setResult(await unwrap(api.startMigration(mode)))
      setPhase('result')
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'unknown'
      )
      setPhase('failed')
    }
  }

  const finish = async (how: 'remove' | 'move'): Promise<void> => {
    setBusy(true)
    try {
      await unwrap(api.finishMigration(how))
      await useApp.getState().refresh()
      setPhase('done')
      if (mode === 'rebuild') useApp.getState().startFlow('research')
      else await useApp.getState().goHome('playbook')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not finish. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const format = result
    ? result.check.findings.filter(
        (f) =>
          f.severity === 'critical' ||
          (f.severity === 'warning' && f.check !== 'C14' && f.check !== 'C12')
      ).length
    : 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[620px] px-6 py-12">
        <h2 className="text-[26px]">Convert to the new wiki format</h2>
        {phase === 'choose' && (
          <>
            <p className="lede mt-3">
              This workspace uses the old PositioningHQ format. Convert it to the new wiki format?
            </p>
            <ul className="text-muted-foreground mt-4 list-disc space-y-1 pl-5 text-sm">
              <li>Your research becomes small articles in wiki/, each citing its sources.</li>
              <li>Your files, website pages and cited web pages become sources in raw/.</li>
              <li>Playbook versions and the messaging analysis move to output/.</li>
              <li>
                Any AI tool can then read the folder (llm-wiki format). A full backup is made first.
              </li>
            </ul>
            <div role="radiogroup" className="mt-6 space-y-3">
              {(
                [
                  [
                    'convert',
                    'Convert (free, recommended)',
                    'Keeps everything you have. No AI cost unless a playbook section needs splitting.'
                  ],
                  [
                    'rebuild',
                    'Rebuild with new research',
                    'Keeps your profile and files, then runs the full research again. Costs as much as a full run.'
                  ]
                ] as const
              ).map(([m, title, detail]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={cn(
                    'w-full rounded-xl border bg-white p-4 text-left',
                    mode === m ? 'border-primary-light bg-accent border-[1.5px]' : 'hover:bg-muted'
                  )}
                >
                  <span className="block font-semibold">{title}</span>
                  <span className="text-muted-foreground block text-sm">{detail}</span>
                </button>
              ))}
            </div>
            <Button className="mt-8 w-full" onClick={() => void start()}>
              Back up and convert
            </Button>
          </>
        )}

        {(phase === 'running' || phase === 'result') && (
          <ul className="mt-6 space-y-2 text-sm">
            {steps.map((s, i) => (
              <li key={`${s}-${i}`} className="flex items-center gap-2">
                {phase === 'running' && i === steps.length - 1 ? (
                  <Loader2 className="text-primary size-4 animate-spin" strokeWidth={2} />
                ) : (
                  <Check className="text-primary size-4" strokeWidth={2} />
                )}
                {s}
              </li>
            ))}
          </ul>
        )}

        {phase === 'result' && result && (
          <div className="mt-8 rounded-xl border bg-white p-5">
            <p className="font-semibold">
              Conversion complete and checked.
              {format === 0
                ? ' The wiki follows the format.'
                : ` ${format} problem${format === 1 ? '' : 's'} found.`}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              {result.articles} articles written. {result.carried} v1 files carried over
              {result.notCarried
                ? `, ${result.notCarried} not needed any more (listed in the report)`
                : ''}
              .
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void api.revealPath(result.reportPath)}
              >
                Show the conversion report
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void api.revealPath(result.backup)}
              >
                Show backup
              </Button>
            </div>
            {result.legacy.length > 0 && (
              <>
                <p className="mt-5 text-sm">
                  Remove the old {result.legacy.filter((l) => !l.startsWith('.')).join(', ')}{' '}
                  folders? Your backup stays in <span className="break-all">{result.backup}</span>.
                </p>
                <div className="mt-3 flex gap-3">
                  <Button disabled={busy} onClick={() => void finish('remove')}>
                    Remove them
                  </Button>
                  <Button variant="outline" disabled={busy} onClick={() => void finish('move')}>
                    Keep them, out of the way
                  </Button>
                </div>
              </>
            )}
            {result.legacy.length === 0 && (
              <Button className="mt-5" disabled={busy} onClick={() => void finish('move')}>
                Continue
              </Button>
            )}
          </div>
        )}

        {phase === 'failed' && (
          <div className="border-destructive/30 mt-8 rounded-xl border bg-white p-5" role="alert">
            <p className="text-destructive font-semibold">The conversion did not finish.</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Your workspace was restored from the backup, exactly as it was. {error}
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void start()}>
                Try again
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await api.copyMigrationDetails(error)
                  setCopied(true)
                }}
              >
                {copied ? 'Copied' : 'Send details'}
              </Button>
            </div>
            {copied && (
              <p className="text-muted-foreground mt-2 text-[13px]">
                A short report is on your clipboard, with no file content. Paste it into an email or
                issue.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

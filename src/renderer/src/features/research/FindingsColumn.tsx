import { useEffect, useState } from 'react'
import type { Finding } from '@shared/research'
import type { StepId } from '@shared/playbook'
import { Button } from '@/components/ui/button'
import { api, unwrap } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'

const MAX_CARDS = 8

const domain = (url: string): string =>
  url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')

function FindingCard({ f, preview }: { f: Finding; preview: boolean }) {
  return (
    <li className="finding-in rounded-xl border p-4">
      <p className="text-[15px] font-semibold">{f.title}</p>
      {f.quote && (
        <blockquote className="border-primary-light mt-2 border-l-2 pl-3 text-sm">
          &ldquo;{f.quote.text}&rdquo;
          {f.quote.url && (
            <span className="text-muted-foreground mt-1 block text-[12px]">
              {domain(f.quote.url)}
            </span>
          )}
        </blockquote>
      )}
      {f.body && <p className="text-muted-foreground mt-1.5 text-sm">{f.body}</p>}
      {f.chips.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {f.chips.map((c) => (
            <li
              key={c.name}
              title={c.term ?? undefined}
              className="bg-secondary rounded-full px-2.5 py-0.5 text-[12px]"
            >
              {c.name}
              {c.term && <span className="sr-only">, {c.term}</span>}
            </li>
          ))}
        </ul>
      )}
      {(f.step || f.open) && (
        <div className="mt-2 flex gap-3">
          {f.step && (
            <button
              type="button"
              className="text-primary text-[13px] font-medium underline-offset-2 hover:underline"
              onClick={() =>
                useApp.getState().openPlaybook({ step: f.step as StepId, preview: preview })
              }
            >
              Read it
            </button>
          )}
          {f.open && (
            <button
              type="button"
              className="text-primary text-[13px] font-medium underline-offset-2 hover:underline"
              onClick={() => useApp.getState().openWikiFile(f.open!)}
            >
              Open in Wiki
            </button>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * Proof added while research runs (REQUIREMENTS-v4.4 4.4). Held outside the wiki until the founder
 * updates the playbook with it, so the run that is going never reads it.
 */
function ProofDrop({ active }: { active: boolean }) {
  const [held, setHeld] = useState<string[]>([])
  const [over, setOver] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void unwrap(api.heldFiles())
      .then((r) => setHeld(r.names))
      .catch(() => undefined)
  }, [])

  const hold = async (paths: string[]): Promise<void> => {
    if (!paths.length) return
    const r = await unwrap(api.holdFiles(paths)).catch(() => null)
    if (!r) return setNote('Could not add those files.')
    setHeld((h) => [...new Set([...h, ...r.held])].sort())
    setNote(r.refused.length ? r.refused.map((x) => `${x.name}: ${x.reason}`).join(' ') : null)
  }

  const update = async (): Promise<void> => {
    setBusy(true)
    try {
      await unwrap(api.addHeldFiles())
      setHeld([])
      // The proof section is where quotes, case studies and reviews go (v3.1 preview).
      useApp.getState().openRegenerate('proof-points')
    } catch {
      setNote('Could not add those files. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        void hold([...e.dataTransfer.files].map((f) => api.getFilePath(f)).filter(Boolean))
      }}
      className={cn(
        'rounded-xl border border-dashed p-4 transition-colors',
        over ? 'border-primary-light bg-accent' : 'bg-white'
      )}
    >
      <p className="text-[15px] font-semibold">
        {active ? 'Add proof while you wait' : 'Add proof'}
      </p>
      <p className="text-muted-foreground mt-1 text-[13px]">
        Drop customer quotes, case studies and reviews here. We&apos;ll use them in your next
        update, not in the research that is running.
      </p>
      {held.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[13px]">
          {held.map((n) => (
            <li key={n} className="truncate">
              {n}
            </li>
          ))}
        </ul>
      )}
      {note && <p className="text-destructive mt-2 text-[13px]">{note}</p>}
      {held.length > 0 && !active && (
        <div className="mt-3">
          <p className="text-sm">
            {held.length} new {held.length === 1 ? 'file' : 'files'} added. Update the playbook with{' '}
            {held.length === 1 ? 'it' : 'them'}?
          </p>
          <Button size="sm" className="mt-2" disabled={busy} onClick={() => void update()}>
            Update the playbook
          </Button>
        </div>
      )}
    </div>
  )
}

/** "What we've found so far" (REQUIREMENTS-v4.4 4.3): cards from disk, newest first. */
export function FindingsColumn({ signature, active }: { signature: string; active: boolean }) {
  const [findings, setFindings] = useState<Finding[]>([])
  const [all, setAll] = useState(false)
  useEffect(() => {
    void unwrap(api.findings())
      .then(setFindings)
      .catch(() => undefined)
  }, [signature])

  const shown = all ? findings : findings.slice(0, MAX_CARDS)
  const more = findings.length - shown.length

  return (
    <aside
      aria-labelledby="findings-heading"
      className="space-y-4 self-start min-[1100px]:sticky min-[1100px]:top-6 min-[1100px]:max-h-[calc(100vh-48px)] min-[1100px]:overflow-y-auto min-[1100px]:pb-2"
    >
      {findings.length > 0 && (
        <>
          <h3
            id="findings-heading"
            className="text-muted-foreground font-sans text-[13px] font-semibold tracking-[0.14em] uppercase"
          >
            What we&apos;ve found so far
          </h3>
          <ul className="space-y-3" aria-live="polite">
            {shown.map((f) => (
              <FindingCard key={f.id} f={f} preview={active} />
            ))}
          </ul>
          {more > 0 && (
            <button
              type="button"
              className="text-primary text-[13px] font-medium underline-offset-2 hover:underline"
              onClick={() => setAll(true)}
            >
              {more} more {more === 1 ? 'finding' : 'findings'}
            </button>
          )}
        </>
      )}
      <ProofDrop active={active} />
    </aside>
  )
}

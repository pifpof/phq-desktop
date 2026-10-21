import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useApp } from '@/store/app'
import { useDocs } from '@/store/docs'
import { useResearch } from '@/store/research'
import { isActive, pauseText } from '@/lib/research'

/** Shown above the home view when research needs the person: paused, interrupted, or never run. */
export function ResearchBanner() {
  const run = useResearch((s) => s.run)
  const loaded = useResearch((s) => s.loaded)
  const docsLoaded = useDocs((s) => s.loaded)
  const hasPlaybook = useDocs((s) => !!s.playbookPath)
  const view = useApp((s) => s.homeView)
  const [busy, setBusy] = useState(false)
  if (!loaded || !docsLoaded) return null

  const bar = (text: string, actions: React.ReactNode) => (
    <div
      className="bg-accent flex shrink-0 items-center justify-between gap-4 border-b px-6 py-2.5"
      role="status"
    >
      <p className="text-sm">{text}</p>
      <div className="flex shrink-0 gap-2">{actions}</div>
    </div>
  )

  if (run?.status === 'paused') {
    return bar(
      pauseText(run),
      <>
        <Button variant="ghost" size="sm" onClick={() => void useApp.getState().goHome('research')}>
          View progress
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await useResearch.getState().resume()
            } finally {
              setBusy(false)
            }
          }}
        >
          Resume research
        </Button>
      </>
    )
  }
  if (!hasPlaybook && !isActive(run) && view !== 'research') {
    return bar(
      'Finish setting up: run research to build your playbook.',
      <Button size="sm" onClick={() => void useApp.getState().goHome('research')}>
        Open Research
      </Button>
    )
  }
  return null
}

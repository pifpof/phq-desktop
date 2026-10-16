import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { links } from '@shared/links'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { openExternal } from '@/lib/api'
import { money } from '@/lib/research'
import { useApp } from '@/store/app'
import { pauseKey, useResearch } from '@/store/research'

/** One dialog for each reason a run pauses on its own: budget, key, credit, spend limit, web search off. */
export function PauseDialog() {
  const run = useResearch((s) => s.run)
  const dismissed = useResearch((s) => s.dismissedPause)
  const [extra, setExtra] = useState('5')
  const [busy, setBusy] = useState(false)
  const key = pauseKey(run)
  const reason = run?.pause?.reason
  const open = !!key && key !== dismissed && reason !== 'user'
  if (!run || !reason || !run.pause) return null
  const message = run.pause.message

  const act = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }
  const { resume, cancel, dismissPause } = useResearch.getState()
  const extraUsd = Number(extra)
  const extraValid = Number.isFinite(extraUsd) && extraUsd >= 1 && extraUsd <= 1000

  let content: React.ReactNode
  if (reason === 'budget') {
    content = (
      <>
        <DialogTitle>Research has used {money(run.spentUsd)}.</DialogTitle>
        <DialogDescription className="mt-2">
          Continue up to {extraValid ? money(extraUsd) : 'a little'} more, or stop here? Everything
          finished so far is kept.
        </DialogDescription>
        <div className="mt-5 max-w-[220px]">
          <Label htmlFor="extra">Extra budget</Label>
          <div className="relative mt-2">
            <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
              $
            </span>
            <Input
              id="extra"
              inputMode="decimal"
              value={extra}
              onChange={(e) => setExtra(e.target.value.replace(/[^0-9.]/g, ''))}
              className="pl-7"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" disabled={busy} onClick={() => void act(cancel)}>
            Stop here
          </Button>
          <Button
            disabled={busy || !extraValid}
            onClick={() => void act(() => resume({ budgetCapUsd: run.spentUsd + extraUsd }))}
          >
            Continue
          </Button>
        </div>
      </>
    )
  } else if (reason === 'web_search_disabled') {
    content = (
      <>
        <DialogTitle>Web search is turned off</DialogTitle>
        <DialogDescription className="mt-2">{message}</DialogDescription>
        <p className="mt-3 text-sm">
          You can skip web research and still get a playbook from your website and files.
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="outline" disabled={busy} onClick={() => void act(() => resume())}>
            It is on now, try again
          </Button>
          <Button disabled={busy} onClick={() => void act(() => resume({ skipWeb: true }))}>
            Skip web research
          </Button>
        </div>
      </>
    )
  } else if (reason === 'invalid_key') {
    content = (
      <>
        <DialogTitle>Your AI is disconnected</DialogTitle>
        <DialogDescription className="mt-2">{message}</DialogDescription>
        <p className="mt-3 text-sm">
          Research is paused. Replace your key, then resume from the progress screen.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={dismissPause}>
            Close
          </Button>
          <Button
            onClick={() => {
              dismissPause()
              useApp.getState().startFlow('replaceKey')
            }}
          >
            Replace key
          </Button>
        </div>
      </>
    )
  } else {
    // no_credit and spend_limit_reached: fix it in the Console, then resume.
    content = (
      <>
        <DialogTitle>
          {reason === 'no_credit' ? 'Your account is out of credit' : 'Your spend limit is reached'}
        </DialogTitle>
        <DialogDescription className="mt-2">{message}</DialogDescription>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="outline" onClick={() => openExternal(links.anthropicConsole)}>
            Open the Console
            <ExternalLink strokeWidth={1.8} />
          </Button>
          <Button disabled={busy} onClick={() => void act(() => resume())}>
            Resume
          </Button>
        </div>
      </>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && dismissPause()}>
      <DialogContent className="max-w-[460px]">{content}</DialogContent>
    </Dialog>
  )
}

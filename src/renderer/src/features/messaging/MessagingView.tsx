import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Gauge, RotateCcw, X } from 'lucide-react'
import { links, signupUrl } from '@shared/links'
import { parseScorecard } from '@shared/scorecard'
import { Button } from '@/components/ui/button'
import { openExternal } from '@/lib/api'
import { isActive } from '@/lib/research'
import { useNow } from '@/lib/useNow'
import { useApp } from '@/store/app'
import { useDocs } from '@/store/docs'
import { useResearch } from '@/store/research'
import { DocBody, DocHeader, FileActions, withoutTitle } from '@/features/documents/DocParts'
import { docDate, useDoc } from '@/features/documents/useDoc'
import { TaskRow } from '@/features/research/TaskRow'
import { Scorecard } from './Scorecard'

/** The second ask (REQUIREMENTS-v1 4.5): once, after the first analysis, if they skipped it during onboarding. */
function StayInLoopCard() {
  // Decided once, when the view opens: shown if they never clicked during onboarding and it has not been shown before.
  const [visible, setVisible] = useState(() => {
    const p = useApp.getState().profile
    return !!p && !p.updates.clicked && !p.updates.secondPromptShown
  })
  const marked = useRef(false)
  useEffect(() => {
    if (!visible || marked.current) return
    marked.current = true
    void useApp
      .getState()
      .saveProfile((p) => ({ ...p, updates: { ...p.updates, secondPromptShown: true } }))
  }, [visible])
  if (!visible) return null
  const click = (url: string): void => {
    openExternal(url)
    void useApp.getState().saveProfile((p) => ({ ...p, updates: { ...p.updates, clicked: true } }))
  }
  return (
    <aside className="bg-muted relative mt-10 rounded-xl border p-6">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setVisible(false)}
        className="text-muted-foreground hover:text-foreground absolute top-3 right-3 rounded-md p-1"
      >
        <X className="size-4" strokeWidth={1.8} />
      </button>
      <h3 className="text-[19px]">Stay in the loop</h3>
      <p className="text-muted-foreground mt-1 text-sm">
        Get product updates and join other founders working on their positioning. Optional.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button variant="outline" size="sm" onClick={() => click(signupUrl(''))}>
          Get updates
          <ExternalLink strokeWidth={1.8} />
        </Button>
        <Button variant="outline" size="sm" onClick={() => click(links.communityUrl)}>
          Join the community
          <ExternalLink strokeWidth={1.8} />
        </Button>
      </div>
    </aside>
  )
}

export function MessagingView() {
  const path = useDocs((s) => s.messagingPath)
  const loaded = useDocs((s) => s.loaded)
  const run = useResearch((s) => s.run)
  const now = useNow(isActive(run))
  const { doc } = useDoc(path)

  if (!loaded) return null
  if (!path) {
    const task = run?.tasks.find((t) => t.id === 'messaging-analysis')
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <Gauge className="text-primary-light size-8" strokeWidth={1.8} />
        <h2 className="mt-5">
          {isActive(run) ? 'Your messaging analysis comes last' : 'No messaging analysis yet'}
        </h2>
        <p className="lede mt-3 max-w-[460px]">
          {isActive(run)
            ? 'It compares what your website and social profiles say with your new playbook, so it runs once the playbook is done.'
            : 'Run research and PositioningHQ will review your current messaging against your playbook.'}
        </p>
        {isActive(run) && task ? (
          <ul className="mt-6 w-full max-w-[460px] rounded-xl border px-4 text-left">
            <TaskRow task={task} now={now} />
          </ul>
        ) : (
          <Button className="mt-6" onClick={() => useApp.getState().startFlow('research')}>
            Start research
          </Button>
        )}
      </div>
    )
  }
  if (doc === undefined) return null
  if (doc === null)
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
        The messaging analysis is missing.
      </div>
    )

  const scores = parseScorecard(doc.body)
  // The scorecard block is drawn as tiles, so it is left out of the text.
  const body = withoutTitle(doc, doc.body.replace(/^\s*```json\s*\n[\s\S]*?\n\s*```\s*\n?/, ''))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DocHeader title={doc.title} subtitle={`Draft · Last updated ${docDate(doc)}`}>
        <Button
          variant="ghost"
          size="sm"
          disabled={isActive(run)}
          onClick={async () => {
            await useResearch.getState().rerun({ taskIds: ['messaging-analysis'] })
            void useApp.getState().goHome('research')
          }}
        >
          <RotateCcw strokeWidth={1.8} />
          Re-run
        </Button>
        <FileActions path={path} />
      </DocHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[900px] px-6 py-8">
          {scores && <Scorecard scores={scores} />}
          <article className={scores ? 'mt-8 max-w-[760px]' : 'max-w-[760px]'}>
            <DocBody doc={doc} body={body} />
          </article>
          <StayInLoopCard />
        </div>
      </div>
    </div>
  )
}

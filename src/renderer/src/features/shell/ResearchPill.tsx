import { Loader2, Pause, Sparkles } from 'lucide-react'
import { isActive, playbookPublished, progressCounts } from '@/lib/research'
import { useApp } from '@/store/app'
import { useDocs } from '@/store/docs'
import { useResearch } from '@/store/research'

/** "Research 12 of 21" while a run is going, "Finish setting up" when there is no playbook yet. */
export function ResearchPill() {
  const run = useResearch((s) => s.run)
  const loaded = useResearch((s) => s.loaded)
  const hasPlaybook = useDocs((s) => !!s.playbookPath)
  if (!loaded) return null

  const cls =
    'focus-visible:ring-ring/50 mx-3 flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-[13px] font-semibold outline-none hover:bg-accent focus-visible:ring-[3px]'

  if (isActive(run) && run) {
    const { done, total } = progressCounts(run)
    return (
      <button
        type="button"
        className={cls}
        onClick={() => void useApp.getState().goHome('research')}
      >
        {run.status === 'paused' ? (
          <Pause className="text-primary size-3.5" strokeWidth={2} />
        ) : (
          <Loader2 className="text-primary size-3.5 animate-spin" strokeWidth={2} />
        )}
        <span>
          Research {done} of {total}
          {run.status === 'paused' ? ', paused' : ''}
        </span>
      </button>
    )
  }
  if (!hasPlaybook && !playbookPublished(run)) {
    return (
      <button type="button" className={cls} onClick={() => useApp.getState().startFlow('research')}>
        <Sparkles className="text-primary size-3.5" strokeWidth={2} />
        Finish setting up
      </button>
    )
  }
  return null
}

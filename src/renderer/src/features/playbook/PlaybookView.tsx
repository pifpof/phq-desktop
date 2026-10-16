import { BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isActive } from '@/lib/research'
import { useNow } from '@/lib/useNow'
import { useApp } from '@/store/app'
import { useDocs } from '@/store/docs'
import { useResearch } from '@/store/research'
import { DocView } from '@/features/documents/DocView'
import { TaskRow } from '@/features/research/TaskRow'

export function PlaybookView() {
  const path = useDocs((s) => s.playbookPath)
  const loaded = useDocs((s) => s.loaded)
  const run = useResearch((s) => s.run)
  const now = useNow(isActive(run))

  if (!loaded) return null
  if (path) return <DocView path={path} status="Draft" />

  // No playbook yet: while research runs, show just the playbook steps.
  if (isActive(run) && run) {
    const steps = run.tasks.filter((t) => t.stage === 4)
    return (
      <div className="mx-auto max-w-[560px] px-6 py-16">
        <h2>Your playbook is being written</h2>
        <p className="lede mt-3">It appears here as soon as all seven sections are done.</p>
        <ul className="mt-6 divide-y rounded-xl border px-4">
          {steps.map((t) => (
            <TaskRow key={t.id} task={t} now={now} />
          ))}
        </ul>
        <Button variant="outline" className="mt-6" onClick={() => useApp.getState().go('progress')}>
          View all progress
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <BookOpen className="text-primary-light size-8" strokeWidth={1.8} />
      <h2 className="mt-5">No playbook yet</h2>
      <p className="lede mt-3 max-w-[440px]">
        Run research and PositioningHQ will write your first positioning playbook.
      </p>
      <Button className="mt-6" onClick={() => useApp.getState().startFlow('research')}>
        Start research
      </Button>
    </div>
  )
}

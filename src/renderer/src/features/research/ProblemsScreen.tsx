import { useEffect, useRef } from 'react'
import { TriangleAlert } from 'lucide-react'
import type { RunView } from '@shared/research'
import { Button } from '@/components/ui/button'
import { isActive } from '@/lib/research'
import { useResearch } from '@/store/research'

/** Runs whose problems screen the founder has already left, this session. */
const seen = new Set<string>()

/** The run tried to publish the playbook and couldn't (REQUIREMENTS-v4.4 3.5). */
export function finishedWithProblems(run: RunView): boolean {
  if (isActive(run) || run.status === 'cancelled' || run.kind === 'regen' || seen.has(run.id))
    return false
  const publish = run.tasks.find((t) => t.id === 'playbook-assemble')
  return publish?.status === 'failed' || publish?.status === 'blocked'
}

/** "Research finished with problems": what failed, in plain words, and a way to retry it. */
export function ProblemsScreen({ run, onDetails }: { run: RunView; onDetails(): void }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  const failed = run.tasks.filter((t) => t.status === 'failed')
  const leave = (): void => {
    seen.add(run.id)
    onDetails()
  }
  const reasons = [...new Set(failed.map((t) => t.error?.message).filter(Boolean))]

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto px-6 py-14">
      <div className="w-full max-w-[560px] text-center">
        <div className="bg-warning-bg mx-auto flex size-14 items-center justify-center rounded-full">
          <TriangleAlert className="text-warning size-7" strokeWidth={2} aria-hidden />
        </div>
        <h1 ref={heading} tabIndex={-1} className="mt-6 text-[32px] leading-tight outline-none">
          Research finished with problems
        </h1>
        <p className="lede mt-3">
          {failed.length
            ? `${failed.map((t) => t.title).join(', ')} did not finish, so the playbook was not published.`
            : 'The playbook was not published.'}
        </p>
        {reasons.length > 0 && (
          <p className="text-muted-foreground mt-2 text-sm">{reasons.join(' ')}</p>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button
            onClick={() => {
              seen.add(run.id)
              for (const t of failed) void useResearch.getState().retry(t.id)
              onDetails()
            }}
            disabled={!failed.length}
          >
            Retry failed steps
          </Button>
          <Button variant="outline" onClick={leave}>
            See research details
          </Button>
        </div>
      </div>
    </div>
  )
}

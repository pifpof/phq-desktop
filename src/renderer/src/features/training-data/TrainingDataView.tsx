import { useEffect, useMemo, useState } from 'react'
import { Circle, Loader2, RotateCcw } from 'lucide-react'
import type { Res } from '@shared/ipc-contract'
import type { DocMeta } from '@shared/workspace'
import { Button } from '@/components/ui/button'
import { api, ApiError, unwrap } from '@/lib/api'
import { isActive } from '@/lib/research'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useResearch } from '@/store/research'
import { DocView } from '@/features/documents/DocView'
import { FilesPane } from './FilesPane'
import { ProfilePane } from './ProfilePane'
import { SocialPane } from './SocialPane'

type Catalog = Res<'research:catalog'>

interface Item {
  key: string
  label: string
  kind: 'doc' | 'profile' | 'social' | 'files'
  path?: string
  taskId?: string
  exists?: boolean
}
interface Group {
  title: string
  items: Item[]
}

/** Fixed names in the list, so it reads the same whatever headings the model wrote. */
const LABELS: Record<string, string> = {
  'crawl-website': 'Pages crawled',
  'website-positioning': 'Website positioning',
  'find-social-profiles': 'Social profiles',
  'research-09-synthesis': 'Market overview',
  'competitor-discovery': 'Competitor list',
  'proof-gathering': 'Public proof'
}

export function TrainingDataView() {
  const [catalog, setCatalog] = useState<Catalog>([])
  const [docs, setDocs] = useState<Map<string, DocMeta>>(new Map())
  const [selected, setSelected] = useState('profile')
  const [error, setError] = useState<string | null>(null)
  const run = useResearch((s) => s.run)

  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      void Promise.all([
        unwrap(api.researchCatalog()).catch(() => []),
        unwrap(api.listDocs('memory')).catch(() => [])
      ]).then(([c, d]) => {
        if (cancelled) return
        setCatalog(c)
        setDocs(new Map(d.map((x) => [x.path, x])))
      })
    }
    load()
    const off = api.onWorkspaceChanged(({ paths }) => {
      if (paths.some((p) => p.startsWith('memory/'))) load()
    })
    return () => {
      cancelled = true
      off()
    }
  }, [])

  const groups = useMemo<Group[]>(() => {
    const entry = (taskId: string, fallback?: string): Item | null => {
      const c = catalog.find((x) => x.taskId === taskId && (!fallback || x.title === fallback))
      if (!c) return null
      return {
        key: c.path,
        label: fallback ?? LABELS[c.taskId] ?? c.title,
        kind: 'doc',
        path: c.path,
        taskId: c.taskId,
        exists: docs.has(c.path)
      }
    }
    const steps = [
      'research-01-overview',
      'research-02-product',
      'research-03-market-segment',
      'research-04-customer-segment',
      'research-05-strengths',
      'research-06-weaknesses',
      'research-07-recent-developments',
      'research-08-competitive',
      'research-09-synthesis'
    ]
    const competitorDir = catalog.find((c) => c.taskId === 'competitor-profiles')?.path
    const profiles: Item[] = competitorDir
      ? [...docs.values()]
          .filter((d) => d.path.startsWith(`${competitorDir}/`))
          .map((d) => ({
            key: d.path,
            label: d.title,
            kind: 'doc' as const,
            path: d.path,
            taskId: 'competitor-profiles',
            exists: true
          }))
      : []
    const keep = (xs: (Item | null)[]): Item[] => xs.filter((x): x is Item => x !== null)
    return [
      {
        title: 'Your company',
        items: [{ key: 'profile', label: 'Company profile', kind: 'profile' }]
      },
      {
        title: 'Your website',
        items: keep([entry('crawl-website'), entry('website-positioning')])
      },
      {
        title: 'Social',
        items: keep([
          { key: 'social', label: 'Social taglines', kind: 'social', taskId: 'social-taglines' },
          entry('find-social-profiles')
        ])
      },
      {
        title: 'Market and company research',
        items: keep([
          ...steps.map((s) => entry(s)),
          entry('research-09-synthesis', 'Full company research')
        ])
      },
      { title: 'Competitors', items: keep([entry('competitor-discovery'), ...profiles]) },
      { title: 'Public proof', items: keep([entry('proof-gathering')]) },
      { title: 'Your files', items: [{ key: 'files', label: 'Files you added', kind: 'files' }] }
    ]
  }, [catalog, docs])

  const all = groups.flatMap((g) => g.items)
  const current = all.find((i) => i.key === selected) ?? all[0]
  const runningIds = new Set(
    isActive(run)
      ? (run?.tasks.filter((t) => t.status === 'running').map((t) => t.id.split(':')[0]) ?? [])
      : []
  )

  const rerun = async (taskId: string): Promise<void> => {
    setError(null)
    try {
      await useResearch.getState().rerun({ taskIds: [taskId] })
      useApp.getState().go('progress')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start. Please try again.')
    }
  }
  const rerunButton = (taskId: string) => (
    <Button
      variant="ghost"
      size="sm"
      disabled={isActive(run)}
      title={isActive(run) ? 'Research is running' : undefined}
      onClick={() => void rerun(taskId)}
    >
      <RotateCcw strokeWidth={1.8} />
      Re-run
    </Button>
  )
  const taskTitle = (id?: string): string | undefined =>
    run?.tasks.find((t) => t.id === id)?.title ?? catalog.find((c) => c.taskId === id)?.title

  return (
    <div className="flex h-full">
      <nav className="w-[260px] shrink-0 overflow-y-auto border-r py-4" aria-label="Training data">
        <div className="mb-3 flex items-center justify-between px-4">
          <h2 className="text-[17px]">Training Data</h2>
        </div>
        {groups.map((g) => (
          <div key={g.title} className="mb-4">
            <p className="text-muted-foreground px-4 pb-1 text-[12px] font-semibold tracking-[0.12em] uppercase">
              {g.title}
            </p>
            <ul>
              {g.items.map((i) => {
                const running = i.taskId ? runningIds.has(i.taskId) : false
                const missing = i.kind === 'doc' && !i.exists
                return (
                  <li key={i.key}>
                    <button
                      type="button"
                      aria-current={current?.key === i.key ? 'true' : undefined}
                      onClick={() => setSelected(i.key)}
                      className={cn(
                        'focus-visible:ring-ring/50 flex w-full items-center gap-2 px-4 py-1.5 text-left text-sm outline-none focus-visible:ring-[3px]',
                        current?.key === i.key
                          ? 'bg-accent text-primary font-semibold'
                          : 'hover:bg-secondary',
                        missing && !running && 'text-muted-foreground'
                      )}
                    >
                      {running ? (
                        <Loader2
                          className="text-primary size-3.5 shrink-0 animate-spin"
                          strokeWidth={2}
                          aria-label="Being written"
                        />
                      ) : missing ? (
                        <Circle
                          className="text-border size-3.5 shrink-0"
                          strokeWidth={2}
                          aria-label="Missing"
                        />
                      ) : null}
                      <span className="truncate">{i.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
        <div className="border-t px-4 pt-4">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={isActive(run)}
            onClick={() => useApp.getState().startFlow('research')}
          >
            Re-run all research
          </Button>
        </div>
      </nav>

      <section className="min-w-0 flex-1">
        {error && <p className="text-destructive border-b px-6 py-2 text-sm">{error}</p>}
        {current?.kind === 'profile' && <ProfilePane />}
        {current?.kind === 'social' && <SocialPane onRerun={() => void rerun('social-taglines')} />}
        {current?.kind === 'files' && <FilesPane />}
        {current?.kind === 'doc' && current.path && current.exists && (
          <DocView
            key={current.path}
            path={current.path}
            status={taskTitle(current.taskId) ? `From "${taskTitle(current.taskId)}"` : undefined}
            actions={current.taskId ? rerunButton(current.taskId) : undefined}
          />
        )}
        {current?.kind === 'doc' && !current.exists && (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            {current.taskId && runningIds.has(current.taskId) ? (
              <>
                <Loader2 className="text-primary size-6 animate-spin" strokeWidth={1.8} />
                <p className="mt-4 font-semibold">{current.label} is being written.</p>
              </>
            ) : (
              <>
                <p className="font-semibold">{current.label}</p>
                <p className="text-muted-foreground mt-1 max-w-[380px] text-sm">
                  Not written yet, or the file was moved or deleted. Run this step again to write
                  it.
                </p>
                {current.taskId && <div className="mt-4">{rerunButton(current.taskId)}</div>}
              </>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

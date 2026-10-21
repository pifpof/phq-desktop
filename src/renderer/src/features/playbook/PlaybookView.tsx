import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  Copy,
  FileDown,
  FileText,
  FolderOpen,
  Layers,
  RefreshCw,
  Sparkles
} from 'lucide-react'
import type { PlaybookView as View, StepId } from '@shared/playbook'
import { Button } from '@/components/ui/button'
import { MenuButton } from '@/components/MenuButton'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { api, unwrap } from '@/lib/api'
import { isActive } from '@/lib/research'
import { useNow } from '@/lib/useNow'
import { useApp } from '@/store/app'
import { useDocs } from '@/store/docs'
import { useResearch } from '@/store/research'
import { TaskRow } from '@/features/research/TaskRow'
import { formatDay } from '@/features/wiki/format'
import { PANEL_ID, StepTabs, tabId, type StepKey, type StepPill } from './StepTabs'
import { PlaybookOverview } from './PlaybookOverview'
import { PlaybookSection } from './PlaybookSection'
import { RegeneratePlaybookDialog, TakeawaysDialog } from './PlaybookDialogs'
import { usePlaybookNav, usePlaybookView, useVersions } from './usePlaybook'
import { GapActions, HelpChip, HelpSheet } from './HelpSheet'
import { ExportPdfDialog } from './ExportPdfDialog'
import { useHelp } from '@/store/help'

/**
 * The Positioning Playbook page (REQUIREMENTS-v4 3): a header with step tabs, the At a glance
 * overview, then one section per tab. Renders from the chosen output version; the right panel
 * reads the live articles.
 */

const CURRENT = 'current'

/** True when the company profile or any user file changed after this version was written. */
function useOutOfDate(path: string | null): boolean {
  const [stale, setStale] = useState(false)
  const profile = useApp((s) => s.profile)
  useEffect(() => {
    if (!path) return
    const check = (): void => {
      void unwrap(api.changedSince(path))
        .then((r) => setStale(r.profile || r.inputs))
        .catch(() => setStale(false))
    }
    check()
    return api.onWorkspaceChanged(({ paths }) => {
      if (paths.some((p) => p.startsWith('raw/'))) check()
    })
  }, [path, profile])
  return path ? stale : false
}

function Banner({
  children,
  tone = 'accent'
}: {
  children: React.ReactNode
  tone?: 'accent' | 'muted'
}) {
  return (
    <div
      role="status"
      className={
        tone === 'accent'
          ? 'bg-accent flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-6 py-2.5'
          : 'bg-secondary flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-6 py-2.5'
      }
    >
      {children}
    </div>
  )
}

function Empty() {
  const run = useResearch((s) => s.run)
  const now = useNow(isActive(run))
  if (isActive(run) && run) {
    return (
      <div className="mx-auto max-w-[560px] px-6 py-16">
        <h2>Your playbook is being written</h2>
        <p className="lede mt-3">It appears here as soon as all seven sections are done.</p>
        <ul className="mt-6 divide-y rounded-xl border px-4">
          {run.tasks
            .filter((t) => t.stage === 4 && t.id !== 'playbook-takeaways')
            .map((t) => (
              <TaskRow key={t.id} task={t} now={now} />
            ))}
        </ul>
        <Button
          variant="outline"
          className="mt-6"
          onClick={() => void useApp.getState().goHome('research')}
        >
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

function pillsFor(view: View): StepPill[] {
  return [
    { id: 'overview', n: 0, label: 'Overview', gap: false },
    ...view.sections.map((s) => ({ id: s.id, n: s.n, label: s.label, gap: !!s.gap }))
  ]
}

export function PlaybookView() {
  const loaded = useDocs((s) => s.loaded)
  const run = useResearch((s) => s.run)
  const busyRun = isActive(run)
  const versions = useVersions()
  const [selected, setSelected] = useState(CURRENT)
  const { view, reload } = usePlaybookView(selected === CURRENT ? null : selected)
  const { nav, save } = usePlaybookNav()
  const target = useApp((s) => s.playbookTarget)
  const [step, setStep] = useState<StepKey | null>(null)
  const [focus, setFocus] = useState<{ card?: string; gap?: boolean } | null>(null)
  const [dialog, setDialog] = useState<'regenerate' | 'takeaways' | 'pdf' | null>(null)
  const [copied, setCopied] = useState(false)
  const stale = useOutOfDate(view?.current ? view.path : null)
  // The Help plan belongs to the workspace: load it when the page opens.
  useEffect(() => void useHelp.getState().load(), [])

  // Sent here from another view (REQUIREMENTS-v4 4.1, `playbook?step=value`): show that step.
  useEffect(() => {
    if (!target) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- following a navigation request
    setSelected(CURRENT)
    setStep(target.step)
    setFocus(target.card || target.gap ? { card: target.card, gap: target.gap } : null)
    useApp.setState({ playbookTarget: null })
  }, [target])

  const visited = useMemo(
    () => new Set<StepKey>((view && nav?.visited[view.path]) as StepKey[] | undefined),
    [view, nav]
  )
  // First open: the last step viewed, else Overview.
  const shown: StepKey | null = step ?? (nav ? ((nav.last as StepKey | null) ?? 'overview') : null)
  // Mark the shown step visited for this version, and remember it as the last step.
  useEffect(() => {
    const step = shown
    if (!view || !nav || !step) return
    const seen = nav.visited[view.path] ?? []
    if (seen.includes(step) && nav.last === step) return
    save({
      visited: { ...nav.visited, [view.path]: [...new Set([...seen, step])] },
      last: step
    })
  }, [view, nav, shown, save])

  const go = (to: StepKey, opts?: { card?: string; gap?: boolean }): void => {
    setStep(to)
    setFocus(opts ?? null)
    document.getElementById(PANEL_ID)?.scrollTo({ top: 0 })
  }

  if (!loaded || view === undefined) return null
  if (view === null) return <Empty />

  const current = shown ?? 'overview'
  const section = view.sections.find((s) => s.id === current)
  const old = !view.current
  const date = formatDay(view.date)
  const meta = [view.company, `Version ${view.version}`, date, 'Draft'].filter(Boolean).join(' · ')
  const revealLabel = useApp.getState().state?.revealLabel ?? 'Show in Finder'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b px-6 pt-4 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h1 className="font-serif text-[26px] leading-tight font-bold">Positioning Playbook</h1>
            <p className="text-muted-foreground mt-0.5 text-[13px]">{meta}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <HelpChip />
            {versions.length > 1 && (
              <div className="w-[250px]">
                <Select value={selected} onValueChange={setSelected}>
                  <SelectTrigger aria-label="Version" className="h-8 text-sm" />
                  <SelectContent>
                    {versions.map((v, i) => (
                      <SelectItem key={v.path} value={i === 0 ? CURRENT : v.path}>
                        Version {v.version}
                        {i === 0 ? ' · Current' : v.date ? ` · ${formatDay(v.date)}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => setDialog('pdf')}>
              <FileDown strokeWidth={1.8} />
              Export PDF
            </Button>
            <MenuButton
              label="More actions"
              items={[
                {
                  label: copied ? 'Copied' : 'Copy as markdown',
                  icon: <Copy />,
                  onSelect: () => {
                    void api.copyDoc(view.path).then(() => {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    })
                  }
                },
                {
                  label: 'Open in editor',
                  icon: <FileText />,
                  onSelect: () => void api.openDoc(view.path)
                },
                {
                  label: revealLabel,
                  icon: <FolderOpen />,
                  onSelect: () => void api.revealDoc(view.path)
                },
                {
                  label: 'Reassemble',
                  icon: <Layers />,
                  disabled: busyRun || old,
                  onSelect: () => {
                    void unwrap(api.reassemble())
                      .then(() => useDocs.getState().refresh())
                      .then(reload)
                      .catch(() => undefined)
                  }
                }
              ]}
            />
            <Button
              size="sm"
              disabled={old || busyRun}
              title={
                old
                  ? 'Switch to the current version to regenerate'
                  : busyRun
                    ? 'Research is running'
                    : undefined
              }
              onClick={() => setDialog('regenerate')}
            >
              <RefreshCw strokeWidth={1.8} />
              Regenerate
            </Button>
          </div>
        </div>
        <div className="mt-4">
          <StepTabs
            pills={pillsFor(view)}
            current={current}
            visited={visited}
            onSelect={(id) => go(id)}
          />
        </div>
      </header>

      {old && (
        <Banner tone="muted">
          <p className="text-sm">You&apos;re viewing version {view.version}.</p>
          <Button variant="outline" size="sm" onClick={() => setSelected(CURRENT)}>
            View current
          </Button>
        </Banner>
      )}
      {!old && view.needsTakeaways && (
        <Banner>
          <p className="flex items-center gap-2 text-sm">
            <Sparkles className="text-primary size-4 shrink-0" strokeWidth={1.8} />
            Add key takeaways and gaps to this playbook. Uses your AI provider, about $0.10.
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={busyRun}
            onClick={() => setDialog('takeaways')}
          >
            Add them
          </Button>
        </Banner>
      )}
      {!old && stale && (
        <Banner>
          <p className="text-sm">
            Your company profile or files changed after this version was written. The playbook is
            out of date.
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={busyRun}
            onClick={() => setDialog('regenerate')}
          >
            Regenerate
          </Button>
        </Banner>
      )}

      <div
        id={PANEL_ID}
        role="tabpanel"
        aria-labelledby={tabId(current)}
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto outline-none"
      >
        <div className="px-6 py-8">
          {current === 'overview' || !section ? (
            <PlaybookOverview
              view={view}
              onGo={(s: StepId, opts) => go(s, opts)}
              onGenerate={() => setDialog('regenerate')}
              canGenerate={!old && !busyRun}
            />
          ) : (
            <PlaybookSection
              key={`${view.path}-${section.id}`}
              view={view}
              section={section}
              focus={focus}
              onGo={go}
              onGenerate={() => setDialog('regenerate')}
              gapActions={(s) => <GapActions section={s} />}
            />
          )}
        </div>
      </div>

      <HelpSheet company={view.company} />
      {dialog === 'regenerate' && <RegeneratePlaybookDialog onClose={() => setDialog(null)} />}
      {dialog === 'takeaways' && <TakeawaysDialog onClose={() => setDialog(null)} />}
      {dialog === 'pdf' && <ExportPdfDialog view={view} onClose={() => setDialog(null)} />}
    </div>
  )
}

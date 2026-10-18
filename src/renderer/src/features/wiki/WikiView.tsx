import { useEffect, useMemo, useState } from 'react'
import { Lock } from 'lucide-react'
import type { ArticleSummary, SourceSummary } from '@shared/wiki-views'
import { Button } from '@/components/ui/button'
import { api, ApiError, unwrap } from '@/lib/api'
import { isActive } from '@/lib/research'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useResearch } from '@/store/research'
import { DocView } from '@/features/documents/DocView'
import { ArticleView } from './ArticleView'
import { FilesPane } from './FilesPane'
import { ProfilePane } from './ProfilePane'
import { SocialPane } from './SocialPane'

/** Knowledge groups in the order of the spec's article map (REQUIREMENTS-v2 4.1). */
const KNOWLEDGE_GROUPS = [
  'Company',
  'Market',
  'Customers',
  'Positioning',
  'Competitors',
  'Proof',
  'Messaging',
  'Decisions',
  'Other'
]
const SOURCE_GROUPS = [
  'Your website',
  'Competitor sites',
  'Web citations',
  'Social',
  'Your files',
  'Other'
]

type Tab = 'articles' | 'sources'
/** "profile", "files", or a wiki path. */
type Selection = string

interface Entry {
  key: string
  label: string
  private?: boolean
  hint?: string
}

function useWikiLists(): { articles: ArticleSummary[]; sources: SourceSummary[] } {
  const [articles, setArticles] = useState<ArticleSummary[]>([])
  const [sources, setSources] = useState<SourceSummary[]>([])
  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      void Promise.all([
        unwrap(api.listArticles()).catch(() => []),
        unwrap(api.listSources()).catch(() => [])
      ]).then(([a, s]) => {
        if (cancelled) return
        setArticles(a)
        setSources(s)
      })
    }
    load()
    const off = api.onWorkspaceChanged(({ paths }) => {
      if (paths.some((p) => p.startsWith('wiki/') || p.startsWith('raw/'))) load()
    })
    return () => {
      cancelled = true
      off()
    }
  }, [])
  return { articles, sources }
}

export function WikiView() {
  const target = useApp((s) => s.wikiTarget)
  const [tab, setTab] = useState<Tab>(target?.tab ?? 'articles')
  const [selected, setSelected] = useState<Selection>(target?.path ?? 'profile')
  const [error, setError] = useState<string | null>(null)
  const { articles, sources } = useWikiLists()
  const run = useResearch((s) => s.run)

  // Sent here from another view (a source link, Edit the source article): show that file.
  useEffect(() => {
    if (!target) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- following a navigation request
    setTab(target.tab)
    setSelected(target.path)
    useApp.setState({ wikiTarget: null })
  }, [target])

  const knowledge = useMemo(() => {
    const groups = new Map<string, Entry[]>()
    for (const a of articles) {
      if (a.slug === 'company-profile') continue
      const list = groups.get(a.group) ?? []
      list.push({ key: a.path, label: a.title, private: a.private })
      groups.set(a.group, list)
    }
    return KNOWLEDGE_GROUPS.filter((g) => groups.has(g)).map((g) => ({
      title: g,
      items: groups.get(g)!
    }))
  }, [articles])

  const sourceGroups = useMemo(() => {
    const groups = new Map<string, Entry[]>()
    for (const s of sources) {
      const list = groups.get(s.group) ?? []
      list.push({
        key: s.path,
        label: s.title,
        private: s.tags.includes('private'),
        hint: s.ingested
      })
      groups.set(s.group, list)
    }
    return SOURCE_GROUPS.filter((g) => groups.has(g)).map((g) => ({
      title: g,
      items: groups.get(g)!
    }))
  }, [sources])

  const rerun = async (taskId: string): Promise<void> => {
    setError(null)
    try {
      await useResearch.getState().rerun({ taskIds: [taskId] })
      useApp.getState().go('progress')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start. Please try again.')
    }
  }

  const item = (e: Entry) => (
    <li key={e.key}>
      <button
        type="button"
        aria-current={selected === e.key ? 'true' : undefined}
        onClick={() => setSelected(e.key)}
        className={cn(
          'focus-visible:ring-ring/50 flex w-full items-center gap-2 px-4 py-1.5 text-left text-sm outline-none focus-visible:ring-[3px]',
          selected === e.key ? 'bg-accent text-primary font-semibold' : 'hover:bg-secondary'
        )}
      >
        <span className="min-w-0 flex-1 truncate">{e.label}</span>
        {e.private && (
          <Lock
            className="text-muted-foreground size-3 shrink-0"
            strokeWidth={2}
            aria-label="Private"
          />
        )}
      </button>
    </li>
  )
  const group = (title: string, items: Entry[]) => (
    <div key={title} className="mb-4">
      <p className="text-muted-foreground px-4 pb-1 text-[12px] font-semibold tracking-[0.12em] uppercase">
        {title}
      </p>
      <ul>{items.map(item)}</ul>
    </div>
  )

  const isArticle = selected.startsWith('wiki/')
  const isRaw = selected.startsWith('raw/')
  const socialArticle = selected === 'wiki/references/social-taglines.md'

  return (
    <div className="flex h-full">
      <nav className="w-[270px] shrink-0 overflow-y-auto border-r py-4" aria-label="Wiki">
        <div className="mb-3 px-4">
          <h2 className="text-[17px]">Wiki</h2>
          <div
            role="tablist"
            aria-label="Wiki sections"
            className="bg-secondary mt-3 grid grid-cols-2 rounded-[10px] p-0.5 text-sm"
          >
            {(['articles', 'sources'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => {
                  setTab(t)
                  setSelected(t === 'articles' ? 'profile' : 'files')
                }}
                className={cn(
                  'rounded-[8px] py-1.5 font-medium',
                  tab === t ? 'text-primary bg-white shadow-sm' : 'text-muted-foreground'
                )}
              >
                {t === 'articles' ? 'Articles' : 'Sources'}
              </button>
            ))}
          </div>
        </div>
        {tab === 'articles' ? (
          <>
            {group('Your company', [{ key: 'profile', label: 'Company profile' }])}
            {knowledge.map((g) => group(g.title, g.items))}
            {knowledge.length === 0 && (
              <p className="text-muted-foreground px-4 text-sm">
                No articles yet. Run research to write them.
              </p>
            )}
          </>
        ) : (
          <>
            {group('Add', [{ key: 'files', label: 'Your files' }])}
            {sourceGroups.map((g) => group(g.title, g.items))}
          </>
        )}
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
        {selected === 'profile' && <ProfilePane />}
        {selected === 'files' && <FilesPane />}
        {socialArticle && <SocialPane onRerun={() => void rerun('social-taglines')} />}
        {isArticle && !socialArticle && (
          <ArticleView key={selected} path={selected} onRerun={(t) => void rerun(t)} />
        )}
        {isRaw && <DocView key={selected} path={selected} status="Source, read-only" />}
      </section>
    </div>
  )
}

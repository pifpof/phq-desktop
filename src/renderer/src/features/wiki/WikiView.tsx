import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Ellipsis, Lock } from 'lucide-react'
import type { SourceSummary } from '@shared/wiki-views'
import type { TreeNode, WikiTree } from '@shared/wiki-tree'
import { Button } from '@/components/ui/button'
import { api, ApiError, unwrap } from '@/lib/api'
import { isActive } from '@/lib/research'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useResearch } from '@/store/research'
import { useWikiNav } from '@/store/wiki-nav'
import { DocView } from '@/features/documents/DocView'
import { ArticlesTree } from './ArticlesTree'
import { parentKey, sectionKey } from './tree-rows'
import { ArticleView } from './ArticleView'
import { FilesPane } from './FilesPane'
import { PlaceholderPane } from './PlaceholderPane'
import { ProfilePane } from './ProfilePane'
import { SocialPane } from './SocialPane'

const PROFILE = 'wiki/references/company-profile.md'
const SOCIAL = 'wiki/references/social-taglines.md'

const SOURCE_GROUPS = [
  'Your website',
  'Competitor sites',
  'Web citations',
  'Social',
  'Your files',
  'Other'
]

type Tab = 'articles' | 'sources'

/** The section and parent keys above a node, so a node opened from elsewhere can be shown. */
function ancestorKeys(tree: WikiTree, id: string): string[] | null {
  const walk = (nodes: TreeNode[], trail: string[]): string[] | null => {
    for (const n of nodes) {
      if (n.id === id) return trail
      const hit = walk(n.children, [...trail, parentKey(n.id)])
      if (hit) return hit
    }
    return null
  }
  for (const s of tree.sections) {
    const hit = walk(s.items, [sectionKey(s.id)])
    if (hit) return hit
  }
  return null
}

function firstArticle(tree: WikiTree | null): string | null {
  for (const s of tree?.sections ?? [])
    for (const n of s.items) if (n.kind === 'article') return n.id
  return null
}

function findNode(tree: WikiTree | null, id: string): TreeNode | null {
  const walk = (nodes: TreeNode[]): TreeNode | null => {
    for (const n of nodes) {
      if (n.id === id) return n
      const hit = walk(n.children)
      if (hit) return hit
    }
    return null
  }
  for (const s of tree?.sections ?? []) {
    const hit = walk(s.items)
    if (hit) return hit
  }
  return null
}

function useSourceList(): SourceSummary[] {
  const [sources, setSources] = useState<SourceSummary[]>([])
  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      void unwrap(api.listSources())
        .catch(() => [])
        .then((s) => {
          if (!cancelled) setSources(s)
        })
    }
    load()
    const off = api.onWikiTreeChanged(load)
    return () => {
      cancelled = true
      off()
    }
  }, [])
  return sources
}

function TreeMenu({ tree }: { tree: WikiTree }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const all = (): string[] => {
    const keys = tree.sections.map((s) => sectionKey(s.id))
    const walk = (nodes: TreeNode[]): void => {
      for (const n of nodes)
        if (n.children.length) {
          keys.push(parentKey(n.id))
          walk(n.children)
        }
    }
    for (const s of tree.sections) walk(s.items)
    return keys
  }
  const pick = (expanded: boolean): void => {
    useWikiNav.getState().setManyExpanded(all(), expanded)
    setOpen(false)
  }
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Tree options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-ring/50 flex size-7 items-center justify-center rounded-[8px] outline-none focus-visible:ring-[3px]"
      >
        <Ellipsis className="size-4" strokeWidth={2} />
      </button>
      {open && (
        <div
          role="menu"
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          className="absolute top-8 right-0 z-20 w-40 rounded-2xl border bg-white p-1.5 text-sm shadow-[var(--shadow-menu)]"
        >
          {(
            [
              ['Expand all', true],
              ['Collapse all', false]
            ] as const
          ).map(([label, expanded]) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              autoFocus={expanded}
              onClick={() => pick(expanded)}
              className="hover:bg-secondary focus-visible:bg-secondary w-full rounded-[10px] px-3 py-1.5 text-left outline-none"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function WikiView() {
  const target = useApp((s) => s.wikiTarget)
  const workspace = useApp((s) => s.state?.workspacePath)
  const { articles, loaded } = useWikiNav()
  const [tab, setTab] = useState<Tab>(target?.tab ?? 'articles')
  const [selected, setSelected] = useState<string | null>(target?.path ?? null)
  const [error, setError] = useState<string | null>(null)
  const sources = useSourceList()
  const run = useResearch((s) => s.run)

  useEffect(() => {
    void useWikiNav.getState().load()
    return api.onWikiTreeChanged(() => void useWikiNav.getState().reloadTrees())
  }, [workspace])

  // Sent here from another view (a source link, a link in the playbook): show that file.
  useEffect(() => {
    if (!target) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- following a navigation request
    setTab(target.tab)
    setSelected(target.path)
    useApp.setState({ wikiTarget: null })
  }, [target])

  // Make sure the opened article is visible: expand its section and parents.
  useEffect(() => {
    if (!articles || !selected) return
    const keys = ancestorKeys(articles, selected)
    const nav = useWikiNav.getState()
    const closed = keys?.filter((k) => !nav.isExpanded(k)) ?? []
    if (closed.length) nav.setManyExpanded(closed, true)
  }, [articles, selected])

  const current = selected ?? (tab === 'articles' ? firstArticle(articles) : 'files')
  const open = useCallback((id: string) => {
    setSelected(id)
    if (id.startsWith('raw/')) setTab('sources')
  }, [])

  const rerun = async (taskId: string): Promise<void> => {
    setError(null)
    try {
      await useResearch.getState().rerun({ taskIds: [taskId] })
      useApp.getState().go('progress')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start. Please try again.')
    }
  }

  const sourceGroups = useMemo(() => {
    const groups = new Map<string, SourceSummary[]>()
    for (const s of sources) groups.set(s.group, [...(groups.get(s.group) ?? []), s])
    return SOURCE_GROUPS.filter((g) => groups.has(g)).map((g) => ({
      title: g,
      items: groups.get(g)!
    }))
  }, [sources])

  const placeholder = current?.startsWith('missing:') ? findNode(articles, current) : null

  return (
    <div className="flex h-full">
      <nav className="flex w-[280px] shrink-0 flex-col border-r" aria-label="Wiki">
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px]">Wiki</h2>
            {tab === 'articles' && articles && <TreeMenu tree={articles} />}
          </div>
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
                  setSelected(null)
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
        <div className="min-h-0 flex-1 overflow-y-auto px-2">
          {tab === 'articles' ? (
            articles && articles.sections.length ? (
              <ArticlesTree tree={articles} selectedId={current} onOpen={open} />
            ) : (
              loaded && (
                <p className="text-muted-foreground px-2 text-sm">
                  No articles yet. Run research to write them.
                </p>
              )
            )
          ) : (
            <>
              {[
                {
                  title: 'Add',
                  items: [{ path: 'files', title: 'Your files', tags: [] as string[] }]
                },
                ...sourceGroups
              ].map((g) => (
                <div key={g.title} className="mb-4">
                  <p className="eyebrow px-2 pb-1.5 text-[12px]">{g.title}</p>
                  <ul>
                    {g.items.map((s) => (
                      <li key={s.path}>
                        <button
                          type="button"
                          aria-current={current === s.path ? 'true' : undefined}
                          onClick={() => setSelected(s.path)}
                          className={cn(
                            'focus-visible:ring-ring/50 flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-[3px]',
                            current === s.path ? 'bg-accent text-primary' : 'hover:bg-secondary'
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">{s.title}</span>
                          {s.tags.includes('private') && (
                            <Lock
                              className="text-muted-foreground size-3 shrink-0"
                              strokeWidth={2}
                              aria-label="Private"
                            />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="border-t px-4 py-3">
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
        {current === PROFILE && <ProfilePane />}
        {current === 'files' && <FilesPane />}
        {current === SOCIAL && <SocialPane onRerun={() => void rerun('social-taglines')} />}
        {placeholder && (
          <PlaceholderPane
            node={placeholder}
            running={isActive(run)}
            onGenerate={(t) => void rerun(t)}
          />
        )}
        {current?.startsWith('wiki/') && current !== PROFILE && current !== SOCIAL && (
          <ArticleView key={current} path={current} onRerun={(t) => void rerun(t)} />
        )}
        {current?.startsWith('raw/') && (
          <DocView key={current} path={current} status="Source, read-only" />
        )}
      </section>
    </div>
  )
}

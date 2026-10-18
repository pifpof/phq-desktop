import { useEffect, useMemo, useState } from 'react'
import { Check, ClipboardPaste, FileUp, Library, X } from 'lucide-react'
import type { Affects, Change, ChangePage } from '@shared/changes'
import type { SourceNode } from '@shared/wiki-tree'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { api, ApiError, unwrap } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useChanges } from '@/store/changes'
import { useWikiNav } from '@/store/wiki-nav'
import { SourceIcon } from '@/features/wiki/tree-parts'

/** Text areas with a visible border and the focus ring (REQUIREMENTS-v3.1 3.2). */
export const FIELD =
  'border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full resize-y rounded-[10px] border bg-white px-3 py-2 text-[15px] leading-6 outline-none focus-visible:ring-[3px]'

interface Props {
  open: boolean
  onOpenChange(open: boolean): void
  /** Pages the change can be made on; the first is selected. */
  pages: string[]
  section?: string | null
  /** Prefilled "Change it to", such as a chat reply. */
  changeTo?: string
  /** Edit a waiting change instead of making a new one. */
  edit?: Change
}

interface Picked {
  path: string
  title: string
}

const flatSources = (tree: ReturnType<typeof useWikiNav.getState>['sources']): SourceNode[] =>
  (tree?.sections ?? []).flatMap((s) => [...s.sources, ...s.groups.flatMap((g) => g.sources)])

/** Make a change (REQUIREMENTS-v3.1 3.2, 3.3): what, why, change to, based on. Saved at once. */
export function MakeChangeDialog({
  open,
  onOpenChange,
  pages,
  section = null,
  changeTo = '',
  edit
}: Props) {
  const [step, setStep] = useState<'form' | 'saved'>('form')
  const [page, setPage] = useState(edit?.page ?? pages[0] ?? '')
  const [info, setInfo] = useState<ChangePage | null>(null)
  const [titles, setTitles] = useState<Map<string, string>>(new Map())
  const [what, setWhat] = useState<string>('')
  const [quote, setQuote] = useState('')
  const [why, setWhy] = useState('')
  const [to, setTo] = useState('')
  const [basedOn, setBasedOn] = useState<Picked[]>([])
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [picking, setPicking] = useState(false)
  const [search, setSearch] = useState('')
  const [affects, setAffects] = useState<Affects | null>(null)
  const [extra, setExtra] = useState<string[] | null>(null)
  const [editingAffects, setEditingAffects] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const sources = useWikiNav((s) => s.sources)
  const articles = useWikiNav((s) => s.articles)

  // Fresh form each time it opens (or for edit, the change as it is).
  useEffect(() => {
    if (!open) return
    /* eslint-disable react-hooks/set-state-in-effect -- reset when the dialog opens */
    setStep('form')
    setPage(edit?.page ?? pages[0] ?? '')
    setWhat(edit ? (edit.section ?? '') : (section ?? ''))
    setQuote(edit?.quote ?? '')
    setWhy(edit?.why ?? '')
    setTo(edit?.changeTo ?? changeTo.slice(0, 4000))
    setBasedOn(edit?.basedOn ?? [])
    setNotes('')
    setShowNotes(false)
    setPicking(false)
    setExtra(edit ? edit.affects.map((a) => a.slug) : null)
    setEditingAffects(false)
    setError(null)
    /* eslint-enable react-hooks/set-state-in-effect */
    if (!useWikiNav.getState().sources) void useWikiNav.getState().reloadTrees()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the dialog opens
  }, [open])

  // The page's sections and what it affects.
  useEffect(() => {
    if (!open || !page) return
    let cancelled = false
    void Promise.all([
      unwrap(api.changePage(page)).catch(() => null),
      unwrap(api.changeAffects(page)).catch(() => null),
      ...pages.map((p) => unwrap(api.changePage(p)).catch(() => null))
    ]).then(([p, a, ...all]) => {
      if (cancelled) return
      setInfo(p as ChangePage | null)
      setAffects(a as Affects | null)
      setTitles(
        new Map(
          (all as (ChangePage | null)[])
            .filter((x): x is ChangePage => !!x)
            .map((x) => [x.slug, x.title])
        )
      )
    })
    return () => {
      cancelled = true
    }
  }, [open, page, pages])

  const chosenAffects = extra ?? affects?.pages.map((p) => p.slug) ?? []
  const allPages = useMemo(() => {
    const out: { slug: string; title: string }[] = []
    const walk = (nodes: NonNullable<typeof articles>['sections'][number]['items']): void => {
      for (const n of nodes) {
        if (n.kind === 'article' && n.slug && !n.slug.startsWith('decision-'))
          out.push({ slug: n.slug, title: n.label })
        walk(n.children)
      }
    }
    for (const s of articles?.sections ?? []) walk(s.items)
    return out
  }, [articles])
  const titleOf = (slug: string): string =>
    affects?.pages.find((p) => p.slug === slug)?.title ??
    allPages.find((p) => p.slug === slug)?.title ??
    slug

  const pageTitle = info?.title ?? titles.get(page) ?? 'this page'
  const sectionInfo = info?.sections.find((s) => s.heading === what)
  const excerpt = sectionInfo?.excerpt || info?.sections[0]?.excerpt || ''
  // A short example from the founder's own page, never sample text.
  const example =
    excerpt.length <= 80 ? excerpt : `${excerpt.slice(0, excerpt.lastIndexOf(' ', 80))}...`
  const valid = why.trim().length >= 3 && to.trim().length >= 3 && !!page

  const save = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const input = {
      page,
      section: what || null,
      quote: quote.trim(),
      why: why.trim(),
      changeTo: to.trim(),
      basedOn: basedOn.map((b) => b.path),
      notes: showNotes ? notes.trim() : '',
      affects: chosenAffects
    }
    try {
      if (edit) await unwrap(api.updateChange(edit.id, input))
      else await unwrap(api.createChange(input))
      await useChanges.getState().load()
      if (edit) onOpenChange(false)
      else setStep('saved')
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not save the change. Please try again.'
      )
    } finally {
      setBusy(false)
    }
  }

  const another = (): void => {
    setStep('form')
    setWhat(section ?? '')
    setQuote('')
    setWhy('')
    setTo('')
    setBasedOn([])
    setNotes('')
    setShowNotes(false)
    setExtra(null)
  }

  const filtered = flatSources(sources).filter(
    (s) => !search.trim() || s.title.toLowerCase().includes(search.trim().toLowerCase())
  )
  const toggleSource = (s: Picked): void =>
    setBasedOn((b) =>
      b.some((x) => x.path === s.path) ? b.filter((x) => x.path !== s.path) : [...b, s]
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px] gap-0 p-0">
        {step === 'saved' ? (
          <div className="p-6">
            <DialogTitle className="flex items-center gap-2">
              <Check className="text-primary size-5" strokeWidth={2.2} />
              Change saved
            </DialogTitle>
            <DialogDescription className="mt-2 text-[15px]">
              It will be applied when you regenerate {pageTitle}.
            </DialogDescription>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button variant="outline" onClick={another}>
                Add another change
              </Button>
              <Button
                onClick={() => {
                  onOpenChange(false)
                  useApp.getState().openRegenerate(page)
                }}
              >
                Review and regenerate
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b px-6 pt-6 pb-4">
              <DialogTitle>
                {edit ? 'Edit the change to' : 'Make a change to'} {pageTitle}
              </DialogTitle>
              <DialogDescription className="mt-1.5">
                Tell us what to change. It&apos;s saved right away and applied the next time you
                regenerate this page.
              </DialogDescription>
            </div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {pages.length > 1 && !edit && (
                <div>
                  <Label htmlFor="change-page">Page</Label>
                  <select
                    id="change-page"
                    value={page}
                    onChange={(e) => {
                      setPage(e.target.value)
                      setWhat('')
                      setExtra(null)
                    }}
                    className={cn(FIELD, 'mt-1.5 h-10 resize-none py-0')}
                  >
                    {pages.map((p) => (
                      <option key={p} value={p}>
                        {titles.get(p) ?? p}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <Label htmlFor="change-what">What to change</Label>
                <select
                  id="change-what"
                  value={what}
                  onChange={(e) => setWhat(e.target.value)}
                  className={cn(FIELD, 'mt-1.5 h-10 resize-none py-0')}
                >
                  <option value="">The whole page</option>
                  {info?.sections.map((s) => (
                    <option key={s.heading} value={s.heading}>
                      {s.heading}
                    </option>
                  ))}
                </select>
                <textarea
                  aria-label="Quote the part you mean (optional)"
                  rows={2}
                  value={quote}
                  onChange={(e) => setQuote(e.target.value)}
                  placeholder={
                    example
                      ? `Quote the part you mean (optional). For example: "${example}"`
                      : 'Quote the part you mean (optional)'
                  }
                  className={cn(FIELD, 'mt-2 text-sm')}
                />
              </div>
              <div>
                <Label htmlFor="change-why">Why</Label>
                <textarea
                  id="change-why"
                  rows={3}
                  value={why}
                  onChange={(e) => setWhy(e.target.value)}
                  placeholder="What's wrong with it? For example: our buyers are heads of sales, not founders."
                  className={cn(FIELD, 'mt-1.5')}
                />
              </div>
              <div>
                <Label htmlFor="change-to">Change it to</Label>
                <textarea
                  id="change-to"
                  rows={4}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="What it should say or focus on instead. Rough notes are fine."
                  className={cn(FIELD, 'mt-1.5')}
                />
              </div>

              <div>
                <p className="text-sm font-medium">
                  Based on <span className="text-muted-foreground font-normal">(optional)</span>
                </p>
                <p className="text-muted-foreground mt-0.5 text-[13px]">
                  Evidence the regeneration should use. Files and notes you add stay private.
                </p>
                {basedOn.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {basedOn.map((b) => (
                      <li
                        key={b.path}
                        className="bg-secondary flex max-w-full items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-[13px]"
                      >
                        <span className="truncate">{b.title}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${b.title}`}
                          onClick={() => toggleSource(b)}
                          className="text-muted-foreground hover:text-foreground rounded-full p-0.5"
                        >
                          <X className="size-3" strokeWidth={2} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPicking((p) => !p)}>
                    <Library strokeWidth={1.8} />
                    Choose sources
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const added = await unwrap(api.addChangeFiles()).catch(() => [])
                      setBasedOn((b) => [
                        ...b,
                        ...added.filter((a) => !b.some((x) => x.path === a.path))
                      ])
                      void useWikiNav.getState().reloadTrees()
                    }}
                  >
                    <FileUp strokeWidth={1.8} />
                    Add a file
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowNotes((s) => !s)}>
                    <ClipboardPaste strokeWidth={1.8} />
                    Paste notes
                  </Button>
                </div>
                {picking && (
                  <div className="mt-2 rounded-xl border">
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search your sources"
                      aria-label="Search your sources"
                      className="w-full rounded-t-xl border-b px-3 py-2 text-sm outline-none"
                    />
                    <ul className="max-h-[200px] overflow-y-auto p-1">
                      {filtered.slice(0, 200).map((s) => {
                        const on = basedOn.some((b) => b.path === s.path)
                        return (
                          <li key={s.path}>
                            <label className="hover:bg-secondary flex cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1.5 text-sm">
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => toggleSource({ path: s.path, title: s.title })}
                                className="accent-primary"
                              />
                              <SourceIcon source={s} />
                              <span className="truncate">{s.title}</span>
                            </label>
                          </li>
                        )
                      })}
                      {!filtered.length && (
                        <li className="text-muted-foreground px-2 py-1.5 text-sm">
                          No sources match.
                        </li>
                      )}
                    </ul>
                  </div>
                )}
                {showNotes && (
                  <textarea
                    aria-label="Notes"
                    rows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Paste call notes, an email or anything else that backs this up. Saved as a private source."
                    className={cn(FIELD, 'mt-2 text-sm')}
                  />
                )}
              </div>

              <div>
                <p className="text-sm font-medium">Also affects</p>
                {!editingAffects ? (
                  <p className="text-muted-foreground mt-0.5 text-sm">
                    {[...chosenAffects.map(titleOf), ...(affects?.outputs ?? [])].join(', ') ||
                      'Only this page.'}{' '}
                    <button
                      type="button"
                      className="text-primary hover:text-primary-hover underline underline-offset-2"
                      onClick={() => setEditingAffects(true)}
                    >
                      Change
                    </button>
                  </p>
                ) : (
                  <div className="mt-1.5 rounded-xl border p-2">
                    <ul className="max-h-[180px] overflow-y-auto">
                      {allPages
                        .filter((p) => p.slug !== page)
                        .map((p) => (
                          <li key={p.slug}>
                            <label className="hover:bg-secondary flex cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1 text-sm">
                              <input
                                type="checkbox"
                                className="accent-primary"
                                checked={chosenAffects.includes(p.slug)}
                                onChange={(e) =>
                                  setExtra(
                                    e.target.checked
                                      ? [...chosenAffects, p.slug]
                                      : chosenAffects.filter((s) => s !== p.slug)
                                  )
                                }
                              />
                              {p.title}
                              {affects?.pages.some((a) => a.slug === p.slug) && (
                                <span className="text-muted-foreground text-[12px]">suggested</span>
                              )}
                            </label>
                          </li>
                        ))}
                    </ul>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1"
                      onClick={() => setEditingAffects(false)}
                    >
                      Done
                    </Button>
                  </div>
                )}
              </div>
              {error && (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t px-6 py-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={!valid || busy} onClick={() => void save()}>
                {edit ? 'Save' : 'Save change'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

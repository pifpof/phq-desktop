import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Check, Copy, FileText, Layers, PencilLine, RefreshCw } from 'lucide-react'
import { anchor } from '@shared/anchor'
import {
  PLAYBOOK_SECTION_ARTICLES,
  type ArticleSummary,
  type OutputVersion
} from '@shared/wiki-views'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { api, unwrap } from '@/lib/api'
import { isActive } from '@/lib/research'
import { useNow } from '@/lib/useNow'
import { useApp } from '@/store/app'
import { useDocs } from '@/store/docs'
import { useResearch } from '@/store/research'
import { DocBody, DocHeader, FileActions, withoutTitle } from '@/features/documents/DocParts'
import { useDoc } from '@/features/documents/useDoc'
import { TaskRow } from '@/features/research/TaskRow'
import { MakeChangeDialog } from '@/features/changes/MakeChangeDialog'

const CURRENT = 'current'

const versionOf = (d: { path: string }): number => Number(/-v(\d+)-/.exec(d.path)?.[1] ?? 0)

const generated = (fm: Record<string, unknown>): string => {
  // A bare date is a calendar day in the founder's time zone, not midnight UTC.
  const raw = typeof fm.created === 'string' ? fm.created : ''
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw)
  return Number.isNaN(t)
    ? ''
    : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Every version in output/, newest first. */
function useVersions(): OutputVersion[] {
  const [versions, setVersions] = useState<OutputVersion[]>([])
  useEffect(() => {
    const load = (): void => {
      void unwrap(api.listOutputs('positioning-playbook'))
        .catch(() => [])
        .then(setVersions)
    }
    load()
    return api.onWorkspaceChanged(({ paths }) => {
      if (paths.some((p) => p.startsWith('output/positioning-playbook-'))) load()
    })
  }, [])
  return versions
}

/** Section number to the paths of the articles it is built from. */
function useSectionArticles(): Map<number, ArticleSummary[]> {
  const [articles, setArticles] = useState<ArticleSummary[]>([])
  useEffect(() => {
    void unwrap(api.listArticles())
      .catch(() => [])
      .then(setArticles)
  }, [])
  return useMemo(() => {
    const out = new Map<number, ArticleSummary[]>()
    for (const [n, m] of Object.entries(PLAYBOOK_SECTION_ARTICLES)) {
      out.set(
        Number(n),
        articles.filter((a) => a.slug === m.slug || (m.prefix && a.slug.startsWith(m.prefix)))
      )
    }
    return out
  }, [articles])
}

/** True when the company profile or any user file changed after this version was written. */
function useOutOfDate(created: string | null): boolean {
  const [stale, setStale] = useState(false)
  useEffect(() => {
    if (!created) return
    const check = (): void => {
      void unwrap(api.changedSince(created))
        .then((r) => setStale(r.profile || r.inputs))
        .catch(() => setStale(false))
    }
    check()
    return api.onWorkspaceChanged(({ paths }) => {
      if (paths.some((p) => p.startsWith('raw/'))) check()
    })
  }, [created])
  // The profile is saved through the app, so re-check whenever it changes in the store.
  const profile = useApp((s) => s.profile)
  useEffect(() => {
    if (!created) return
    void unwrap(api.changedSince(created))
      .then((r) => setStale(r.profile || r.inputs))
      .catch(() => undefined)
  }, [profile, created])
  return created ? stale : false
}

/** Re-run playbook research (REQUIREMENTS-v2 4.2): writes the articles again. Costs money. */
function Regenerate({ label = 'Re-run playbook research' }: { label?: string }) {
  const run = useResearch((s) => s.run)
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isActive(run)}
      title={
        isActive(run)
          ? 'Research is running'
          : 'Research and write the playbook articles and the messaging analysis again'
      }
      onClick={async () => {
        await useResearch.getState().rerun({ preset: 'playbook' })
        useApp.getState().go('progress')
      }}
    >
      <RefreshCw strokeWidth={1.8} />
      {label}
    </Button>
  )
}

/** Reassemble (REQUIREMENTS-v2 4.2): the next version from the current articles. Free. */
function Reassemble({ onDone }: { onDone: () => void }) {
  const run = useResearch((s) => s.run)
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy || isActive(run)}
      title={
        isActive(run)
          ? 'Research is running'
          : 'Build a new version from your articles. No AI cost.'
      }
      onClick={async () => {
        setBusy(true)
        try {
          await unwrap(api.reassemble())
          await useDocs.getState().refresh()
          onDone()
        } finally {
          setBusy(false)
        }
      }}
    >
      <Layers strokeWidth={1.8} />
      {busy ? 'Reassembling...' : 'Reassemble'}
    </Button>
  )
}

export function PlaybookView() {
  const current = useDocs((s) => s.playbookPath)
  const loaded = useDocs((s) => s.loaded)
  const run = useResearch((s) => s.run)
  const now = useNow(isActive(run))
  const versions = useVersions()
  const [selected, setSelected] = useState(CURRENT)
  const [copied, setCopied] = useState(false)
  const sectionArticles = useSectionArticles()
  // The pages behind the section a change is being made to; null when closed.
  const [changing, setChanging] = useState<string[] | null>(null)
  // "Change this section" on the playbook's own headings maps to the articles behind it.
  const sectionAction = useMemo(
    () => ({
      label: 'Change this section',
      run: (heading: string) => {
        const n = Number(/^Section (\d+)/.exec(heading)?.[1])
        const slugs = (sectionArticles.get(n) ?? []).map((a) => a.slug)
        if (slugs.length) setChanging(slugs)
      }
    }),
    [sectionArticles]
  )
  const path = selected === CURRENT ? current : selected
  const { doc } = useDoc(path)
  const isCurrent = selected === CURRENT
  const created =
    isCurrent && doc && typeof doc.frontMatter.created === 'string' ? doc.frontMatter.created : null
  const stale = useOutOfDate(created)

  const sections = useMemo(
    () =>
      doc
        ? [...doc.body.matchAll(/^##\s+(Section (\d+):.+)$/gm)].map((m) => ({
            text: m[1].trim(),
            n: Number(m[2]),
            id: anchor(m[1].trim())
          }))
        : [],
    [doc]
  )

  if (!loaded) return null

  if (!current) {
    if (isActive(run) && run) {
      return (
        <div className="mx-auto max-w-[560px] px-6 py-16">
          <h2>Your playbook is being written</h2>
          <p className="lede mt-3">It appears here as soon as all seven sections are done.</p>
          <ul className="mt-6 divide-y rounded-xl border px-4">
            {run.tasks
              .filter((t) => t.stage === 4)
              .map((t) => (
                <TaskRow key={t.id} task={t} now={now} />
              ))}
          </ul>
          <Button
            variant="outline"
            className="mt-6"
            onClick={() => useApp.getState().go('progress')}
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
  if (doc === undefined) return null
  if (doc === null) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
        This version is missing. It may have been moved or deleted.
      </div>
    )
  }

  const v = versionOf({ path: path ?? '' })
  const status = [
    `Version ${v}`,
    generated(doc.frontMatter) && `Generated ${generated(doc.frontMatter)}`,
    'Draft',
    !isCurrent && 'Older version'
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DocHeader title={doc.title} subtitle={status}>
        {versions.length > 1 && (
          <div className="mr-1 w-[190px]">
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger aria-label="Version" className="h-8 text-sm" />
              <SelectContent>
                <SelectItem value={CURRENT}>Current version</SelectItem>
                {versions.map((ver) => (
                  <SelectItem key={ver.path} value={ver.path}>
                    Version {ver.version}
                    {ver.date ? `, ${generated({ created: ver.date })}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            if (!path) return
            await api.copyDoc(path)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <Check strokeWidth={1.8} /> : <Copy strokeWidth={1.8} />}
          {copied ? 'Copied' : 'Copy as markdown'}
        </Button>
        {path && <FileActions path={path} />}
        {isCurrent && <Reassemble onDone={() => setSelected(CURRENT)} />}
        {isCurrent && <Regenerate />}
      </DocHeader>

      {stale && (
        <div
          className="bg-accent flex shrink-0 items-center justify-between gap-4 border-b px-6 py-2.5"
          role="status"
        >
          <p className="text-sm">
            Your company profile or files changed after this version was written. The playbook is
            out of date.
          </p>
          <Regenerate />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1000px] gap-10 px-6 py-8">
          {sections.length > 0 && (
            <nav
              className="sticky top-8 hidden w-[180px] shrink-0 self-start lg:block"
              aria-label="Sections"
            >
              <p className="eyebrow">Contents</p>
              <ol className="mt-3 space-y-1.5 text-sm">
                {sections.map((s) => (
                  <li key={s.id} className="group">
                    <a
                      href={`#${s.id}`}
                      onClick={(e) => {
                        e.preventDefault()
                        document
                          .getElementById(s.id)
                          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }}
                      className="text-muted-foreground hover:text-primary block leading-snug"
                    >
                      {s.text.replace(/^Section \d+:\s*/, '')}
                    </a>
                    <span className="mt-0.5 flex gap-2 text-[12px]">
                      {(sectionArticles.get(s.n) ?? []).slice(0, 1).map((a) => (
                        <button
                          key={a.path}
                          type="button"
                          title="Edit the source article"
                          className="text-primary hover:text-primary-hover inline-flex items-center gap-1"
                          onClick={() => useApp.getState().openWikiFile(a.path)}
                        >
                          <FileText className="size-3" strokeWidth={1.8} />
                          Source
                        </button>
                      ))}
                      <button
                        type="button"
                        title="Change this section"
                        className="text-primary hover:text-primary-hover inline-flex items-center gap-1"
                        disabled={!(sectionArticles.get(s.n) ?? []).length}
                        onClick={() =>
                          setChanging((sectionArticles.get(s.n) ?? []).map((a) => a.slug))
                        }
                      >
                        <PencilLine className="size-3" strokeWidth={1.8} />
                        Change
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <article className="max-w-[720px] min-w-0 flex-1">
            <DocBody doc={doc} body={withoutTitle(doc)} sectionAction={sectionAction} />
          </article>
        </div>
      </div>
      {changing && changing.length > 0 && (
        <MakeChangeDialog open onOpenChange={(o) => !o && setChanging(null)} pages={changing} />
      )}
    </div>
  )
}

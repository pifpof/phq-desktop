import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Check, Copy, RefreshCw } from 'lucide-react'
import { anchor } from '@shared/anchor'
import type { DocMeta } from '@shared/workspace'
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

const CURRENT = 'current'

const versionOf = (d: { path: string; frontMatter: Record<string, unknown> }): number =>
  typeof d.frontMatter.version === 'number'
    ? d.frontMatter.version
    : Number(/-v(\d+)-/.exec(d.path)?.[1] ?? 0)

const generated = (fm: Record<string, unknown>): string => {
  const t = typeof fm.created === 'string' ? Date.parse(fm.created) : NaN
  return Number.isNaN(t)
    ? ''
    : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function useVersions(): DocMeta[] {
  const [versions, setVersions] = useState<DocMeta[]>([])
  useEffect(() => {
    const load = (): void => {
      void unwrap(api.listDocs('memory/positioning-playbook/versions'))
        .catch(() => [])
        .then((v) => setVersions(v.sort((a, b) => versionOf(b) - versionOf(a))))
    }
    load()
    return api.onWorkspaceChanged(({ paths }) => {
      if (paths.some((p) => p.startsWith('memory/positioning-playbook/versions/'))) load()
    })
  }, [])
  return versions
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
      if (paths.some((p) => p.startsWith('inputs/'))) check()
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

function Regenerate({ label = 'Regenerate' }: { label?: string }) {
  const run = useResearch((s) => s.run)
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isActive(run)}
      title={
        isActive(run)
          ? 'Research is running'
          : 'Write the seven sections and the messaging analysis again'
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

export function PlaybookView() {
  const current = useDocs((s) => s.playbookPath)
  const loaded = useDocs((s) => s.loaded)
  const run = useResearch((s) => s.run)
  const now = useNow(isActive(run))
  const versions = useVersions()
  const [selected, setSelected] = useState(CURRENT)
  const [copied, setCopied] = useState(false)
  const path = selected === CURRENT ? current : selected
  const { doc } = useDoc(path)
  const isCurrent = selected === CURRENT
  const created =
    isCurrent && doc && typeof doc.frontMatter.created === 'string' ? doc.frontMatter.created : null
  const stale = useOutOfDate(created)

  const sections = useMemo(
    () =>
      doc
        ? [...doc.body.matchAll(/^##\s+(Section \d+:.+)$/gm)].map((m) => ({
            text: m[1].trim(),
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

  const v = versionOf(doc) || versionOf({ path: path ?? '', frontMatter: {} })
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
                    Version {versionOf(ver)}
                    {generated(ver.frontMatter) ? `, ${generated(ver.frontMatter)}` : ''}
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
          <Regenerate label="Regenerate playbook" />
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
                  <li key={s.id}>
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
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <article className="max-w-[720px] min-w-0 flex-1">
            <DocBody doc={doc} body={withoutTitle(doc)} />
          </article>
        </div>
      </div>
    </div>
  )
}

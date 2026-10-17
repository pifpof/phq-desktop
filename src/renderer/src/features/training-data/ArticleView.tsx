import { useCallback, useEffect, useState } from 'react'
import { Lock, RotateCcw, Scale } from 'lucide-react'
import type { ArticleDetail } from '@shared/wiki-views'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/Markdown'
import { api, unwrap } from '@/lib/api'
import { isActive } from '@/lib/research'
import { useApp } from '@/store/app'
import { useResearch } from '@/store/research'
import { DocHeader, FileActions } from '@/features/documents/DocParts'
import { RecordDecisionDialog } from '@/features/decisions/RecordDecisionDialog'

/** A neutral badge: facts about the article, not calls to action. */
const QUIET = 'border-border bg-secondary text-foreground font-medium'

const formatDate = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Title, abstract and sections; the app's own See Also and Sources are shown below instead. */
const mainBody = (body: string): string =>
  body
    .replace(/^#\s+.*\n+/, '')
    .replace(/\n## (See Also|Sources)\n[\s\S]*?(?=\n## |$)/g, '\n')
    .trim()

export function useArticle(path: string): {
  detail: ArticleDetail | null | undefined
  reload: () => void
} {
  const [detail, setDetail] = useState<ArticleDetail | null | undefined>(undefined)
  const load = useCallback(() => {
    void unwrap(api.getArticle(path))
      .then(setDetail)
      .catch(() => setDetail(null))
  }, [path])
  useEffect(() => {
    load()
    return api.onWorkspaceChanged(({ paths }) => {
      if (paths.includes(path)) load()
    })
  }, [load, path])
  return { detail, reload: load }
}

/** A wiki article (REQUIREMENTS-v2 4.1): badges, body, Sources, Linked from, actions. */
export function ArticleView({
  path,
  onRerun
}: {
  path: string
  onRerun: (taskId: string) => void
}) {
  const { detail } = useArticle(path)
  const run = useResearch((s) => s.run)
  const [deciding, setDeciding] = useState(false)
  const open = useCallback((p: string) => useApp.getState().openWikiFile(p), [])

  if (detail === undefined) return null
  if (detail === null)
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
        This article is missing. It may have been moved or deleted.
      </div>
    )
  const a = detail.article
  const confidence = a.confidence
    ? `${a.confidence[0].toUpperCase()}${a.confidence.slice(1)} confidence`
    : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DocHeader
        title={a.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            {confidence && <Badge className={QUIET}>{confidence}</Badge>}
            {a.volatility && (
              <Badge className={QUIET}>
                Changes{' '}
                {a.volatility === 'hot'
                  ? 'often'
                  : a.volatility === 'warm'
                    ? 'sometimes'
                    : 'rarely'}
              </Badge>
            )}
            {a.verified && <span>Checked {formatDate(a.verified)}</span>}
            {a.private && (
              <Badge className={`${QUIET} gap-1`}>
                <Lock className="size-3" strokeWidth={2} />
                Private
              </Badge>
            )}
          </span>
        }
      >
        {detail.taskId && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isActive(run)}
            title={isActive(run) ? 'Research is running' : 'Research this article again'}
            onClick={() => onRerun(detail.taskId!)}
          >
            <RotateCcw strokeWidth={1.8} />
            Re-run
          </Button>
        )}
        {!a.slug.startsWith('decision-') && (
          <Button variant="ghost" size="sm" onClick={() => setDeciding(true)}>
            <Scale strokeWidth={1.8} />
            Record a decision
          </Button>
        )}
        <FileActions path={path} />
      </DocHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <article className="mx-auto max-w-[760px] px-6 py-8">
          <Markdown docPath={path} onWikiLink={open}>
            {mainBody(detail.body)}
          </Markdown>

          {detail.sources.length > 0 && (
            <section className="mt-10 border-t pt-6">
              <h3 className="text-[17px]">Sources</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {detail.sources.map((s) => (
                  <li key={s.path}>
                    {s.exists ? (
                      <button
                        type="button"
                        className="text-primary hover:text-primary-hover text-left underline underline-offset-2"
                        onClick={() => open(s.path)}
                      >
                        {s.title}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">{s.title} (missing)</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {detail.backlinks.length > 0 && (
            <section className="mt-8">
              <h3 className="text-[17px]">Linked from</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {detail.backlinks.map((b) => (
                  <li key={b.path}>
                    <button
                      type="button"
                      className="text-primary hover:text-primary-hover text-left underline underline-offset-2"
                      onClick={() => open(b.path)}
                    >
                      {b.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
      </div>
      <RecordDecisionDialog
        open={deciding}
        onOpenChange={setDeciding}
        affects={[a.slug]}
        onRecorded={open}
      />
    </div>
  )
}

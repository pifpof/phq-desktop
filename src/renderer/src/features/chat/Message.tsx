import { memo, useState } from 'react'
import { PencilLine, RotateCcw } from 'lucide-react'
import { isRetryable } from '@shared/errors'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/Markdown'
import type { Message as Msg } from '@/store/chat'
import { useApp } from '@/store/app'
import { MakeChangeDialog } from '@/features/changes/MakeChangeDialog'
import { useWikiNav } from '@/store/wiki-nav'
import type { TreeNode } from '@shared/wiki-tree'

const fmt = new Intl.NumberFormat('en-US')

const open = (path: string): void => useApp.getState().openWikiFile(path)

/** Wiki paths the answer cites (`wiki/topics/x.md`) become links that open the article. */
export const linkWikiPaths = (md: string): string =>
  md.replace(
    /(`?)(\b(?:wiki|raw|output)\/[a-z0-9/_.-]+\.md)\1(?!\))/g,
    (_m, _tick: string, path: string) => `[${path}](${path})`
  )

interface Props {
  message: Msg
  canRetry: boolean
  onRetry: () => void
}

export const Message = memo(function Message({ message: m, canRetry, onRetry }: Props) {
  // The pages a change from this reply can be made on; null when the dialog is closed.
  const [changePages, setChangePages] = useState<string[] | null>(null)
  const openChange = async (): Promise<void> => {
    const slug = (p: string): string => p.split('/').pop()!.replace(/\.md$/, '')
    const cited = (m.sources ?? [])
      .map((s) => s.path)
      .filter((p) => p.startsWith('wiki/') && !slug(p).startsWith('decision-'))
      .map(slug)
    if (cited.length) return setChangePages([...new Set(cited)])
    // Nothing cited: the founder picks from every page.
    if (!useWikiNav.getState().articles) await useWikiNav.getState().reloadTrees()
    const all: string[] = []
    const walk = (nodes: TreeNode[]): void => {
      for (const n of nodes) {
        if (n.kind === 'article' && n.slug && !n.slug.startsWith('decision-')) all.push(n.slug)
        walk(n.children)
      }
    }
    for (const s of useWikiNav.getState().articles?.sections ?? []) walk(s.items)
    setChangePages(all)
  }
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-secondary max-w-[85%] rounded-xl px-4 py-3 break-words whitespace-pre-wrap">
          {m.content}
        </div>
      </div>
    )
  }

  const waiting = m.status === 'streaming' && !m.content
  return (
    <div className="min-w-0 break-words">
      {waiting && (
        <div className="flex h-6 items-center gap-1" role="status" aria-label="Thinking">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="bg-primary-light size-1.5 animate-pulse rounded-full"
              style={{ animationDelay: `${i * 160}ms` }}
            />
          ))}
        </div>
      )}
      {m.content && (
        <div aria-live={m.status === 'streaming' ? 'polite' : 'off'}>
          <Markdown docPath="answer.md" onWikiLink={open}>
            {linkWikiPaths(m.content)}
          </Markdown>
        </div>
      )}
      {m.status === 'stopped' && (
        <p className="text-muted-foreground mt-2 text-[13px] font-semibold">Stopped</p>
      )}
      {m.status !== 'streaming' && m.sources && m.sources.length > 0 && (
        <p className="text-muted-foreground mt-3 text-[13px]">
          Answered from:{' '}
          {m.sources.map((src, i) => (
            <span key={src.path}>
              {i > 0 && ', '}
              <button
                type="button"
                className="hover:text-primary underline underline-offset-2"
                onClick={() => open(src.path)}
              >
                {src.title}
              </button>
            </span>
          ))}
        </p>
      )}
      {m.status === 'done' && (
        <div className="text-muted-foreground mt-2 flex items-center gap-3 text-[13px]">
          {m.usage && (
            <span>
              {fmt.format(m.usage.inputTokens)} in · {fmt.format(m.usage.outputTokens)} out
            </span>
          )}
          {/* REQUIREMENTS-v3.1 3.1: a reply's suggestion becomes a change to a cited page. */}
          <button
            type="button"
            className="hover:text-primary inline-flex items-center gap-1"
            onClick={() => void openChange()}
          >
            <PencilLine className="size-3.5" strokeWidth={1.8} />
            Make this a change
          </button>
        </div>
      )}
      {changePages && (
        <MakeChangeDialog
          open
          onOpenChange={(o) => !o && setChangePages(null)}
          pages={changePages}
          changeTo={m.content}
        />
      )}
      {m.status === 'error' && m.error && (
        <div
          role="alert"
          className="border-destructive/30 mt-2 flex items-center justify-between gap-4 rounded-[10px] border bg-white px-4 py-3"
        >
          <p className="text-destructive text-sm">{m.error.message}</p>
          {canRetry && isRetryable(m.error.code) && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RotateCcw strokeWidth={1.8} />
              Retry
            </Button>
          )}
        </div>
      )}
    </div>
  )
})

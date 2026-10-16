import { useCallback, useEffect, useState } from 'react'
import { FileText, FolderOpen } from 'lucide-react'
import type { Doc } from '@shared/workspace'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/Markdown'
import { api, unwrap } from '@/lib/api'
import { useApp } from '@/store/app'

function lastUpdated(doc: Doc): string {
  const created =
    typeof doc.frontMatter.created === 'string' ? Date.parse(doc.frontMatter.created) : NaN
  // An edit in another editor is newer than the generated date.
  const when = Number.isNaN(created) ? doc.mtime : Math.max(created, doc.mtime)
  return new Date(when).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

/** A markdown document from the workspace, with its title, date and editor actions. Refreshes when the file changes on disk. */
export function DocView({ path, status }: { path: string; status?: string }) {
  const [doc, setDoc] = useState<Doc | null | undefined>(undefined)
  const revealLabel = useApp((s) => s.state?.revealLabel ?? 'Show in Finder')

  const load = useCallback(() => unwrap(api.readDoc(path)).catch(() => null), [path])

  useEffect(() => {
    let cancelled = false
    void load().then((d) => !cancelled && setDoc(d))
    const off = api.onWorkspaceChanged(({ paths }) => {
      if (paths.includes(path)) void load().then((d) => !cancelled && setDoc(d))
    })
    return () => {
      cancelled = true
      off()
    }
  }, [path, load])

  if (doc === undefined) return null
  if (doc === null) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
        This document is missing. It may have been moved or deleted.
      </div>
    )
  }

  // The header shows the title, so a matching first H1 in the body is not repeated.
  const body = doc.body.replace(/^\s*#\s+(.+)\n/, (line, h1: string) =>
    h1.trim() === doc.title.trim() ? '' : line
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b px-6 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-[17px]">{doc.title}</h2>
          <p className="text-muted-foreground text-[13px]">
            {status ? `${status} · ` : ''}Last updated {lastUpdated(doc)}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="sm" onClick={() => void api.openDoc(path)}>
            <FileText strokeWidth={1.8} />
            Open in editor
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void api.revealDoc(path)}>
            <FolderOpen strokeWidth={1.8} />
            {revealLabel}
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <article className="mx-auto max-w-[760px] px-6 py-8">
          <Markdown>{body}</Markdown>
        </article>
      </div>
    </div>
  )
}

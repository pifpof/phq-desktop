import { useCallback, useState, type ReactNode } from 'react'
import { FileText, FolderOpen } from 'lucide-react'
import type { Doc } from '@shared/workspace'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@/components/ui/dialog'
import { Markdown, type SectionAction } from '@/components/Markdown'
import { api } from '@/lib/api'
import { useApp } from '@/store/app'
import { docSources } from './useDoc'

export function DocHeader({
  title,
  subtitle,
  children
}: {
  title: string
  subtitle?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-6 py-3">
      <div className="min-w-0">
        <h2 className="truncate text-[17px]">{title}</h2>
        {subtitle && <p className="text-muted-foreground text-[13px]">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">{children}</div>
    </header>
  )
}

/** Open in editor and Show in Finder (or Explorer, or file manager). */
export function FileActions({ path }: { path: string }) {
  const revealLabel = useApp((s) => s.state?.revealLabel ?? 'Show in Finder')
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => void api.openDoc(path)}>
        <FileText strokeWidth={1.8} />
        Open in editor
      </Button>
      <Button variant="ghost" size="sm" onClick={() => void api.revealDoc(path)}>
        <FolderOpen strokeWidth={1.8} />
        {revealLabel}
      </Button>
    </>
  )
}

/** The document's markdown. Its sources open in the browser after a one-time confirmation. */
export function DocBody({
  doc,
  body,
  sectionAction
}: {
  doc: Doc
  body?: string
  sectionAction?: SectionAction
}) {
  const allowed = useApp((s) => s.state?.openResearchLinks ?? false)
  const [pending, setPending] = useState<string | null>(null)
  const sources = docSources(doc)

  const onSource = useCallback(
    (url: string) => {
      if (allowed) void api.openSource(url, doc.path)
      else setPending(url)
    },
    [allowed, doc.path]
  )

  const confirm = async (): Promise<void> => {
    const url = pending
    setPending(null)
    await api.allowResearchLinks()
    await useApp.getState().refresh()
    if (url) await api.openSource(url, doc.path)
  }

  return (
    <>
      <Markdown sources={sources} onSource={onSource} onSectionAction={sectionAction}>
        {body ?? doc.body}
      </Markdown>
      <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="max-w-[460px]">
          <DialogTitle>Open external links from research?</DialogTitle>
          <DialogDescription className="mt-2">
            These links point to websites PositioningHQ found while researching. They open in your
            browser. We will not ask again.
          </DialogDescription>
          <p className="text-muted-foreground mt-3 text-[13px] break-all">{pending}</p>
          <div className="mt-6 flex justify-end gap-3">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={() => void confirm()}>Open links</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** The header shows the title, so a matching first H1 in the body is not repeated. */
export function withoutTitle(doc: Doc, body = doc.body): string {
  return body.replace(/^\s*#\s+(.+)\n/, (line, h1: string) =>
    h1.trim() === doc.title.trim() ? '' : line
  )
}

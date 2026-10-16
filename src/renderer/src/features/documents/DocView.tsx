import type { ReactNode } from 'react'
import { DocBody, DocHeader, FileActions, withoutTitle } from './DocParts'
import { docDate, useDoc } from './useDoc'

interface Props {
  path: string
  status?: string
  /** Extra header buttons, such as Re-run. */
  actions?: ReactNode
  /** Shown above the document, such as a missing-file notice. */
  before?: ReactNode
}

/** A markdown document from the workspace, with its title, date, sources and editor actions. */
export function DocView({ path, status, actions, before }: Props) {
  const { doc } = useDoc(path)
  if (doc === undefined) return null
  if (doc === null) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
        This document is missing. It may have been moved or deleted.
      </div>
    )
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DocHeader
        title={doc.title}
        subtitle={`${status ? `${status} · ` : ''}Last updated ${docDate(doc)}`}
      >
        {actions}
        <FileActions path={path} />
      </DocHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <article className="mx-auto max-w-[760px] px-6 py-8">
          {before}
          <DocBody doc={doc} body={withoutTitle(doc)} />
        </article>
      </div>
    </div>
  )
}

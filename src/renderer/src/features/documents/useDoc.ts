import { useCallback, useEffect, useState } from 'react'
import type { Doc } from '@shared/workspace'
import { api, unwrap } from '@/lib/api'

/** A workspace document, reloaded when the file changes on disk (an edit in Obsidian shows up within a second). */
export function useDoc(path: string | null): { doc: Doc | null | undefined; reload: () => void } {
  const [doc, setDoc] = useState<Doc | null | undefined>(undefined)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!path) return
    let cancelled = false
    const load = (): void => {
      void unwrap(api.readDoc(path))
        .catch(() => null)
        .then((d) => !cancelled && setDoc(d))
    }
    load()
    const off = api.onWorkspaceChanged(({ paths }) => {
      if (paths.includes(path)) load()
    })
    return () => {
      cancelled = true
      off()
    }
  }, [path, tick])

  return { doc: path ? doc : null, reload }
}

export function docDate(doc: Doc): string {
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

export const docSources = (doc: Doc): string[] =>
  Array.isArray(doc.frontMatter.sources)
    ? doc.frontMatter.sources.filter((s): s is string => typeof s === 'string')
    : []

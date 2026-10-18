import { useMemo } from 'react'
import type { SourceNode, SourcesTree } from '@shared/wiki-tree'
import { useApp } from '@/store/app'
import { useWikiNav } from '@/store/wiki-nav'
import { DocView } from '@/features/documents/DocView'

function findSource(tree: SourcesTree | null, path: string): SourceNode | null {
  for (const s of tree?.sections ?? []) {
    const hit =
      s.sources.find((x) => x.path === path) ??
      s.groups.flatMap((g) => g.sources).find((x) => x.path === path)
    if (hit) return hit
  }
  return null
}

/** A raw source in the reader, read-only, with the articles that cite it (REQUIREMENTS-v3 3.4). */
export function SourceView({ path }: { path: string }) {
  const tree = useWikiNav((s) => s.sources)
  const source = useMemo(() => findSource(tree, path), [tree, path])
  const citedBy = source?.citedBy ?? []
  return (
    <DocView
      key={path}
      path={path}
      status="Source, read-only"
      before={
        <section aria-label="Cited by" className="bg-muted mb-8 rounded-xl border px-4 py-3">
          <h3 className="eyebrow text-[12px]">Cited by</h3>
          {citedBy.length ? (
            <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {citedBy.map((c) => (
                <li key={c.path}>
                  <button
                    type="button"
                    onClick={() => useApp.getState().openWikiFile(c.path)}
                    className="text-primary hover:text-primary-hover text-left underline underline-offset-2"
                  >
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground mt-1 text-sm">
              No article cites this source yet. The research may not have needed it.
            </p>
          )}
        </section>
      }
    />
  )
}

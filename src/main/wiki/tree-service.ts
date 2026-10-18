import type { SourcesTree, WikiTree } from '@shared/wiki-tree'
import { readProvenance } from '../state/provenance'
import { scanWiki, type ScanCache } from './scan'
import { buildSourcesTree } from './sources-tree'
import { buildArticleTree, type Generated } from './tree'

/**
 * Builds and caches the Wiki pane's trees per workspace (REQUIREMENTS-v3 5). A change in the
 * wiki marks them stale; the next request re-reads only the files whose time or size changed.
 */

export interface WikiTrees {
  articles: WikiTree
  sources: SourcesTree
}

export interface WikiTreeService {
  get(root: string): Promise<WikiTrees>
  /** Call with the workspace paths that changed. True when the trees are affected. */
  invalidate(paths: string[]): boolean
}

const AFFECTS = /^(raw|wiki|output)\//

export function createWikiTreeService(): WikiTreeService {
  const scans = new Map<string, ScanCache>()
  let built: { root: string; trees: Promise<WikiTrees> } | null = null

  const build = async (root: string): Promise<WikiTrees> => {
    const cache = scans.get(root) ?? new Map()
    scans.set(root, cache)
    const [files, provenance] = await Promise.all([scanWiki(root, cache), readProvenance(root)])
    const generated: Record<string, Generated> = {}
    for (const [path, entry] of Object.entries(provenance)) {
      const at = Date.parse(entry.at)
      if (!Number.isNaN(at)) generated[path] = { at, runId: entry.runId }
    }
    return { articles: buildArticleTree({ files, generated }), sources: buildSourcesTree(files) }
  }

  return {
    get(root) {
      if (built?.root !== root) {
        // One workspace at a time: drop what another one cached.
        for (const r of scans.keys()) if (r !== root) scans.delete(r)
        const trees = build(root)
        built = { root, trees }
        trees.catch(() => {
          if (built?.trees === trees) built = null
        })
      }
      return built.trees
    },
    invalidate(paths) {
      if (!paths.some((p) => AFFECTS.test(p))) return false
      built = null
      return true
    }
  }
}

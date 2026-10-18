import { relative } from 'path'
import { watch, type FSWatcher } from 'chokidar'
import { toPosix } from './paths'

export interface WorkspaceWatcher {
  /** Start watching a workspace (or stop with null). Replaces any previous watch. */
  watch(root: string | null): void
  close(): Promise<void>
}

/**
 * Watches the wiki (raw/, wiki/, output/, inbox/) and, for a v1 workspace waiting to convert,
 * memory/ and inputs/. Debounced 300ms. Picks up edits made in Obsidian or any editor.
 */
const WATCHED = ['raw', 'wiki', 'output', 'inbox', 'memory', 'inputs']
export function createWorkspaceWatcher(
  onChange: (paths: string[]) => void,
  debounceMs = 300
): WorkspaceWatcher {
  let watcher: FSWatcher | null = null
  let timer: NodeJS.Timeout | undefined
  const pending = new Set<string>()

  const close = async (): Promise<void> => {
    clearTimeout(timer)
    pending.clear()
    const w = watcher
    watcher = null
    await w?.close()
  }

  return {
    watch(root) {
      void close().then(() => {
        if (!root) return
        const w = watch(
          WATCHED.map((d) => `${root}/${d}`),
          {
            ignoreInitial: true,
            ignored: (p) => /(^|[/\\])\.[^/\\]+/.test(relative(root, p)),
            awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 }
          }
        )
        const push = (p: string): void => {
          pending.add(toPosix(relative(root, p)))
          clearTimeout(timer)
          timer = setTimeout(() => {
            const paths = [...pending]
            pending.clear()
            onChange(paths)
          }, debounceMs)
        }
        w.on('add', push)
          .on('change', push)
          .on('unlink', push)
          .on('addDir', push)
          .on('unlinkDir', push)
        w.on('error', () => undefined)
        watcher = w
      })
    },
    close
  }
}

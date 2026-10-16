import { mkdir, readdir, readFile, rename, writeFile } from 'fs/promises'
import { join } from 'path'
import { RunViewSchema, type RunView } from '@shared/research'

const dir = (root: string): string => join(root, '.positioninghq', 'runs')

/** Writes .positioninghq/runs/<run_id>.json atomically (temp file, then rename). */
export async function saveRun(root: string, run: RunView): Promise<void> {
  await mkdir(dir(root), { recursive: true })
  const file = join(dir(root), `${run.id}.json`)
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify(run, null, 2))
  await rename(tmp, file)
}

export async function loadRun(root: string, id: string): Promise<RunView | null> {
  try {
    const parsed = RunViewSchema.safeParse(
      JSON.parse(await readFile(join(dir(root), `${id}.json`), 'utf8'))
    )
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** The most recently started run, or null. Corrupt files are ignored. */
export async function latestRun(root: string): Promise<RunView | null> {
  let names: string[]
  try {
    names = (await readdir(dir(root))).filter((n) => n.endsWith('.json'))
  } catch {
    return null
  }
  const runs = (
    await Promise.all(names.map((n) => loadRun(root, n.replace(/\.json$/, ''))))
  ).filter((r): r is RunView => r !== null)
  return runs.sort((a, b) => b.startedAt - a.startedAt)[0] ?? null
}

export const isUnfinished = (run: RunView): boolean =>
  run.status === 'running' || run.status === 'paused'

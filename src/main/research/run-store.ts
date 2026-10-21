import { mkdir, readdir, readFile, rename, writeFile } from 'fs/promises'
import { join } from 'path'
import { RunViewSchema, type RunView } from '@shared/research'
import { stateDir } from '../state/app-state'

/** Run files live in app state, outside the wiki (REQUIREMENTS-v2 2.1). */
const dir = async (root: string): Promise<string> => join(await stateDir(root), 'runs')

/** Writes <state>/runs/<run_id>.json atomically (temp file, then rename). */
export async function saveRun(root: string, run: RunView): Promise<void> {
  const d = await dir(root)
  await mkdir(d, { recursive: true })
  const file = join(d, `${run.id}.json`)
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify(run, null, 2))
  await rename(tmp, file)
}

export async function loadRun(root: string, id: string): Promise<RunView | null> {
  try {
    const parsed = RunViewSchema.safeParse(
      JSON.parse(await readFile(join(await dir(root), `${id}.json`), 'utf8'))
    )
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Every run, newest first. Corrupt files are ignored. */
export async function listRuns(root: string): Promise<RunView[]> {
  let names: string[]
  try {
    // run files only, not <id>.sources.json
    names = (await readdir(await dir(root))).filter((n) => /^[^.]+\.json$/.test(n))
  } catch {
    return []
  }
  const runs = (
    await Promise.all(names.map((n) => loadRun(root, n.replace(/\.json$/, ''))))
  ).filter((r): r is RunView => r !== null)
  return runs.sort((a, b) => b.startedAt - a.startedAt)
}

/** The most recently started run, or null. */
export async function latestRun(root: string): Promise<RunView | null> {
  return (await listRuns(root))[0] ?? null
}

export const isUnfinished = (run: RunView): boolean =>
  run.status === 'running' || run.status === 'paused'

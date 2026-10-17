import { readFile } from 'fs/promises'
import { join } from 'path'
import { stateDir, writeJsonAtomic } from './app-state'

/**
 * provenance.json (REQUIREMENTS-v2 2.1): how each generated file was made. The wiki carries only
 * spec front matter and a log line; generator details (task, run, model, inputs) live here.
 */

export interface ProvenanceEntry {
  task: string
  runId: string
  model: string
  /** ISO date-time. */
  at: string
  /** Wiki-relative paths (and drafts paths) the task was shown. */
  inputs: string[]
  /** sha256 of the file as written, so the app can tell when someone has edited it since. */
  hash?: string
}

type Provenance = Record<string, ProvenanceEntry>

/** Serialises writes: tasks run in parallel and each adds entries. */
const queues = new Map<string, Promise<unknown>>()

async function load(file: string): Promise<Provenance> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Provenance
  } catch {
    return {}
  }
}

export async function recordProvenance(
  root: string,
  entries: Record<string, ProvenanceEntry>
): Promise<void> {
  const file = join(await stateDir(root), 'provenance.json')
  const prev = queues.get(file) ?? Promise.resolve()
  const next = prev.then(async () => {
    const data = await load(file)
    Object.assign(data, entries)
    await writeJsonAtomic(file, data)
  })
  queues.set(
    file,
    next.catch(() => undefined)
  )
  await next
}

export async function readProvenance(root: string): Promise<Provenance> {
  return load(join(await stateDir(root), 'provenance.json'))
}

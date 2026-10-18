import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { RegenJobSchema, type KeepResult, type RegenJob, type RegenReview } from '@shared/regen'
import { stateDir, writeJsonAtomic } from '../state/app-state'
import { contentHash, recordHistory, saveGenerated } from '../state/history'
import { readProvenance, recordProvenance, type ProvenanceEntry } from '../state/provenance'
import { setChangeStatus } from '../wiki/changes'
import { parseDoc, stringField } from '../wiki/frontmatter'
import { writeIndexes } from '../wiki/index-gen'
import { appendLog } from '../wiki/log'
import { isoDay, safeJoin } from '../wiki/paths'
import { addBacklinks, sha256, type PreparedFile } from './article-output'

/**
 * A regeneration in progress or waiting for review (REQUIREMENTS-v3.1 4.3, 5). Its articles are
 * staged in app state; the wiki changes only when the founder keeps the result. One at a time.
 */

const jobPath = async (root: string): Promise<string> => join(await stateDir(root), 'regen-job.json')
const stagingDir = async (root: string, runId: string): Promise<string> =>
  join(await stateDir(root), 'staging', runId)

interface Manifest {
  files: { rel: string; task: string }[]
  createdRaw: string[]
  inputs: string[]
}

export async function readJob(root: string): Promise<RegenJob | null> {
  try {
    const parsed = RegenJobSchema.safeParse(JSON.parse(await readFile(await jobPath(root), 'utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function saveJob(root: string, job: RegenJob): Promise<void> {
  await writeJsonAtomic(await jobPath(root), job)
}

async function readManifest(root: string, runId: string): Promise<Manifest> {
  try {
    return JSON.parse(
      await readFile(join(await stagingDir(root, runId), 'manifest.json'), 'utf8')
    ) as Manifest
  } catch {
    return { files: [], createdRaw: [], inputs: [] }
  }
}

/** Called by the executor instead of writing to the wiki. */
export async function stageFiles(
  root: string,
  runId: string,
  r: {
    task: string
    files: PreparedFile[]
    report: { id: string; applied: 'yes' | 'partly' | 'no'; note?: string }[]
    createdRaw: string[]
    inputs: string[]
  }
): Promise<void> {
  const dir = await stagingDir(root, runId)
  const manifest = await readManifest(root, runId)
  for (const f of r.files) {
    const path = join(dir, 'files', ...f.path.split('/'))
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, f.text)
    manifest.files = [...manifest.files.filter((x) => x.rel !== f.path), { rel: f.path, task: r.task }]
  }
  manifest.createdRaw.push(...r.createdRaw)
  manifest.inputs = [...new Set([...manifest.inputs, ...r.inputs])]
  await mkdir(dir, { recursive: true })
  await writeJsonAtomic(join(dir, 'manifest.json'), manifest)
  const job = await readJob(root)
  if (job?.runId !== runId) return
  const names = new Map(job.changes.map((c) => [c.id, c.name]))
  await saveJob(root, {
    ...job,
    files: manifest.files.map((x) => ({
      rel: x.rel,
      title: stringField(parseDoc(r.files.find((f) => f.path === x.rel)?.text ?? '')?.data.title) ||
        job.files.find((j) => j.rel === x.rel)?.title ||
        x.rel.split('/').pop()!.replace(/\.md$/, '')
    })),
    report: r.report.length
      ? r.report.map((e) => ({
          id: e.id,
          name: names.get(e.id) ?? e.id,
          applied: e.applied,
          note: e.note ?? ''
        }))
      : job.report
  })
}

/** The run ended: ready for review when something was staged. */
export async function finishRun(
  root: string,
  runId: string,
  outcome: { ok: boolean; costUsd: number }
): Promise<RegenJob | null> {
  const job = await readJob(root)
  if (job?.runId !== runId || job.status !== 'running') return job
  const next: RegenJob = {
    ...job,
    costUsd: outcome.costUsd,
    status: outcome.ok && job.files.length ? 'review' : 'failed'
  }
  await saveJob(root, next)
  return next
}

/** Before and after for each staged file. */
export async function reviewJob(root: string): Promise<RegenReview | null> {
  const job = await readJob(root)
  if (!job || job.status !== 'review') return null
  const dir = await stagingDir(root, job.runId)
  const files: RegenReview['files'] = []
  for (const f of job.files) {
    const after = await readFile(join(dir, 'files', ...f.rel.split('/')), 'utf8').catch(() => null)
    if (after === null) continue
    const before = await readFile(safeJoin(root, f.rel), 'utf8').catch(() => null)
    files.push({ rel: f.rel, title: f.title, before, after })
  }
  return { job, files }
}

export interface KeepDeps {
  model: string
  date?: string
}

/** Keep (REQUIREMENTS-v3.1 5): staged articles replace the wiki's, changes are marked applied. */
export async function keepJob(root: string, d: KeepDeps): Promise<KeepResult> {
  const review = await reviewJob(root)
  if (!review) throw new Error('There is nothing to keep.')
  const { job, files } = review
  const date = d.date ?? isoDay()
  const manifest = await readManifest(root, job.runId)
  const written: string[] = []
  const entries: Record<string, ProvenanceEntry> = {}
  for (const f of files) {
    await mkdir(dirname(safeJoin(root, f.rel)), { recursive: true })
    await writeFile(safeJoin(root, f.rel), f.after)
    written.push(f.rel)
    entries[f.rel] = {
      task: manifest.files.find((x) => x.rel === f.rel)?.task ?? job.taskId,
      runId: job.runId,
      model: d.model,
      at: new Date().toISOString(),
      inputs: manifest.inputs,
      hash: sha256(f.after),
      contentHash: contentHash(f.after)
    }
    await saveGenerated(root, f.rel, f.after)
  }
  await recordProvenance(root, entries)
  await addBacklinks(root, written)
  await recordHistory(root, {
    runId: job.runId,
    page: job.page,
    at: new Date().toISOString(),
    files: files.map((f) => ({ rel: f.rel, before: f.before, after: f.after })),
    changes: job.report.filter((r) => r.applied !== 'no').map((r) => r.id)
  })

  // Changes the model applied (fully or partly) are now decisions; "no" ones stay waiting.
  const applied: string[] = []
  const notApplied: string[] = []
  for (const r of job.report) {
    if (r.applied === 'no') {
      notApplied.push(r.name)
      continue
    }
    await setChangeStatus(root, r.id, 'applied', job.page, date).catch(() => undefined)
    applied.push(r.id)
  }
  const replacedBy = applied[0]
  if (replacedBy)
    for (const id of job.replaces)
      await setChangeStatus(root, id, 'replaced', replacedBy, date).catch(() => undefined)

  await appendLog(
    root,
    'regenerate',
    `${job.pageTitle} applying ${applied.length} ${applied.length === 1 ? 'change' : 'changes'}`,
    date
  )
  await writeIndexes(root)
  await rm(await stagingDir(root, job.runId), { recursive: true, force: true })
  await saveJob(root, { ...job, status: 'kept' })
  return { written, applied, notApplied, next: job.queue[0] ?? null }
}

/** Discard (REQUIREMENTS-v3.1 5): nothing in the wiki changes; changes stay waiting. */
export async function discardJob(root: string): Promise<void> {
  const job = await readJob(root)
  if (!job || (job.status !== 'review' && job.status !== 'failed')) return
  const manifest = await readManifest(root, job.runId)
  // Sources a refreshed web search saved during this run go too, unless something cites them.
  const provenance = await readProvenance(root)
  const cited = new Set(Object.values(provenance).flatMap((e) => e.inputs))
  for (const rel of manifest.createdRaw)
    if (!cited.has(rel)) await rm(safeJoin(root, rel), { force: true }).catch(() => undefined)
  if (manifest.createdRaw.length) await writeIndexes(root)
  await rm(await stagingDir(root, job.runId), { recursive: true, force: true })
  await saveJob(root, { ...job, status: 'discarded' })
}

import { mkdir, readdir, readFile, rename, stat, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import matter from 'gray-matter'
import type { Profile } from '@shared/profile'
import { ProviderError, type Provider } from '../providers/types'
import { INPUT_CATEGORIES } from '@shared/workspace'
import { resolveInside, toPosix } from '../workspace/paths'
import { finalizeDocument } from './postprocess'
import { costOf, type Pricing } from './pricing'
import { buildPrompt, type PromptDocument, type SkillReader } from './prompt-builder'
import type { LocalHandler, TaskContext, TaskDef, TaskOutcome } from './types'

/** Most document text one task is shown, as characters (about 4 per token). Keeps a task inside the context window. */
export const MAX_DOCUMENT_CHARS = 600_000

export interface LocalArgs {
  root: string
  profile: Profile
  runId: string
  signal: AbortSignal
  task: TaskDef
}
export type LocalRunner = (args: LocalArgs) => Promise<Partial<TaskOutcome> & { output: string }>

export interface ExecutorDeps {
  root: string
  profile: Profile
  runId: string
  /** File-name-safe company name. */
  company: string
  model: string
  provider: Provider
  /** Called for each task so a key removed mid-run is noticed. */
  getKey(): string | null
  pricing: Pricing
  readSkill: SkillReader
  local: Partial<Record<LocalHandler, LocalRunner>>
  /** Task lookup, for outputs of groups and path functions. */
  tasks: TaskDef[]
}

export function makeContext(
  d: Pick<ExecutorDeps, 'root' | 'profile' | 'runId' | 'company' | 'tasks'>
): TaskContext {
  const ctx: TaskContext = {
    profile: d.profile,
    runId: d.runId,
    company: d.company,
    async readOutput(taskId) {
      const t = d.tasks.find((x) => x.id === taskId)
      if (!t) return null
      const rel = t.output(ctx)
      const full = resolveInside(d.root, rel)
      if (!full) return null
      try {
        return matter(await readFile(full, 'utf8')).content
      } catch {
        return null
      }
    }
  }
  return ctx
}

async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

async function mdFiles(root: string, rel: string): Promise<string[]> {
  try {
    return (await readdir(join(root, rel)))
      .filter((n) => n.endsWith('.md') && n !== 'index.md')
      .sort()
      .map((n) => `${rel}/${n}`)
  } catch {
    return []
  }
}

async function readDocument(root: string, rel: string): Promise<PromptDocument | null> {
  const full = resolveInside(root, rel)
  if (!full) return null
  try {
    return { path: toPosix(rel), content: matter(await readFile(full, 'utf8')).content.trim() }
  } catch {
    return null
  }
}

/** The documents an earlier task's output stands for: one file, a folder of files, or a crawl's index and pages. */
export async function documentsFor(
  root: string,
  task: TaskDef,
  ctx: TaskContext
): Promise<PromptDocument[]> {
  const rel = task.output(ctx)
  const full = resolveInside(root, rel)
  if (!full) return []
  const paths: string[] = []
  if (await isDir(full)) paths.push(...(await mdFiles(root, rel)))
  else {
    paths.push(rel)
    if (task.local === 'crawl') {
      const pages = await mdFiles(root, `${dirname(rel)}/pages`)
      // The home page first, then the rest in a stable order.
      paths.push(
        ...pages.sort((a, b) => Number(/\/home\.md$/.test(b)) - Number(/\/home\.md$/.test(a)))
      )
    }
  }
  const docs = await Promise.all(paths.map((p) => readDocument(root, p)))
  return docs.filter((d): d is PromptDocument => d !== null && d.content.length > 0)
}

/** Extracted text of the user's files in these categories. Only ever given to tasks with no web tools. */
export async function userFileDocuments(
  root: string,
  categories: string[]
): Promise<PromptDocument[]> {
  const out: PromptDocument[] = []
  for (const cat of INPUT_CATEGORIES) {
    if (!categories.includes(cat)) continue
    for (const rel of await mdFiles(root, `memory/research/inputs-extracted/${cat}`)) {
      const d = await readDocument(root, rel)
      if (d) out.push(d)
    }
  }
  return out
}

/** Cuts the documents to fit the budget, shortening the last one that fits and naming what was left out. */
export function fitDocuments(
  docs: PromptDocument[],
  maxChars = MAX_DOCUMENT_CHARS
): PromptDocument[] {
  const out: PromptDocument[] = []
  let used = 0
  let dropped = 0
  for (const d of docs) {
    const room = maxChars - used
    if (room <= 500) {
      dropped++
      continue
    }
    if (d.content.length > room) {
      out.push({ path: d.path, content: `${d.content.slice(0, room)}\n\n[Shortened to fit.]` })
      used = maxChars
    } else {
      out.push(d)
      used += d.content.length
    }
  }
  if (dropped)
    out.push({ path: 'note.md', content: `${dropped} more document(s) were left out to fit.` })
  return out
}

async function writeAtomic(root: string, rel: string, text: string): Promise<void> {
  const full = resolveInside(root, rel)
  if (!full) throw new Error('Output path is outside the workspace')
  await mkdir(dirname(full), { recursive: true })
  const tmp = `${full}.tmp`
  await writeFile(tmp, text)
  await rename(tmp, full)
}

/** Runs one task: local handlers on this computer, AI tasks through the provider. */
export function createExecutor(
  d: ExecutorDeps
): (task: TaskDef, signal: AbortSignal) => Promise<TaskOutcome> {
  const ctx = makeContext(d)

  const runLocal = async (
    name: LocalHandler,
    task: TaskDef,
    signal: AbortSignal
  ): Promise<TaskOutcome> => {
    const handler = d.local[name]
    if (!handler) throw new Error('This step is not available yet.')
    const r = await handler({ root: d.root, profile: d.profile, runId: d.runId, signal, task })
    return { costUsd: 0, ...r }
  }

  return async (task, signal) => {
    if (task.local) return runLocal(task.local, task, signal)

    const key = d.getKey()
    if (!key) {
      throw new ProviderError('invalid_key')
    }

    // Defence in depth: the graph is checked when a run starts, and again here.
    const categories = task.inputs?.inputCategories ?? []
    if (task.web && categories.length) throw new Error('A web task must not be shown user files.')

    const docs: PromptDocument[] = []
    for (const id of [...(task.inputs?.outputs ?? []), ...(task.inputs?.optionalOutputs ?? [])]) {
      const source = d.tasks.find((t) => t.id === id)
      if (source) docs.push(...(await documentsFor(d.root, source, ctx)))
    }
    if (categories.length) docs.push(...(await userFileDocuments(d.root, categories)))
    const documents = fitDocuments(docs)

    const { system, user } = buildPrompt(
      {
        skill: task.skill!,
        rules: task.rules,
        asset: task.asset,
        profile: d.profile,
        documents,
        instruction: task.instruction!,
        web: task.web !== false,
        cacheDocuments: task.cacheDocuments
      },
      d.readSkill
    )

    const result = await d.provider.runTask({
      key,
      model: d.model,
      system,
      user,
      tools: task.web
        ? { webSearch: task.web.search, ...(task.web.fetch ? { webFetch: task.web.fetch } : {}) }
        : {},
      signal
    })
    if (!result.text.trim()) throw new Error('The model returned no text.')

    const rel = task.output(ctx)
    await writeAtomic(
      d.root,
      rel,
      finalizeDocument({
        title: task.title,
        task: task.id,
        runId: d.runId,
        model: d.model,
        body: result.text,
        inputs: documents.map((x) => x.path),
        web: task.web !== false,
        citations: result.citations,
        consulted: result.consulted,
        truncated: result.truncated
      })
    )

    let note = result.truncated ? 'The output was cut off at the length limit.' : undefined
    if (task.after) {
      const after = await runLocal(task.after, task, signal)
      note ??= after.note
    }
    return {
      costUsd: costOf(d.pricing, d.model, result.usage).usd,
      usage: result.usage,
      output: rel,
      note
    }
  }
}

/** On resume: a finished task counts only if its output file is still there and marked with a status. */
export function outputVerifier(
  root: string,
  ctx: TaskContext
): (task: TaskDef) => Promise<boolean> {
  return async (task) => {
    const full = resolveInside(root, task.output(ctx))
    if (!full) return false
    try {
      if (await isDir(full)) return (await mdFiles(root, task.output(ctx))).length > 0
      const fm = matter(await readFile(full, 'utf8')).data
      return typeof fm.status === 'string'
    } catch {
      return false
    }
  }
}

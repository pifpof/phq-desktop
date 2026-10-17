import { mkdir, readdir, readFile, rename, stat, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import matter from 'gray-matter'
import type { Profile } from '@shared/profile'
import { ProviderError, type Provider, type WebSource } from '../providers/types'
import { INPUT_CATEGORIES } from '@shared/workspace'
import { resolveInside, toPosix } from '../workspace/paths'
import { finalizeDocument, replaceEmDashes, stripOuterFence } from './postprocess'
import { normalizeSourceUrl, sourceTagger, type RunSources } from '../ingest/citations-to-raw'
import { MAX_TOKENS_PER_FILE } from '../ingest/extract'
import { categoryTag } from '../ingest/files-to-raw'
import { recordProvenance, type ProvenanceEntry } from '../state/provenance'
import { parseDoc, stringifyDoc, stringList } from '../wiki/frontmatter'
import { writeIndexes } from '../wiki/index-gen'
import { appendLog } from '../wiki/log'
import { freeRel, isoDay, nextOutputVersion, outputRel, rawRel, safeJoin } from '../wiki/paths'
import { scanWiki } from '../wiki/scan'
import { parseSocialTable } from '@shared/social'
import {
  ARTICLE_TOOL,
  addBacklinks,
  loadArticles,
  loadRaw,
  sha256,
  ToolOutputSchema,
  validateOutput,
  writePrepared,
  type ArticleTargets,
  type ValidationResult
} from './article-output'
import { costOf, type Pricing } from './pricing'
import {
  buildPrompt,
  type ArticleBrief,
  type PromptDocument,
  type SkillReader
} from './prompt-builder'
import type { LocalHandler, TaskContext, TaskDef, TaskOutcome } from './types'
import { specFor } from '../wiki/article-map'
import { linkedSlugs } from '../wiki/links'

/** Most document text one task is shown, as characters (about 4 per token). Keeps a task inside the context window. */
export const MAX_DOCUMENT_CHARS = 600_000
/** Output budget for article tasks: several articles in one tool call. */
export const ARTICLE_MAX_TOKENS = 16_000

export interface LocalArgs {
  /** The run's drafts folder in app state (task documents not in wiki format). */
  root: string
  /** The wiki: raw sources, articles and outputs are written here. */
  wikiRoot: string
  sources: RunSources
  profile: Profile
  runId: string
  model: string
  signal: AbortSignal
  task: TaskDef
}
export type LocalRunner = (args: LocalArgs) => Promise<Partial<TaskOutcome> & { output: string }>

export interface ExecutorDeps {
  /** Drafts folder in app state: run drafts and receipts. */
  root: string
  /** The wiki folder. */
  wikiRoot: string
  /** This run's cited pages, one raw file per URL. */
  sources: RunSources
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
  /** YYYY-MM-DD for files written by this run. Defaults to today. */
  today?: string
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

/** A wiki file as a prompt document, labelled with its wiki path and the raw files behind it. */
export async function readWikiDocument(
  wikiRoot: string,
  rel: string,
  articles?: Map<string, string[]>
): Promise<PromptDocument | null> {
  try {
    const doc = parseDoc(await readFile(safeJoin(wikiRoot, rel), 'utf8'))
    if (!doc) return null
    const content = doc.body.trim()
    if (!content) return null
    const isPrivate = stringList(doc.data.tags).includes('private')
    let rawSources: string[]
    if (rel.startsWith('raw/')) rawSources = [rel]
    else if (rel.startsWith('output/'))
      // An output cites articles: citing it stands for their raw sources.
      rawSources = stringList(doc.data.sources).flatMap((a) => articles?.get(a) ?? [])
    else rawSources = stringList(doc.data.sources)
    return { path: rel, content, rawSources, private: isPrivate }
  } catch {
    return null
  }
}

/** A run draft (or a receipt, expanded into the wiki files it lists). */
async function readDraft(root: string, wikiRoot: string, rel: string): Promise<PromptDocument[]> {
  const full = resolveInside(root, rel)
  if (!full) return []
  let parsed: matter.GrayMatterFile<string>
  try {
    parsed = matter(await readFile(full, 'utf8'))
  } catch {
    return []
  }
  // A receipt (even an empty one) stands for the wiki files it lists, never for itself.
  if (Array.isArray(parsed.data.written)) {
    const written = stringList(parsed.data.written)
    const sourcesOf = new Map(
      (await scanWiki(wikiRoot))
        .filter((f) => f.kind === 'article')
        .map((f) => [f.rel, stringList(f.data?.sources)])
    )
    const docs = await Promise.all(written.map((w) => readWikiDocument(wikiRoot, w, sourcesOf)))
    return docs.filter((d): d is PromptDocument => d !== null)
  }
  const content = parsed.content.trim()
  if (!content) return []
  return [
    {
      path: toPosix(rel),
      content,
      rawSources: [...stringList(parsed.data.raw_sources), ...stringList(parsed.data.raw_pages)]
    }
  ]
}

/**
 * The documents an earlier task's output stands for: a draft, a folder of drafts, or the wiki
 * files a receipt lists. Web tasks get only the crawl's index, not its pages: it keeps prompts
 * that pay for search results small, and the index is all they need.
 */
export async function documentsFor(
  root: string,
  task: TaskDef,
  ctx: TaskContext,
  options: { pages: boolean; wikiRoot: string }
): Promise<PromptDocument[]> {
  const rel = task.output(ctx)
  const full = resolveInside(root, rel)
  if (!full) return []
  const paths: string[] = []
  if (await isDir(full)) paths.push(...(await mdFiles(root, rel)))
  else paths.push(rel)
  const docs: PromptDocument[] = []
  for (const p of paths) docs.push(...(await readDraft(root, options.wikiRoot, p)))
  // The crawl's pages are raw sources in the wiki; its index (a draft) lists them.
  if (task.local === 'crawl' && options.pages) {
    const index = await readFile(full, 'utf8').catch(() => '')
    const pages = stringList(matter(index).data.raw_pages)
    const home = (p: string): number => Number(/-home(-\d+)?\.md$/.test(p))
    for (const p of [...pages].sort((a, b) => home(b) - home(a))) {
      const d = await readWikiDocument(options.wikiRoot, p)
      if (d) docs.push(d)
    }
  }
  return docs
}

/**
 * The person's files (raw sources tagged private) in these categories, plus any added without a
 * category. Only ever given to tasks with no web tools. Each is cut to the per-file budget.
 */
export async function userFileDocuments(
  wikiRoot: string,
  categories: string[]
): Promise<PromptDocument[]> {
  const wanted = new Set(
    INPUT_CATEGORIES.filter((c) => categories.includes(c)).map((c) => categoryTag(c))
  )
  const allTags = new Set(INPUT_CATEGORIES.map((c) => categoryTag(c)))
  const max = MAX_TOKENS_PER_FILE * 4
  const out: PromptDocument[] = []
  for (const f of await scanWiki(wikiRoot)) {
    if (f.kind !== 'raw') continue
    const tags = stringList(f.data?.tags)
    if (!tags.includes('private')) continue
    const cats = tags.filter((t) => allTags.has(t))
    if (cats.length && !cats.some((t) => wanted.has(t))) continue
    const content = f.body.trim()
    if (!content) continue
    out.push({
      path: f.rel,
      rawSources: [f.rel],
      private: true,
      content:
        content.length > max
          ? `${content.slice(0, max)}\n\n[Truncated: only the first ${MAX_TOKENS_PER_FILE.toLocaleString('en-US')} tokens are included.]`
          : content
    })
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
      out.push({ ...d, content: `${d.content.slice(0, room)}\n\n[Shortened to fit.]` })
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

/** The list of wiki files an article or output task wrote, kept with the run's drafts. */
export async function writeReceipt(
  root: string,
  rel: string,
  r: { task: string; runId: string; written: string[]; note?: string; warnings?: string[] }
): Promise<void> {
  await writeAtomic(
    root,
    rel,
    matter.stringify(`Written by ${r.task}:\n\n${r.written.map((w) => `- ${w}`).join('\n')}\n`, {
      task: r.task,
      run_id: r.runId,
      status: 'draft',
      created: new Date().toISOString(),
      written: r.written,
      ...(r.note ? { note: r.note } : {}),
      // What validation dropped or kept as text: for the person, and for debugging prompts.
      ...(r.warnings?.length ? { warnings: r.warnings.slice(0, 50) } : {})
    })
  )
}

const ARTICLE_DESCRIPTIONS: Record<string, string> = {
  'company-overview': 'brand, history, size, HQ, mission',
  'product-overview': 'offerings, features, tech, evolution, unique value',
  'market-segment': 'industry, position, size, trends',
  'customer-segment': 'customer profiles, sizes, industries, geography, use cases, named clients',
  'recent-developments': 'the last 12 months: launches, funding, leadership, awards',
  'market-position-summary': 'the research Market Overview synthesis',
  'market-overview': 'playbook section 1: why now, shifts, landscape, sweet spot',
  'ideal-customer-profile':
    'playbook section 2: ICP formula, attributes, jobs, pains and gains, alternatives, triggers',
  'competitive-landscape':
    'playbook section 6: market map, momentum, how to win against each competitor',
  'current-messaging':
    'how the company positions itself today: hero, category claim, claims, proof shown, tone',
  'positioning-statement':
    'playbook section 5: the six-field statement and three message variations',
  'value-drivers': 'short index: the three drivers, one line each, linking to each',
  'value-driver-':
    'one per driver: challenge, status quo, cost of inaction, advantage, future state, proof, discovery prompts',
  'moat-':
    'one per distinct advantage: what it is, why it is hard to copy, why customers care, proof, discovery prompts',
  strengths: 'research step 05',
  weaknesses: 'research step 06',
  'competitor-':
    'one competitor: firmographics, value proposition, product and pricing, go-to-market, strengths and weaknesses',
  'proof-points': 'playbook section 7: sentiment, evidence table, verified quotes',
  'social-taglines': 'table of network, URL, tagline or bio, source, status'
}

function brief(
  targets: ArticleTargets,
  existing: Awaited<ReturnType<typeof loadArticles>>
): ArticleBrief {
  const describe = (t: string): string => {
    const slug = t.endsWith('*') ? `${t.slice(0, -1)}<x>` : t
    const spec = specFor(t.endsWith('*') ? `${t.slice(0, -1)}x` : t)
    const key = t.endsWith('*') ? t.slice(0, -1) : t
    return `${slug} (${spec?.category ?? 'reference'}): ${ARTICLE_DESCRIPTIONS[key] ?? spec?.title ?? ''}`
  }
  const prefixes = [...targets.allowed, ...(targets.patches ?? [])]
  const touches = (slug: string): boolean =>
    prefixes.some((t) => (t.endsWith('*') ? slug.startsWith(t.slice(0, -1)) : slug === t))
  const decisions = [...existing.values()]
    .filter((a) => a.slug.startsWith('decision-'))
    .filter(
      (a) => linkedSlugs(a.path, a.body).some(touches) || stringList(a.data.tags).some(touches)
    )
    .map((a) => ({ path: a.path, content: a.body.trim() }))
  return {
    writes: targets.allowed.map(describe),
    required: targets.required.map((r) =>
      r.endsWith('*') ? `at least one ${r.slice(0, -1)}<x>` : r
    ),
    patches: (targets.patches ?? []).flatMap((p) =>
      [...existing.keys()].filter((s) => (p.endsWith('*') ? s.startsWith(p.slice(0, -1)) : s === p))
    ),
    existing: [...existing.values()]
      .filter((a) => !a.slug.startsWith('decision-'))
      .map((a) => `${a.slug}: ${a.title}`),
    decisions
  }
}

/** Social profile notes (REQUIREMENTS-v2 3.3, T8): one raw note per profile found. */
export async function writeSocialNotes(
  wikiRoot: string,
  table: string,
  date: string
): Promise<string[]> {
  const out: string[] = []
  for (const row of parseSocialTable(table)) {
    if (!row.found || !/^https?:\/\//i.test(row.url) || !row.tagline.trim()) continue
    const network =
      row.network
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'social'
    const rel = await freeRel(wikiRoot, rawRel('notes', date, `social-${network}`))
    const text = replaceEmDashes(row.tagline.replace(/\s+/g, ' ').trim())
    await writeFile(
      safeJoin(wikiRoot, rel),
      stringifyDoc(
        'raw',
        {
          title: `${row.network} profile`,
          source: row.url,
          type: 'notes',
          ingested: date,
          tags: ['social', network],
          summary: `The company's ${row.network} tagline or bio, as found during research.`
        },
        `# ${row.network} profile\n\nURL: ${row.url}\n\nTagline or bio:\n\n> ${text}\n\nFound via: ${row.source || 'research'}.`
      ),
      { flag: 'wx' }
    )
    out.push(rel)
  }
  return out
}

/** Runs one task: local handlers on this computer, AI tasks through the provider. */
export function createExecutor(
  d: ExecutorDeps
): (task: TaskDef, signal: AbortSignal) => Promise<TaskOutcome> {
  const ctx = makeContext(d)
  const today = (): string => d.today ?? isoDay()

  const runLocal = async (
    name: LocalHandler,
    task: TaskDef,
    signal: AbortSignal
  ): Promise<TaskOutcome> => {
    const handler = d.local[name]
    if (!handler) throw new Error('This step is not available yet.')
    const r = await handler({
      root: d.root,
      wikiRoot: d.wikiRoot,
      sources: d.sources,
      profile: d.profile,
      runId: d.runId,
      model: d.model,
      signal,
      task
    })
    return { costUsd: 0, ...r }
  }

  const provenance = async (paths: string[], task: TaskDef, inputs: string[]): Promise<void> => {
    const entries: Record<string, ProvenanceEntry> = {}
    for (const p of paths) {
      const text = await readFile(safeJoin(d.wikiRoot, p), 'utf8').catch(() => '')
      entries[p] = {
        task: task.id,
        runId: d.runId,
        model: d.model,
        at: new Date().toISOString(),
        inputs,
        hash: sha256(text)
      }
    }
    await recordProvenance(d.wikiRoot, entries)
  }

  return async (task, signal) => {
    if (task.local) return runLocal(task.local, task, signal)

    const key = d.getKey()
    if (!key) throw new ProviderError('invalid_key')

    // Defence in depth: the graph is checked when a run starts, and again here.
    const categories = task.inputs?.inputCategories ?? []
    if (task.web && categories.length) throw new Error('A web task must not be shown user files.')

    const docs: PromptDocument[] = []
    for (const id of [...(task.inputs?.outputs ?? []), ...(task.inputs?.optionalOutputs ?? [])]) {
      const source = d.tasks.find((t) => t.id === id)
      if (source)
        docs.push(
          ...(await documentsFor(d.root, source, ctx, {
            pages: task.web === false,
            wikiRoot: d.wikiRoot
          }))
        )
    }
    if (categories.length) docs.push(...(await userFileDocuments(d.wikiRoot, categories)))
    if (task.rawTags?.length) {
      for (const f of await scanWiki(d.wikiRoot)) {
        const tags = stringList(f.data?.tags)
        if (f.kind !== 'raw' || tags.includes('private')) continue
        if (!tags.some((t) => task.rawTags!.includes(t)) || !f.body.trim()) continue
        docs.push({ path: f.rel, content: f.body.trim(), rawSources: [f.rel] })
      }
    }
    const documents = fitDocuments(docs)

    // The private tag is the isolation boundary (REQUIREMENTS-v2 3.3): a web task may not be shown
    // anything whose source chain reaches a private file.
    const raw = await loadRaw(d.wikiRoot)
    const sawPrivate = documents.some(
      (doc) =>
        doc.private || (doc.rawSources ?? []).some((p) => raw.get(p)?.tags.includes('private'))
    )
    if (task.web && sawPrivate) throw new Error('A web task must not be shown private material.')

    const writes = task.writes
    const existing = writes?.kind === 'articles' ? await loadArticles(d.wikiRoot) : new Map()
    // A task that only adds to existing articles has nothing to do when there are none (for
    // example, competitor profiles were skipped because web search was unavailable).
    if (writes?.kind === 'articles' && !writes.targets.allowed.length) {
      const patchable = brief(writes.targets, existing).patches ?? []
      if (!patchable.length) {
        const note = 'Nothing to add to: no matching articles exist yet.'
        await writeReceipt(d.root, task.output(ctx), {
          task: task.id,
          runId: d.runId,
          written: [],
          note
        })
        return { costUsd: 0, output: task.output(ctx), note }
      }
    }
    const { system, user } = buildPrompt(
      {
        skill: task.skill!,
        rules: task.rules,
        asset: task.asset,
        profile: d.profile,
        documents,
        instruction: task.instruction!,
        web: task.web !== false,
        cacheDocuments: task.cacheDocuments,
        ...(writes?.kind === 'articles' ? { articles: brief(writes.targets, existing) } : {})
      },
      d.readSkill
    )

    const tools = {
      ...(task.web
        ? { webSearch: task.web.search, ...(task.web.fetch ? { webFetch: task.web.fetch } : {}) }
        : {}),
      ...(writes?.kind === 'articles' ? { output: ARTICLE_TOOL } : {})
    }
    const maxTokens = writes?.kind === 'articles' ? ARTICLE_MAX_TOKENS : undefined
    const call = (extra?: string) =>
      d.provider.runTask({
        key,
        model: d.model,
        system,
        user: extra ? [...user, { text: extra }] : user,
        tools,
        maxTokens,
        signal
      })

    let result = await call()
    let costUsd = costOf(d.pricing, d.model, result.usage).usd
    const inputPaths = documents.map((x) => x.path)

    // Citation ingest (REQUIREMENTS-v2 3.1). Pages the model lists as sources count when a search
    // or fetch in this task really returned them; they become raw citation records too.
    const ingest = async (r: typeof result): Promise<Map<string, string>> => {
      if (!task.web) return new Map()
      const returned = new Map(
        [...r.consulted, ...r.sources].map((c) => [normalizeSourceUrl(c.url), c.title])
      )
      const bySource = new Map<string, WebSource>(
        r.sources.map((s) => [normalizeSourceUrl(s.url), { ...s, excerpts: [...s.excerpts] }])
      )
      const out = ToolOutputSchema.safeParse(r.output ?? {})
      const listed = out.success
        ? [
            ...out.data.articles.flatMap((a) => a.sources),
            ...out.data.patches.flatMap((p) => p.sources)
          ]
        : []
      for (const s of listed) {
        if (!/^https?:\/\//i.test(s.ref.trim())) continue
        const url = normalizeSourceUrl(s.ref.trim())
        if (!returned.has(url)) continue
        const entry = bySource.get(url) ?? {
          url,
          title: returned.get(url) || url,
          excerpts: [],
          cited: true
        }
        if (s.quote?.trim() && !entry.excerpts.includes(s.quote.trim()))
          entry.excerpts.push(s.quote.trim())
        bySource.set(url, entry)
      }
      if (!bySource.size) return new Map()
      const tagger = sourceTagger({
        ownSite: d.profile.company.website,
        competitor: task.competitor
      })
      const report = await d.sources.ingest([...bySource.values()], tagger)
      if (report.created.length) {
        await appendLog(
          d.wikiRoot,
          'ingest',
          `${report.created.length} web sources cited by "${task.title}" (raw/articles/)`,
          today()
        )
      }
      return report.paths
    }

    let note: string | undefined = result.truncated
      ? 'The output was cut off at the length limit.'
      : undefined

    // Articles (REQUIREMENTS-v2 3.2): validate, retry once with the problems, write what is valid.
    if (writes?.kind === 'articles') {
      const validate = async (r: typeof result): Promise<ValidationResult> => {
        const urlPaths = await ingest(r)
        const rawNow = await loadRaw(d.wikiRoot)
        const refs = new Map<string, string[]>()
        for (const doc of documents) refs.set(doc.path, doc.rawSources ?? [])
        for (const [url, p] of urlPaths) refs.set(url, [p])
        let output = r.output
        // Social profiles found become raw notes, and the taglines article cites them.
        if (writes.socialNotes) {
          const parsed = ToolOutputSchema.safeParse(r.output ?? {})
          const art = parsed.success
            ? parsed.data.articles.find((a) => a.slug === 'social-taglines')
            : undefined
          if (art) {
            const notes = await writeSocialNotes(d.wikiRoot, art.body, today())
            for (const n of notes) refs.set(n, [n])
            const extra = await loadRaw(d.wikiRoot)
            for (const [k, v] of extra) rawNow.set(k, v)
            const data = parsed.data!
            output = {
              ...data,
              articles: data.articles.map((a) =>
                a === art ? { ...a, sources: [...a.sources, ...notes.map((n) => ({ ref: n }))] } : a
              )
            }
          }
        }
        // Models sometimes list no usable sources. An article still cites what its task really
        // used: the pages this task cited or fetched (or, failing that, the pages its searches
        // returned), or, without web tools, the documents it was given.
        const fellBack: string[] = []
        const withSources = ToolOutputSchema.safeParse(output ?? {})
        if (withSources.success) {
          const key = (ref: string): string =>
            /^https?:\/\//i.test(ref.trim()) ? normalizeSourceUrl(ref.trim()) : ref.trim()
          const resolves = (list: { ref: string }[]): boolean =>
            list.some((x) => (refs.get(key(x.ref)) ?? []).length > 0)
          let fallback: string[] | null = null
          const fallbackRefs = async (): Promise<string[]> => {
            if (fallback) return fallback
            if (task.web) {
              fallback = r.sources.map((x) => normalizeSourceUrl(x.url)).filter((u) => refs.has(u))
              if (!fallback.length && r.consulted.length) {
                const tagger = sourceTagger({
                  ownSite: d.profile.company.website,
                  competitor: task.competitor
                })
                const extra = await d.sources.ingest(
                  r.consulted
                    .slice(0, 5)
                    .map((c) => ({ url: c.url, title: c.title, excerpts: [], cited: false })),
                  tagger
                )
                for (const [u, p] of extra.paths) refs.set(u, [p])
                for (const [k, v] of await loadRaw(d.wikiRoot)) rawNow.set(k, v)
                fallback = [...extra.paths.keys()]
              }
            } else {
              fallback = documents
                .map((doc) => doc.path)
                .filter((p) => (refs.get(p) ?? []).length > 0)
            }
            return fallback
          }
          const fix = async <
            T extends { slug: string; sources: { ref: string; quote?: string }[] }
          >(
            x: T
          ): Promise<T> => {
            if (resolves(x.sources)) return x
            const refsFor = await fallbackRefs()
            if (!refsFor.length) return x
            fellBack.push(x.slug)
            return { ...x, sources: refsFor.map((ref) => ({ ref })) }
          }
          output = {
            articles: await Promise.all(withSources.data.articles.map(fix)),
            patches: await Promise.all(withSources.data.patches.map(fix))
          }
        }
        const v = validateOutput(output, {
          targets: writes.targets,
          refs,
          raw: rawNow,
          existing,
          today: today(),
          normalizeUrl: normalizeSourceUrl,
          forcePrivate: sawPrivate
        })
        // The task's own format check, on the article it is about.
        const main = ToolOutputSchema.safeParse(output ?? {})
        const body = main.success ? main.data.articles[0]?.body : undefined
        const problem = task.validate && body !== undefined ? task.validate(body) : null
        if (problem) v.errors.push(problem)
        if (r.output === undefined) v.errors.push(`No ${ARTICLE_TOOL.name} call was made.`)
        if (fellBack.length)
          v.warnings.push(
            `No usable sources listed for ${fellBack.join(', ')}: cited what the task used instead.`
          )
        return v
      }

      let v = await validate(result)
      if (v.errors.length) {
        const again = await call(
          `Your previous ${ARTICLE_TOOL.name} call had problems:\n${v.errors.map((e) => `- ${e}`).join('\n')}\n\nCall ${ARTICLE_TOOL.name} again with every article, fixed.`
        )
        costUsd += costOf(d.pricing, d.model, again.usage).usd
        const v2 = await validate(again)
        if (v2.files.length >= v.files.length) {
          v = v2
          result = again
        }
        if (v.errors.length)
          note = 'Done with warnings: some articles did not pass the checks and were not saved.'
      }
      if (!v.files.length && writes.targets.required.length)
        throw new Error('No valid articles were returned.')
      const written = await writePrepared(d.wikiRoot, v.files)
      await addBacklinks(d.wikiRoot, written)
      await provenance(written, task, inputPaths)
      await writeReceipt(d.root, task.output(ctx), {
        task: task.id,
        runId: d.runId,
        written,
        note,
        warnings: [...v.errors, ...v.warnings]
      })
      await writeIndexes(d.wikiRoot)
      return { costUsd, usage: result.usage, output: task.output(ctx), note }
    }

    // Everything else answers in text.
    if (!result.text.trim()) throw new Error('The model returned no text.')
    const problem = task.validate?.(result.text)
    if (problem) {
      const again = await call(
        `Your previous answer was not in the required format: ${problem}\n\nReturn the whole document again, in the exact format required.`
      )
      costUsd += costOf(d.pricing, d.model, again.usage).usd
      if (again.text.trim() && !task.validate?.(again.text)) result = again
      else note ??= 'Saved as written: the answer did not match the expected format.'
    }

    // An assembled deliverable in output/ (spec 4.5): the messaging analysis.
    if (writes?.kind === 'output') {
      const version = await nextOutputVersion(d.wikiRoot, writes.name)
      const rel = outputRel(writes.name, version, today())
      const cited = inputPaths.filter((p) => p.startsWith('wiki/'))
      const body = replaceEmDashes(stripOuterFence(result.text))
      const text = stringifyDoc(
        'output',
        {
          title: `${writes.title}: ${d.profile.company.name} (v${version})`,
          type: 'report',
          created: today(),
          updated: today(),
          summary: `${writes.title} of ${d.profile.company.name}'s current messaging, scored against the positioning in the wiki.`,
          sources: [...new Set(cited)]
        },
        body
      )
      await writeFile(safeJoin(d.wikiRoot, rel), text, { flag: 'wx' })
      await provenance([rel], task, inputPaths)
      await appendLog(
        d.wikiRoot,
        'output',
        `${writes.title.toLowerCase()} v${version} -> ${rel}`,
        today()
      )
      await writeReceipt(d.root, task.output(ctx), {
        task: task.id,
        runId: d.runId,
        written: [rel],
        note
      })
      await writeIndexes(d.wikiRoot)
      return { costUsd, usage: result.usage, output: task.output(ctx), note }
    }

    // A run draft (competitor list, social profiles, public proof), kept in app state.
    const urlPaths = await ingest(result)
    if (urlPaths.size) await writeIndexes(d.wikiRoot)
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
        inputs: inputPaths,
        web: task.web !== false,
        citations: result.citations,
        consulted: result.consulted,
        truncated: result.truncated,
        rawSources: [...urlPaths.values()]
      })
    )
    return { costUsd, usage: result.usage, output: rel, note }
  }
}

/**
 * On resume: a finished task counts only if its output is still there. A receipt counts only
 * while every file it lists is still in the wiki.
 */
export function outputVerifier(
  root: string,
  ctx: TaskContext,
  wikiRoot?: string
): (task: TaskDef) => Promise<boolean> {
  return async (task) => {
    const full = resolveInside(root, task.output(ctx))
    if (!full) return false
    try {
      if (await isDir(full)) return (await mdFiles(root, task.output(ctx))).length > 0
      const fm = matter(await readFile(full, 'utf8')).data
      if (typeof fm.status !== 'string') return false
      const written = stringList(fm.written)
      if (written.length && wikiRoot) {
        for (const w of written) await stat(safeJoin(wikiRoot, w))
      }
      return true
    } catch {
      return false
    }
  }
}

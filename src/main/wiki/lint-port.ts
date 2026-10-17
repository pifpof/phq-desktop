import { readdir, readFile, stat } from 'fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'path'
import type { Finding, Severity } from '@shared/conformance'
import { parseFrontMatter, type FrontMatter } from './frontmatter'

/**
 * A TypeScript port of llm-wiki's deterministic lint (scripts/llm-wiki, v0.25.1, MIT), read-only
 * mode. Same checks, same severities, same paths, so the app and the official tool agree. Each
 * function names the Python function it ports. When the pin moves, diff the script and port the
 * changes here; tests/unit/conformance.test.ts compares the two on llm-wiki's defect fixtures.
 */

const RAW_TYPES = ['articles', 'papers', 'repos', 'notes', 'data']
const ARTICLE_CATEGORIES = ['concept', 'topic', 'reference']
const ARTICLE_DIRS: Record<string, string> = {
  concept: 'concepts',
  topic: 'topics',
  reference: 'references'
}
const INVENTORY_KINDS = [
  'item',
  'idea',
  'ingest-candidate',
  'entity',
  'corpus',
  'question',
  'task',
  'artifact',
  'watch'
]
const INVENTORY_STATUSES = ['proposed', 'active', 'blocked', 'ingested', 'superseded', 'archived']
const INVENTORY_PRIORITIES = ['p0', 'p1', 'p2', 'p3', 'p4']
const DATASET_STATUSES = ['proposed', 'active', 'external', 'archived', 'unavailable']
const DATASET_STORAGE = ['local', 'remote', 'external', 'hybrid']
const SCHEMA_STATUSES = ['unknown', 'inferred', 'declared', 'validated']
const CONFIDENCE_VALUES = ['high', 'medium', 'low']
const VOLATILITY_VALUES = ['hot', 'warm', 'cold']

export const ROOT_ALLOWED = new Set([
  '_index.md',
  'README.md',
  'config.md',
  'schema.md',
  'log.md',
  'raw',
  'wiki',
  'inventory',
  'datasets',
  'output',
  'inbox',
  '.obsidian',
  '.librarian',
  '.audit',
  '.research-session.json',
  '.thesis-session.json',
  '.session-events.jsonl',
  '.session-checkpoint.json',
  '.sessions'
])
const GIT_ROOT_META_ALLOWED = new Set([
  '.git',
  '.github',
  'AGENTS.md',
  'CLAUDE.md',
  'CHANGELOG.md',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'LICENSE.md',
  'SECURITY.md',
  '.gitignore',
  '.gitattributes',
  '.gitmodules'
])
const RAW_ALLOWED = new Set(['_index.md', ...RAW_TYPES])
const WIKI_ALLOWED = new Set(['_index.md', 'concepts', 'topics', 'references', 'theses'])
const INVENTORY_ALLOWED = new Set([
  '_index.md',
  'items',
  'ideas',
  'candidates',
  'entities',
  'corpora',
  'views'
])
const DATASET_CHILD_ALLOWED = new Set([
  '_index.md',
  'MANIFEST.md',
  'samples',
  'profiles',
  'queries'
])
const RAW_INDEX_CATEGORIES = RAW_TYPES
const WIKI_INDEX_CATEGORIES = ['concepts', 'topics', 'references', 'theses']
const INVENTORY_NAVIGATION_DIRS = ['items', 'ideas', 'candidates', 'entities', 'corpora', 'views']
const INVENTORY_RECORD_DIRS = ['items', 'ideas', 'candidates', 'entities', 'corpora']
const REQUIRED_DIRS = [
  'raw',
  'raw/articles',
  'raw/papers',
  'raw/repos',
  'raw/notes',
  'raw/data',
  'wiki',
  'wiki/concepts',
  'wiki/topics',
  'wiki/references',
  'wiki/theses',
  'output'
]
const FRESHNESS_DAYS: Record<string, number> = { hot: 30, warm: 180, cold: 365 }
const SCHEMELESS_WEB_SOURCE_RE = /^(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?::\d+)?(?:[/#?]|$)/
const WINDOWS_ABSOLUTE_PATH_RE = /^\/?[A-Za-z]:[\\/]/

export interface LintDoc {
  /** Absolute path. */
  path: string
  rel: string
  frontmatter: FrontMatter
  body: string
  text: string
}

export interface LintPortResult {
  findings: Finding[]
  /** Documents with readable front matter under raw/, wiki/, inventory/, datasets/, keyed by rel. */
  documents: Map<string, LintDoc>
  /** Raw files cited by some wiki article (absolute paths). */
  referencedRaw: Set<string>
}

const posix = (p: string): string => p.split(sep).join('/')

async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory()
  } catch {
    return false
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile()
  } catch {
    return false
  }
}

async function children(dir: string): Promise<{ name: string; dir: boolean; path: string }[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .map((e) => ({ name: e.name, dir: e.isDirectory(), path: join(dir, e.name) }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  } catch {
    return []
  }
}

/** markdown_files: every .md file below a folder, sorted. */
async function markdownFiles(root: string): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string): Promise<void> {
    for (const c of await children(dir)) {
      if (c.dir) await walk(c.path)
      else if (c.name.endsWith('.md')) out.push(c.path)
    }
  }
  if (await isDir(root)) await walk(root)
  return out.sort()
}

/** content_markdown_files: excludes every _index.md and config.md. */
async function contentMarkdownFiles(root: string): Promise<string[]> {
  return (await markdownFiles(root)).filter((p) => {
    const name = p.split(sep).pop()
    return name !== '_index.md' && name !== 'config.md'
  })
}

/** extract_markdown_links */
export function extractMarkdownLinks(text: string): string[] {
  const links: string[] = []
  for (const m of text.matchAll(/\]\((<([^>\n]+)>|([^)\n]+))\)/g)) links.push(m[2] ?? m[3])
  return links
}

/** is_local_markdown_link */
export function isLocalMarkdownLink(link: string): boolean {
  if (link.includes('://') || link.startsWith('mailto:')) return false
  return link.split('#')[0].endsWith('.md')
}

/** resolve_link_target */
export function resolveLinkTarget(baseDir: string, link: string): string {
  const target = link.split('#')[0]
  if (target.startsWith('/') && !WINDOWS_ABSOLUTE_PATH_RE.test(target)) return target
  if (WINDOWS_ABSOLUTE_PATH_RE.test(target)) return target.replace(/^\//, '')
  return resolve(baseDir, target)
}

/** slugify (the Python one, used for source-reference fallback). */
function pySlugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const stripQuotes = (v: string): string =>
  (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))
    ? v.slice(1, -1)
    : v

const stem = (p: string): string => {
  const name = p.split(/[\\/]/).pop() ?? p
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

const isEmpty = (v: unknown): boolean =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

const isUnder = (p: string, parent: string): boolean => {
  const r = relative(resolve(parent), resolve(p))
  return r === '' || (!r.startsWith('..') && !isAbsolute(r))
}

const parseDate = (value: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCMonth() === Number(m[2]) - 1 ? d : null
}

class Ctx {
  findings: Finding[] = []
  documents = new Map<string, LintDoc>()
  referencedRaw = new Set<string>()
  constructor(
    readonly root: string,
    readonly today: string
  ) {}

  rel(p: string): string {
    const r = relative(this.root, resolve(p))
    return r.startsWith('..') || isAbsolute(r) ? p : posix(r)
  }

  issue(severity: Severity, check: string, message: string, path = '', fixable = false): void {
    this.findings.push({
      check,
      severity,
      path: path ? this.rel(path) : '',
      message,
      fixable,
      origin: 'llm-wiki'
    })
  }
}

/** read_document */
async function readDocument(ctx: Ctx, path: string): Promise<LintDoc | null> {
  let text: string
  try {
    const buf = await readFile(path)
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch (err) {
    ctx.issue(
      'critical',
      'C1',
      err instanceof TypeError ? 'Markdown file is not valid UTF-8.' : 'Could not read file.',
      path
    )
    return null
  }
  if (!text.startsWith('---\n')) {
    ctx.issue('critical', 'C1', 'Markdown file is missing YAML frontmatter.', path)
    return null
  }
  const end = text.indexOf('\n---', 4)
  if (end === -1) {
    ctx.issue('critical', 'C1', 'Markdown file has unterminated YAML frontmatter.', path)
    return null
  }
  return {
    path,
    rel: ctx.rel(path),
    frontmatter: parseFrontMatter(text.slice(4, end)),
    body: text.slice(end + 4),
    text
  }
}

/** load_documents */
async function loadDocuments(ctx: Ctx): Promise<void> {
  // Same files as the Python (every content .md under these four folders), without walking the rest.
  const paths: string[] = []
  for (const top of ['raw', 'wiki', 'inventory', 'datasets'])
    paths.push(...(await contentMarkdownFiles(join(ctx.root, top))))
  for (const path of paths.sort()) {
    const doc = await readDocument(ctx, path)
    if (doc) ctx.documents.set(doc.rel, doc)
  }
}

/** ensure_dir_index */
async function ensureDirIndex(ctx: Ctx, dir: string): Promise<void> {
  if (!(await exists(dir))) {
    ctx.issue('critical', 'C1', 'Required directory is missing.', dir, true)
    return
  }
  if (!(await exists(join(dir, '_index.md'))))
    ctx.issue('critical', 'C1', 'Required _index.md is missing.', join(dir, '_index.md'), true)
}

/** check_structure (topic wikis; hubs are out of scope for the app) */
async function checkStructure(ctx: Ctx): Promise<void> {
  if (!(await exists(join(ctx.root, '_index.md'))))
    ctx.issue('critical', 'C1', 'Master _index.md is missing.', join(ctx.root, '_index.md'), true)
  if (!(await exists(join(ctx.root, 'config.md'))))
    ctx.issue('critical', 'C1', 'config.md is missing.', join(ctx.root, 'config.md'))
  if (!(await exists(join(ctx.root, 'schema.md'))))
    ctx.issue(
      'info',
      'C1',
      'Optional topic guide missing. Existing wiki is valid.',
      join(ctx.root, 'schema.md'),
      true
    )
  for (const rel of REQUIRED_DIRS) await ensureDirIndex(ctx, join(ctx.root, rel))

  const inventory = join(ctx.root, 'inventory')
  if (await exists(inventory)) {
    await ensureDirIndex(ctx, inventory)
    for (const name of INVENTORY_NAVIGATION_DIRS) {
      if (await exists(join(inventory, name))) await ensureDirIndex(ctx, join(inventory, name))
    }
  }
  const datasets = join(ctx.root, 'datasets')
  if (await exists(datasets)) {
    await ensureDirIndex(ctx, datasets)
    for (const c of await children(datasets)) {
      if (!c.dir || !(await exists(join(c.path, 'MANIFEST.md')))) continue
      await ensureDirIndex(ctx, c.path)
      for (const name of ['samples', 'profiles', 'queries']) {
        if (await exists(join(c.path, name))) await ensureDirIndex(ctx, join(c.path, name))
      }
    }
  }
  if (!(await exists(join(ctx.root, 'inbox'))))
    ctx.issue('warning', 'C1', 'inbox/ is missing.', join(ctx.root, 'inbox'), true)
}

/** handle_unknown (read-only) */
function handleUnknown(ctx: Ctx, entry: { path: string; dir: boolean }, message: string): void {
  if (entry.dir)
    ctx.issue('warning', 'C12', `${message} Unknown directories are not auto-fixed.`, entry.path)
  else ctx.issue('warning', 'C12', message, entry.path, true)
}

async function scanFixedAllowed(
  ctx: Ctx,
  dir: string,
  allowed: Set<string>,
  label: string
): Promise<void> {
  for (const c of await children(dir)) {
    if (!allowed.has(c.name)) handleUnknown(ctx, c, `Unexpected file or directory in ${label}.`)
  }
}

/** check_unknown_files */
async function checkUnknownFiles(ctx: Ctx): Promise<void> {
  const allowed = new Set(ROOT_ALLOWED)
  if (await exists(join(ctx.root, '.git'))) for (const n of GIT_ROOT_META_ALLOWED) allowed.add(n)
  for (const c of await children(ctx.root)) {
    if (!allowed.has(c.name)) handleUnknown(ctx, c, 'Unexpected file or directory at wiki root.')
  }
  await scanFixedAllowed(ctx, join(ctx.root, 'raw'), RAW_ALLOWED, 'raw/')
  await scanFixedAllowed(ctx, join(ctx.root, 'wiki'), WIKI_ALLOWED, 'wiki/')
  await scanFixedAllowed(ctx, join(ctx.root, 'inventory'), INVENTORY_ALLOWED, 'inventory/')

  for (const c of await children(join(ctx.root, 'datasets'))) {
    if (c.name === '_index.md') continue
    if (!c.dir) {
      handleUnknown(ctx, c, 'Unexpected file in datasets/.')
      continue
    }
    for (const d of await children(c.path)) {
      if (!DATASET_CHILD_ALLOWED.has(d.name))
        handleUnknown(ctx, d, `Unexpected file or directory in datasets/${c.name}/.`)
    }
    for (const sub of ['samples', 'profiles', 'queries']) {
      for (const note of await children(join(c.path, sub))) {
        if (note.name === '_index.md') continue
        if (note.dir || !note.name.endsWith('.md'))
          handleUnknown(ctx, note, `Unexpected file in datasets/${c.name}/${sub}/.`)
      }
    }
  }

  const bases: [string, string[]][] = [
    ['raw', RAW_TYPES],
    ['wiki', WIKI_INDEX_CATEGORIES],
    ['inventory', INVENTORY_NAVIGATION_DIRS]
  ]
  for (const [base, subs] of bases) {
    // Python iterates a set here; order only affects report order, which callers sort.
    for (const sub of subs) {
      const dir = join(ctx.root, base, sub)
      for (const c of await children(dir)) {
        if (c.name === '_index.md') continue
        if (c.dir || !c.name.endsWith('.md'))
          handleUnknown(ctx, c, `Unexpected file in ${ctx.rel(dir)}/.`)
      }
    }
  }
}

function requireFields(ctx: Ctx, doc: LintDoc, fields: string[]): void {
  for (const f of fields) {
    if (isEmpty(doc.frontmatter[f]))
      ctx.issue('critical', 'C2', `Required frontmatter field is missing or empty: ${f}.`, doc.path)
  }
}

function checkEnum(
  ctx: Ctx,
  doc: LintDoc,
  field: string,
  allowed: string[],
  severity: Severity = 'critical'
): void {
  const v = doc.frontmatter[field]
  if (v === undefined || v === null || v === '') return
  if (!allowed.includes(String(v))) {
    ctx.issue(
      severity,
      'C2',
      `Invalid ${field}: '${String(v)}'; expected one of ${[...allowed].sort().join(', ')}.`,
      doc.path
    )
  }
}

/** check_frontmatter_schema */
function checkFrontmatterSchema(ctx: Ctx): void {
  for (const doc of [...ctx.documents.values()].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const parts = doc.rel.split('/')
    const fm = doc.frontmatter
    if (parts[0] === 'raw') {
      requireFields(ctx, doc, ['title', 'source', 'type', 'ingested', 'tags', 'summary'])
      checkEnum(ctx, doc, 'type', RAW_TYPES)
    } else if (parts[0] === 'wiki') {
      if (fm.type === 'thesis')
        requireFields(ctx, doc, ['title', 'created', 'updated', 'tags', 'summary'])
      else {
        requireFields(ctx, doc, ['title', 'category', 'created', 'updated', 'tags', 'summary'])
        checkEnum(ctx, doc, 'category', ARTICLE_CATEGORIES)
      }
      if ('confidence' in fm) checkEnum(ctx, doc, 'confidence', CONFIDENCE_VALUES, 'warning')
      if ('volatility' in fm) checkEnum(ctx, doc, 'volatility', VOLATILITY_VALUES, 'warning')
    } else if (parts[0] === 'inventory') {
      if (parts[1] === 'views') requireFields(ctx, doc, ['title', 'view', 'updated', 'summary'])
      else {
        requireFields(ctx, doc, [
          'title',
          'kind',
          'status',
          'priority',
          'created',
          'updated',
          'tags',
          'summary'
        ])
        checkEnum(ctx, doc, 'kind', INVENTORY_KINDS)
        checkEnum(ctx, doc, 'status', INVENTORY_STATUSES)
        checkEnum(ctx, doc, 'priority', INVENTORY_PRIORITIES)
      }
    } else if (parts[0] === 'datasets' && parts.at(-1) === 'MANIFEST.md') {
      requireFields(ctx, doc, [
        'title',
        'dataset_id',
        'status',
        'storage',
        'locations',
        'formats',
        'schema_status',
        'created',
        'updated',
        'tags',
        'summary'
      ])
      checkEnum(ctx, doc, 'status', DATASET_STATUSES)
      checkEnum(ctx, doc, 'storage', DATASET_STORAGE)
      checkEnum(ctx, doc, 'schema_status', SCHEMA_STATUSES)
    }
    if ('tags' in fm && (!Array.isArray(fm.tags) || fm.tags.length === 0))
      ctx.issue('warning', 'C2', 'tags must be a non-empty list.', doc.path)
  }
}

/** canonical_path_for: the folder a file belongs in, from its front matter. */
export function canonicalRel(rel: string, fm: FrontMatter): string | null {
  const parts = rel.split('/')
  const name = parts.at(-1)!
  if (parts[0] === 'raw' && RAW_TYPES.includes(String(fm.type)))
    return `raw/${String(fm.type)}/${name}`
  if (parts[0] === 'wiki') {
    if (fm.type === 'thesis') return `wiki/theses/${name}`
    const dir = ARTICLE_DIRS[String(fm.category)]
    if (dir) return `wiki/${dir}/${name}`
  }
  if (parts[0] === 'inventory' && parts.length >= 2 && parts[1] !== 'views') {
    const kind = String(fm.kind)
    if (kind === 'item') return `inventory/items/${name}`
    if (kind === 'idea') return `inventory/ideas/${name}`
    if (kind === 'entity') return `inventory/entities/${name}`
    if (kind === 'corpus') return `inventory/corpora/${name}`
    if (['ingest-candidate', 'question', 'task', 'artifact', 'watch'].includes(kind))
      return `inventory/candidates/${name}`
  }
  return null
}

/** check_canonical_placement */
async function checkCanonicalPlacement(ctx: Ctx): Promise<void> {
  for (const doc of [...ctx.documents.values()].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    if (!['raw', 'wiki', 'inventory'].includes(doc.rel.split('/')[0])) continue
    const expected = canonicalRel(doc.rel, doc.frontmatter)
    if (!expected || expected === doc.rel) continue
    ctx.issue(
      'critical',
      'C11',
      `File is in the wrong directory; expected ${expected}.`,
      doc.path,
      true
    )
  }
  for (const c of await children(join(ctx.root, 'datasets'))) {
    const doc = ctx.documents.get(ctx.rel(join(c.path, 'MANIFEST.md')))
    const id = doc?.frontmatter.dataset_id
    if (doc && id && id !== c.name)
      ctx.issue(
        'warning',
        'C11',
        `Dataset manifest directory does not match dataset_id '${String(id)}'.`,
        doc.path
      )
  }
}

type Contract =
  | 'raw-root'
  | 'wiki-root'
  | 'inventory-root'
  | 'datasets-root'
  | 'output-root'
  | 'dataset-root'
  | 'direct-files'

function indexContract(rel: string): Contract {
  if (rel === 'raw') return 'raw-root'
  if (rel === 'wiki') return 'wiki-root'
  if (rel === 'inventory') return 'inventory-root'
  if (rel === 'datasets') return 'datasets-root'
  if (rel === 'output') return 'output-root'
  const parts = rel.split('/')
  if (parts.length === 2 && parts[0] === 'datasets') return 'dataset-root'
  return 'direct-files'
}

const CONTRACT_LABEL: Record<Contract, string> = {
  'raw-root': 'raw category pointer',
  'wiki-root': 'wiki category pointer',
  'inventory-root': 'inventory navigation or record rollup',
  'datasets-root': 'dataset manifest registry',
  'output-root': 'output artifact or project entry',
  'dataset-root': 'dataset manifest or navigation entry',
  'direct-files': 'file'
}

async function directMd(dir: string): Promise<string[]> {
  return (await children(dir))
    .filter((c) => !c.dir && c.name.endsWith('.md') && c.name !== '_index.md')
    .map((c) => c.path)
}

async function existingCategoryIndexes(dir: string, names: string[]): Promise<string[]> {
  const out: string[] = []
  for (const n of names) if (await exists(join(dir, n))) out.push(join(dir, n, '_index.md'))
  return out
}

async function contractEntries(dir: string, contract: Contract): Promise<string[]> {
  switch (contract) {
    case 'raw-root':
      return existingCategoryIndexes(dir, RAW_INDEX_CATEGORIES)
    case 'wiki-root':
      return existingCategoryIndexes(dir, WIKI_INDEX_CATEGORIES)
    case 'inventory-root': {
      const nav = await existingCategoryIndexes(dir, INVENTORY_NAVIGATION_DIRS)
      const records: string[] = []
      for (const n of INVENTORY_RECORD_DIRS) records.push(...(await directMd(join(dir, n))))
      return [...nav, ...records.sort()]
    }
    case 'datasets-root': {
      const out: string[] = []
      for (const c of await children(dir))
        if (c.dir && (await exists(join(c.path, 'MANIFEST.md'))))
          out.push(join(c.path, 'MANIFEST.md'))
      return out
    }
    case 'output-root': {
      const loose = await directMd(dir)
      const why: string[] = []
      for (const p of await children(join(dir, 'projects'))) {
        if (p.dir && !p.name.startsWith('.') && (await exists(join(p.path, 'WHY.md'))))
          why.push(join(p.path, 'WHY.md'))
      }
      return [...loose, ...why]
    }
    case 'dataset-root': {
      const entries = await directMd(dir)
      for (const n of ['samples', 'profiles', 'queries'])
        if (await exists(join(dir, n, '_index.md'))) entries.push(join(dir, n, '_index.md'))
      return entries
    }
    default:
      return directMd(dir)
  }
}

const indexLinksTo = (text: string, expected: string): boolean =>
  extractMarkdownLinks(text).some((l) => l.split('#')[0].replace(/\\/g, '/') === expected)

/** check_index_consistency */
async function checkIndexConsistency(ctx: Ctx): Promise<void> {
  const dirs: string[] = []
  // Hidden folders are skipped by the Python too; only these five trees are ever checked.
  async function walk(dir: string): Promise<void> {
    for (const c of await children(dir)) {
      if (!c.dir || c.name.startsWith('.')) continue
      dirs.push(c.path)
      await walk(c.path)
    }
  }
  for (const top of ['raw', 'wiki', 'inventory', 'datasets', 'output']) {
    if (!(await isDir(join(ctx.root, top)))) continue
    dirs.push(join(ctx.root, top))
    await walk(join(ctx.root, top))
  }
  for (const dir of dirs.sort()) {
    const rel = ctx.rel(dir)
    const parts = rel.split('/')
    if (parts.some((p) => p.startsWith('.'))) continue
    if (!['raw', 'wiki', 'inventory', 'datasets', 'output'].includes(parts[0])) continue
    const index = join(dir, '_index.md')
    let text: string
    try {
      text = await readFile(index, 'utf8')
    } catch {
      continue
    }
    const contract = indexContract(rel)
    for (const entry of await contractEntries(dir, contract)) {
      if (!indexLinksTo(text, posix(relative(dir, entry))))
        ctx.issue(
          'warning',
          'C3',
          `Required ${CONTRACT_LABEL[contract]} entry is missing from directory index.`,
          entry
        )
    }
    for (const link of extractMarkdownLinks(text)) {
      if (!isLocalMarkdownLink(link)) continue
      if (!(await exists(resolveLinkTarget(dir, link))))
        ctx.issue('warning', 'C3', `Index links to missing file: ${link}.`, index)
    }
  }
}

/** check_links */
async function checkLinks(ctx: Ctx): Promise<void> {
  for (const doc of [...ctx.documents.values()].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    if (!['wiki', 'inventory'].includes(doc.rel.split('/')[0])) continue
    const dir = join(doc.path, '..')
    for (const link of extractMarkdownLinks(doc.text)) {
      if (!isLocalMarkdownLink(link)) continue
      if (!(await exists(resolveLinkTarget(dir, link))))
        ctx.issue('warning', 'C4', `Markdown link points to missing file: ${link}.`, doc.path)
    }
  }
}

/** resolve_source_ref: exact path first, then slug fallback for wiki sources. */
export async function resolveSourceRef(
  root: string,
  owner: string,
  ref: string,
  wikiSource: boolean,
  onAmbiguous?: (message: string) => void
): Promise<string | null> {
  ref = stripQuotes(ref.trim())
  if (/^https?:\/\//.test(ref)) return wikiSource ? null : ref
  let candidate: string
  if (WINDOWS_ABSOLUTE_PATH_RE.test(ref) || isAbsolute(ref)) candidate = ref
  else if (ref.startsWith('../') || ref.startsWith('./')) candidate = resolve(owner, '..', ref)
  else candidate = resolve(root, ref)
  if (await isFile(candidate)) return resolve(candidate)
  if (!wikiSource) return null

  const slug = pySlugify(stem(ref))
  const exact: string[] = []
  const contains: string[] = []
  for (const raw of await contentMarkdownFiles(join(root, 'raw'))) {
    const rawSlug = pySlugify(stem(raw))
    const noDate = rawSlug.replace(/^\d{4}-\d{2}-\d{2}-/, '')
    if (slug === rawSlug || slug === noDate) exact.push(resolve(raw))
    else if (slug.length >= 8 && (noDate.includes(slug) || slug.includes(noDate)))
      contains.push(resolve(raw))
  }
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) {
    onAmbiguous?.(`Source reference is ambiguous after slug fallback: ${ref}.`)
    return null
  }
  if (contains.length === 1) return contains[0]
  if (contains.length > 1)
    onAmbiguous?.(`Source reference is ambiguous after fuzzy slug fallback: ${ref}.`)
  return null
}

/** raw_source_path_candidate: a raw `source` that is clearly a local path, else null. */
export function rawSourcePathCandidate(root: string, owner: string, ref: string): string | null {
  ref = stripQuotes(ref.trim())
  if (!ref) return null
  if (WINDOWS_ABSOLUTE_PATH_RE.test(ref)) return ref
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(ref)
  if (scheme) {
    if (scheme[1].toLowerCase() !== 'file') return null
    try {
      const url = new URL(ref)
      let p = decodeURIComponent(url.pathname)
      if (url.host && url.host.toLowerCase() !== 'localhost') p = `//${url.host}${p}`
      return isAbsolute(p) ? p : join(root, p)
    } catch {
      return null
    }
  }
  if (SCHEMELESS_WEB_SOURCE_RE.test(ref)) return null
  const explicitRelative = /^(\.\.\/|\.\/|\.\.\\|\.\\)/.test(ref)
  const homeRelative = ref === '~' || ref.startsWith('~/') || ref.startsWith('~\\')
  const absolute = isAbsolute(ref)
  const bare = !/\s/.test(ref) && (ref.includes('/') || ref.includes('\\'))
  if (!(explicitRelative || homeRelative || absolute || bare)) return null
  if (homeRelative) return join(process.env.HOME ?? process.env.USERPROFILE ?? '~', ref.slice(1))
  if (absolute) return ref
  if (explicitRelative) return join(owner, '..', ref)
  const candidate = join(root, ref)
  return candidate
}

/** check_source_provenance */
async function checkSourceProvenance(ctx: Ctx): Promise<void> {
  for (const doc of [...ctx.documents.values()].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const top = doc.rel.split('/')[0]
    const fm = doc.frontmatter
    if (top === 'wiki') {
      const sources = fm.sources
      const compiledFrom = fm['compiled-from']
      if (isEmpty(sources) && compiledFrom !== 'conversation' && compiledFrom !== 'mixed') {
        ctx.issue(
          'warning',
          'C18',
          'Compiled article is missing sources and has no compiled-from exemption.',
          doc.path
        )
        continue
      }
      if (!isEmpty(sources)) {
        if (!Array.isArray(sources)) {
          ctx.issue('warning', 'C4b', 'sources must be a list.', doc.path)
          continue
        }
        for (const s of sources) {
          const resolved = await resolveSourceRef(ctx.root, doc.path, String(s), true, (m) =>
            ctx.issue('warning', 'C4b', m, doc.path)
          )
          if (resolved === null)
            ctx.issue(
              'warning',
              'C4b',
              `Source reference does not resolve: ${String(s)}.`,
              doc.path
            )
          else if (isUnder(resolved, join(ctx.root, 'raw'))) ctx.referencedRaw.add(resolved)
        }
      }
    } else if (top === 'inventory') {
      if (Array.isArray(fm.sources)) {
        for (const s of fm.sources) {
          if (/^https?:\/\//.test(String(s))) continue
          if ((await resolveSourceRef(ctx.root, doc.path, String(s), false)) === null)
            ctx.issue(
              'warning',
              'C4b',
              `Inventory source reference does not resolve: ${String(s)}.`,
              doc.path
            )
        }
      }
    } else if (top === 'raw') {
      const source = fm.source
      if (source) {
        const candidate = rawSourcePathCandidate(ctx.root, doc.path, String(source))
        if (candidate !== null && !(await exists(candidate)))
          ctx.issue(
            'warning',
            'C4b',
            `Raw source reference does not resolve: ${String(source)}.`,
            doc.path
          )
      }
    }
    if (doc.body.includes('RETRACTED-SOURCE'))
      ctx.issue('warning', 'C4b', 'Retracted-source marker remains in the file body.', doc.path)
  }
}

/** check_tags */
function checkTags(ctx: Ctx): void {
  const present = new Set<string>()
  for (const doc of ctx.documents.values()) {
    if (Array.isArray(doc.frontmatter.tags))
      for (const t of doc.frontmatter.tags) present.add(String(t))
  }
  const groups = [
    ['ml', 'machine-learning', 'machinelearning'],
    ['ai', 'artificial-intelligence', 'artificialintelligence'],
    ['llm', 'llms', 'large-language-models']
  ]
  for (const g of groups) {
    const matches = g.filter((t) => present.has(t)).sort()
    if (matches.length > 1)
      ctx.issue('warning', 'C5', `Near-duplicate tags found: ${matches.join(', ')}.`)
  }
}

/** check_coverage */
async function checkCoverage(ctx: Ctx): Promise<void> {
  for (const raw of await contentMarkdownFiles(join(ctx.root, 'raw'))) {
    const doc = ctx.documents.get(ctx.rel(raw))
    const tags = Array.isArray(doc?.frontmatter.tags) ? doc!.frontmatter.tags.map(String) : []
    if (tags.includes('collection-manifest')) continue
    if (!ctx.referencedRaw.has(resolve(raw)))
      ctx.issue('suggestion', 'C6', 'Raw source is not referenced by any compiled article.', raw)
  }
}

/** check_freshness */
function checkFreshness(ctx: Ctx): void {
  const today = parseDate(ctx.today)!
  for (const doc of ctx.documents.values()) {
    if (doc.rel.split('/')[0] !== 'wiki') continue
    const volatility = doc.frontmatter.volatility
    if (volatility === undefined || volatility === null) {
      ctx.issue('info', 'C15', 'Compiled article has no volatility field.', doc.path, true)
      continue
    }
    const limit = FRESHNESS_DAYS[String(volatility)]
    if (limit === undefined) continue
    const verified = doc.frontmatter.verified || doc.frontmatter.updated
    const date = verified ? parseDate(String(verified)) : null
    if (!date) {
      ctx.issue('warning', 'C14', 'Compiled article has no valid verified/updated date.', doc.path)
      continue
    }
    const age = Math.round((today.getTime() - date.getTime()) / 86_400_000)
    if (age > limit)
      ctx.issue(
        'warning',
        'C14',
        `Compiled article may be stale: ${age} days since verification for ${String(volatility)} volatility.`,
        doc.path
      )
  }
}

/** check_projects */
async function checkProjects(ctx: Ctx): Promise<void> {
  for (const p of await children(join(ctx.root, 'output', 'projects'))) {
    if (!p.dir) continue
    let why = ''
    try {
      why = await readFile(join(p.path, 'WHY.md'), 'utf8')
    } catch {
      /* missing */
    }
    if (!why.trim()) ctx.issue('warning', 'C8', 'Project is missing a non-empty WHY.md.', p.path)
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(p.name) || /\d{4}-\d{2}-\d{2}/.test(p.name))
      ctx.issue(
        'warning',
        'C8',
        'Project slug should be lowercase, hyphen-separated, <=40 chars, no dates.',
        p.path
      )
  }
}

/** run_lint, read-only, for a topic wiki. `today` is YYYY-MM-DD. */
export async function runLintPort(root: string, today: string): Promise<LintPortResult> {
  const ctx = new Ctx(resolve(root), today)
  await checkStructure(ctx)
  await checkUnknownFiles(ctx)
  await loadDocuments(ctx)
  checkFrontmatterSchema(ctx)
  await checkCanonicalPlacement(ctx)
  await checkIndexConsistency(ctx)
  await checkLinks(ctx)
  await checkSourceProvenance(ctx)
  checkTags(ctx)
  await checkCoverage(ctx)
  checkFreshness(ctx)
  await checkProjects(ctx)
  return { findings: ctx.findings, documents: ctx.documents, referencedRaw: ctx.referencedRaw }
}

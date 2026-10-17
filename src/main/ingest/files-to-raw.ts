import { constants } from 'fs'
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'fs/promises'
import { basename, extname, join } from 'path'
import {
  INPUT_CATEGORIES,
  INPUT_LIMITS,
  READABLE_EXTENSIONS,
  type AddResult,
  type InputCategory,
  type InputFile
} from '@shared/workspace'
import { replaceEmDashes } from '../research/postprocess'
import { stateDir, writeJsonAtomic } from '../state/app-state'
import { stringifyDoc } from '../wiki/frontmatter'
import { writeIndexes } from '../wiki/index-gen'
import { appendLog } from '../wiki/log'
import { freeRel, isoDay, rawRel, safeJoin } from '../wiki/paths'
import { scanWiki } from '../wiki/scan'
import { cleanText, extractText_ } from './extract'

/**
 * File ingest (REQUIREMENTS-v2 3.1). A file the person adds is copied into inbox/, its text is
 * extracted to raw/papers/ (or raw/data/ for CSV) tagged `private` and its category, and the copy
 * moves to inbox/.processed/, where it stays as the raw file's `source`. The person's original
 * on their own disk is never touched.
 *
 * Which category each file was added under is app state (inputs.json): the wiki carries it only
 * as a tag on the raw file.
 */

/** Largest text kept in a raw file. Prompts take a smaller slice per file. */
const MAX_RAW_CHARS = 2_000_000

export const categoryTag = (c: InputCategory): string => c.replace(/\s+/g, '-')

const LABEL: Record<InputCategory, string> = {
  'sales collateral': 'Sales collateral',
  'customer references': 'Customer reference',
  'competitive-intel': 'Competitive intel',
  'company strategy': 'Company strategy document',
  roadmap: 'Roadmap',
  'help-docs': 'Help doc'
}

export interface InputRecord {
  /** File name in inbox/.processed/ (or inbox/ while unread). */
  name: string
  category: InputCategory | null
  size: number
  readable: boolean
  /** Raw file the text went to, or null when it couldn't be read. */
  raw: string | null
  status: 'ok' | 'empty' | 'failed' | 'not-read'
  /** Where the copy is: processed after ingest, inbox when it could not be read. */
  location: 'processed' | 'inbox'
}

const isReadable = (name: string): boolean =>
  (READABLE_EXTENSIONS as readonly string[]).includes(extname(name).slice(1).toLowerCase())

const mb = (bytes: number): number => Math.round(bytes / 1024 / 1024)

const recordsPath = async (root: string): Promise<string> =>
  join(await stateDir(root), 'inputs.json')

export async function readRecords(root: string): Promise<InputRecord[]> {
  try {
    const data = JSON.parse(await readFile(await recordsPath(root), 'utf8')) as unknown
    return Array.isArray(data) ? (data as InputRecord[]) : []
  } catch {
    return []
  }
}

const saveRecords = async (root: string, records: InputRecord[]): Promise<void> =>
  writeJsonAtomic(await recordsPath(root), records)

const copyPath = (r: InputRecord): string =>
  r.location === 'processed' ? `inbox/.processed/${r.name}` : `inbox/${r.name}`

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** Copies src into dir without overwriting: "deck.pdf", "deck-2.pdf"... Returns the name used. */
async function copyUnique(src: string, dir: string, name = basename(src)): Promise<string> {
  const ext = extname(name)
  const stem = basename(name, ext)
  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? `${stem}${ext}` : `${stem}-${n}${ext}`
    try {
      await copyFile(src, join(dir, candidate), constants.COPYFILE_EXCL)
      return candidate
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    }
  }
  throw new Error('Too many files with the same name')
}

/** Moves inbox/<name> to inbox/.processed/, renaming on a clash. Returns the new name. */
async function moveToProcessed(root: string, name: string): Promise<string> {
  const dir = join(root, 'inbox', '.processed')
  await mkdir(dir, { recursive: true })
  const ext = extname(name)
  const stem = basename(name, ext)
  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? name : `${stem}-${n}${ext}`
    if (await exists(join(dir, candidate))) continue
    await rename(join(root, 'inbox', name), join(dir, candidate))
    return candidate
  }
  throw new Error('Too many files with the same name')
}

/**
 * Extracts one file sitting in inbox/ into raw/, then moves it to inbox/.processed/.
 * Unreadable files stay in inbox/ (llm-wiki allows anything there) and get no raw file.
 */
async function ingestOne(
  root: string,
  name: string,
  category: InputCategory | null,
  date: string
): Promise<InputRecord> {
  const path = join(root, 'inbox', name)
  const size = (await stat(path)).size
  const base = { category, size, readable: isReadable(name) }
  if (!base.readable) return { ...base, name, raw: null, status: 'not-read', location: 'inbox' }
  let text: string
  try {
    text = replaceEmDashes(cleanText(await extractText_(path)))
  } catch {
    // Never put file content in an error or a log.
    return { ...base, name, raw: null, status: 'failed', location: 'inbox' }
  }
  if (!text || text === '```csv\n\n```')
    return { ...base, name, raw: null, status: 'empty', location: 'inbox' }

  const processed = await moveToProcessed(root, name)
  const ext = extname(name).slice(1).toLowerCase()
  const type = ext === 'csv' ? 'data' : 'papers'
  const title = basename(name, extname(name)).replace(/\s+/g, ' ').trim() || name
  const rel = await freeRel(root, rawRel(type, date, title))
  const body =
    text.length > MAX_RAW_CHARS ? `${text.slice(0, MAX_RAW_CHARS)}\n\n[Shortened on import.]` : text
  const words = text.split(/\s+/).filter(Boolean).length
  await writeFile(
    safeJoin(root, rel),
    stringifyDoc(
      'raw',
      {
        title,
        source: `inbox/.processed/${processed}`,
        type,
        ingested: date,
        tags: ['private', ...(category ? [categoryTag(category)] : [])],
        summary: `${category ? LABEL[category] : 'A file'} you added: ${name} (about ${words.toLocaleString('en-US')} words). Private.`
      },
      `# ${title}\n\n${body}`
    ),
    { flag: 'wx' }
  )
  return { ...base, name: processed, raw: rel, status: 'ok', location: 'processed' }
}

export async function listInputs(root: string): Promise<Record<InputCategory, InputFile[]>> {
  const out = Object.fromEntries(INPUT_CATEGORIES.map((c) => [c, [] as InputFile[]])) as Record<
    InputCategory,
    InputFile[]
  >
  for (const r of await readRecords(root)) {
    if (!r.category || !(await exists(join(root, copyPath(r))))) continue
    out[r.category].push({ name: r.name, size: r.size, readable: r.status === 'ok' })
  }
  for (const c of INPUT_CATEGORIES) out[c].sort((a, b) => a.name.localeCompare(b.name))
  return out
}

/** Copies the files in (never moves them) and ingests each into raw/. */
export async function addInputs(
  root: string,
  category: InputCategory,
  paths: string[],
  date: string = isoDay()
): Promise<AddResult> {
  const result: AddResult = { added: [], refused: [] }
  const records = await readRecords(root)
  let total = records.length
  await mkdir(join(root, 'inbox'), { recursive: true })
  for (const src of paths) {
    const name = basename(src)
    try {
      const info = await stat(src)
      if (!info.isFile()) {
        result.refused.push({ name, reason: 'Folders are not supported. Add the files inside it.' })
      } else if (info.size > INPUT_LIMITS.maxFileBytes) {
        result.refused.push({ name, reason: `Over ${mb(INPUT_LIMITS.maxFileBytes)} MB.` })
      } else if (total >= INPUT_LIMITS.maxFiles) {
        result.refused.push({ name, reason: `Limit of ${INPUT_LIMITS.maxFiles} files reached.` })
      } else {
        const copied = await copyUnique(src, join(root, 'inbox'))
        const record = await ingestOne(root, copied, category, date)
        records.push(record)
        total++
        result.added.push({
          name: record.name,
          size: record.size,
          readable: record.status === 'ok'
        })
      }
    } catch {
      result.refused.push({ name, reason: "Couldn't read this file." })
    }
  }
  await saveRecords(root, records)
  const ingested = records.slice(-result.added.length).filter((r) => r.raw)
  if (result.added.length) {
    for (const r of ingested) await appendLog(root, 'ingest', `${r.name} (${r.raw})`, date)
    await writeIndexes(root)
  }
  return result
}

/**
 * Files someone dropped straight into inbox/ (in Finder, say) are ingested too, without a
 * category. Run by the research step that reads the person's files.
 */
export async function ingestInbox(root: string, date: string = isoDay()): Promise<InputRecord[]> {
  const records = await readRecords(root)
  const known = new Set(records.filter((r) => r.location === 'inbox').map((r) => r.name))
  let names: string[] = []
  try {
    names = (await readdir(join(root, 'inbox'), { withFileTypes: true }))
      .filter((e) => e.isFile() && !e.name.startsWith('.') && !known.has(e.name))
      .map((e) => e.name)
      .sort()
  } catch {
    /* no inbox */
  }
  const added: InputRecord[] = []
  for (const name of names) added.push(await ingestOne(root, name, null, date))
  if (added.length) {
    await saveRecords(root, [...records, ...added])
    for (const r of added.filter((x) => x.raw))
      await appendLog(root, 'ingest', `${r.name} (${r.raw})`, date)
    await writeIndexes(root)
  }
  return [...records, ...added]
}

/**
 * Takes a file back out: its raw file and its kept copy. Refused once an article cites it, because
 * raw sources that articles rely on are never removed by the app.
 */
export async function removeInput(
  root: string,
  category: InputCategory,
  name: string
): Promise<boolean> {
  if (!name || name !== basename(name) || name.startsWith('.')) return false
  const records = await readRecords(root)
  const i = records.findIndex((r) => r.category === category && r.name === name)
  if (i < 0) return false
  const r = records[i]
  if (r.raw) {
    const cited = (await scanWiki(root)).some(
      (f) =>
        f.kind === 'article' &&
        Array.isArray(f.data?.sources) &&
        (f.data!.sources as unknown[]).includes(r.raw)
    )
    if (cited) return false
    await rm(safeJoin(root, r.raw), { force: true })
  }
  await rm(safeJoin(root, copyPath(r)), { force: true })
  records.splice(i, 1)
  await saveRecords(root, records)
  await writeIndexes(root)
  return true
}

/**
 * "Paste it" (REQUIREMENTS-v2 4.1): the founder's own text for a social profile the research
 * could not read becomes a new raw note. Raw files are never edited, so this never changes an
 * existing one; the taglines step is re-run to pick it up.
 */
export async function pasteSocialNote(
  root: string,
  network: string,
  text: string,
  url: string,
  date: string = isoDay()
): Promise<string> {
  const net =
    network
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'social'
  const clean = replaceEmDashes(text.replace(/\s+/g, ' ').trim())
  const rel = await freeRel(root, rawRel('notes', date, `social-${net}-pasted`))
  const source = /^https?:\/\//i.test(url) ? url : 'Pasted by the founder in PositioningHQ'
  await writeFile(
    safeJoin(root, rel),
    stringifyDoc(
      'raw',
      {
        title: `${network} profile (pasted)`,
        source,
        type: 'notes',
        ingested: date,
        tags: ['social', net, 'pasted'],
        summary: `The company's ${network} tagline or bio, pasted by the founder.`
      },
      `# ${network} profile (pasted)\n\n${/^https?:/.test(source) ? `URL: ${source}\n\n` : ''}Tagline or bio, as the founder pasted it:\n\n> ${clean}`
    ),
    { flag: 'wx' }
  )
  await appendLog(root, 'ingest', `${network} tagline pasted by the founder (${rel})`, date)
  await writeIndexes(root)
  return rel
}

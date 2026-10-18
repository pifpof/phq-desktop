import { createHash } from 'crypto'
import { mkdir, readdir, readFile, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { Profile } from '@shared/profile'
import { stateDir, writeJsonAtomic } from './app-state'

/**
 * What the app wrote, kept in app state (REQUIREMENTS-v3.1 4.2, 5): a copy of each page as last
 * generated (to spot and describe outside edits), the profile each run used (to list profile
 * edits since), and the versions a regeneration replaced (last 10 per page).
 */

/**
 * The page's own content: no front matter and no See Also section, which the app edits for
 * reciprocity long after a page is written. Equal hashes mean nobody changed what it says.
 */
export function contentHash(text: string): string {
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  const own = body.replace(/^## See Also\s*\n[\s\S]*?(?=^## |(?![\s\S]))/m, '').replace(/\s+/g, ' ')
  return createHash('sha256').update(own.trim()).digest('hex')
}

const generatedPath = async (root: string, rel: string): Promise<string> =>
  join(await stateDir(root), 'generated', ...rel.split('/'))

/** The page as the app last wrote it. */
export async function saveGenerated(root: string, rel: string, text: string): Promise<void> {
  const path = await generatedPath(root, rel)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text)
}

export async function readGenerated(root: string, rel: string): Promise<string | null> {
  return readFile(await generatedPath(root, rel), 'utf8').catch(() => null)
}

/** The profile fields research reads, as one run saw them. */
export type ProfileSnapshot = Pick<Profile, 'company' | 'user' | 'goals'>

export async function saveProfileSnapshot(
  root: string,
  runId: string,
  profile: Profile
): Promise<void> {
  const path = join(await stateDir(root), 'profile-snapshots', `${runId}.json`)
  try {
    await readFile(path)
  } catch {
    await mkdir(dirname(path), { recursive: true })
    const snap: ProfileSnapshot = {
      company: profile.company,
      user: profile.user,
      goals: profile.goals
    }
    await writeJsonAtomic(path, snap)
  }
}

export async function readProfileSnapshot(
  root: string,
  runId: string
): Promise<ProfileSnapshot | null> {
  try {
    return JSON.parse(
      await readFile(join(await stateDir(root), 'profile-snapshots', `${runId}.json`), 'utf8')
    ) as ProfileSnapshot
  } catch {
    return null
  }
}

const FIELD_LABELS: [string, (p: ProfileSnapshot) => unknown][] = [
  ['Company name', (p) => p.company.name],
  ['Website', (p) => p.company.website],
  ['Product name', (p) => p.company.productName],
  ['What the company does', (p) => p.company.description],
  ['Competitors', (p) => [...p.company.competitors].sort().join('|')],
  ['Your role', (p) => `${p.user.role}|${p.user.roleOther}`],
  ['Company size', (p) => p.user.companySize],
  ['Goals', (p) => [...p.goals].sort().join('|')]
]

/** Labels of the profile fields that differ. */
export function profileChanges(before: ProfileSnapshot, now: ProfileSnapshot): string[] {
  return FIELD_LABELS.filter(([, get]) => get(before) !== get(now)).map(([label]) => label)
}

// ---------------------------------------------------------------------------------------------
// Versions a regeneration replaced, and what it applied (for "What changed").

export interface HistoryEntry {
  runId: string
  page: string
  at: string
  /** Wiki path to { before, after } copies in app state. */
  files: { rel: string; before: string | null; after: string }[]
  changes: string[]
}

const KEEP_PER_PAGE = 10

async function historyIndex(root: string): Promise<{ file: string; entries: HistoryEntry[] }> {
  const file = join(await stateDir(root), 'history', 'index.json')
  try {
    return { file, entries: JSON.parse(await readFile(file, 'utf8')) as HistoryEntry[] }
  } catch {
    return { file, entries: [] }
  }
}

export async function recordHistory(
  root: string,
  entry: Omit<HistoryEntry, 'files'> & {
    files: { rel: string; before: string | null; after: string }[]
  }
): Promise<HistoryEntry> {
  const dir = join(await stateDir(root), 'history', entry.runId)
  await mkdir(dir, { recursive: true })
  const files: HistoryEntry['files'] = []
  for (const [i, f] of entry.files.entries()) {
    const after = join(dir, `${i}-after.md`)
    await writeFile(after, f.after)
    let before: string | null = null
    if (f.before !== null) {
      before = join(dir, `${i}-before.md`)
      await writeFile(before, f.before)
    }
    files.push({ rel: f.rel, before, after })
  }
  const saved: HistoryEntry = { ...entry, files }
  const { file, entries } = await historyIndex(root)
  const next = [saved, ...entries]
  // Last 10 per page; older ones and their copies go.
  const seen = new Map<string, number>()
  const keep: HistoryEntry[] = []
  for (const e of next) {
    const n = (seen.get(e.page) ?? 0) + 1
    seen.set(e.page, n)
    if (n <= KEEP_PER_PAGE) keep.push(e)
    else await rm(join(await stateDir(root), 'history', e.runId), { recursive: true, force: true })
  }
  await mkdir(dirname(file), { recursive: true })
  await writeJsonAtomic(file, keep)
  return saved
}

export async function listHistory(root: string): Promise<HistoryEntry[]> {
  return (await historyIndex(root)).entries
}

export async function readHistoryFiles(
  entry: HistoryEntry
): Promise<{ rel: string; before: string | null; after: string }[]> {
  const out: { rel: string; before: string | null; after: string }[] = []
  for (const f of entry.files) {
    const after = await readFile(f.after, 'utf8').catch(() => '')
    const before = f.before ? await readFile(f.before, 'utf8').catch(() => null) : null
    out.push({ rel: f.rel, before, after })
  }
  return out
}

/** Empties a folder of leftovers (staging on launch). */
export async function clearDir(path: string): Promise<void> {
  try {
    for (const e of await readdir(path)) await rm(join(path, e), { recursive: true, force: true })
  } catch {
    // nothing there
  }
}

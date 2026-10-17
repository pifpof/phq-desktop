import { createHash, randomUUID } from 'crypto'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import { workspaceIdFrom } from '../wiki/templates'

/**
 * App state outside the wiki (REQUIREMENTS-v2 2.1): userData/workspaces/<workspace_id>/ holds
 * workspace.json, profile.json, runs/, chats/ and provenance.json. The ID lives in the wiki's
 * config.md body ("Workspace ID: <uuid>"), so state follows the wiki when it is moved.
 */

let base: string | null = null

/** Called once at startup with app.getPath('userData'). Tests pass a temp folder. */
export function initAppState(userDataDir: string): void {
  base = join(userDataDir, 'workspaces')
}

export function stateRoot(): string {
  if (!base) throw new Error('App state is not initialised.')
  return base
}

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Remembered per folder for this session; config.md is read once. */
const cache = new Map<string, string>()

export function forgetWorkspace(root?: string): void {
  if (root) cache.delete(resolve(root))
  else cache.clear()
}

async function readConfig(root: string): Promise<string | null> {
  try {
    return await readFile(join(root, 'config.md'), 'utf8')
  } catch {
    return null
  }
}

/** A stable ID for a folder that has no config.md (never written anywhere). */
function pathId(root: string): string {
  const h = createHash('sha256').update(resolve(root)).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/** Adds the PositioningHQ section with a new ID to config.md, keeping everything else. */
export function withWorkspaceId(config: string, id: string): string {
  const trimmed = config.replace(/\s+$/, '')
  if (/^## PositioningHQ\s*$/m.test(trimmed))
    return (
      trimmed.replace(/^## PositioningHQ\s*$/m, `## PositioningHQ\n\nWorkspace ID: ${id}`) + '\n'
    )
  return `${trimmed}\n\n## PositioningHQ\n\nWorkspace ID: ${id}\n`
}

/**
 * The workspace ID for a wiki. A wiki without one (made by the skill pack, or by hand) gets a
 * new ID added to its config.md. A folder without config.md gets an ID derived from its path.
 */
export async function workspaceId(root: string): Promise<string> {
  const key = resolve(root)
  const cached = cache.get(key)
  if (cached) return cached
  const config = await readConfig(root)
  let id = config ? workspaceIdFrom(config) : null
  if (config && !id) {
    id = randomUUID()
    await writeFile(join(root, 'config.md'), withWorkspaceId(config, id))
  }
  if (!id || !ID_RE.test(id)) id = pathId(root)
  cache.set(key, id)
  return id
}

/** userData/workspaces/<id>/, created on first use. */
export async function stateDir(root: string): Promise<string> {
  const dir = join(stateRoot(), await workspaceId(root))
  await mkdir(dir, { recursive: true })
  return dir
}

/** Writes JSON atomically (temp file, then rename). */
export async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  const tmp = `${path}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2))
  await rename(tmp, path)
}

export interface WorkspaceRecord {
  schemaVersion: 1
  workspaceId: string
  /** The folder this state was last used with. Informational: the ID is what links them. */
  lastPath: string
  createdAt: string
  appVersion: string
}

/** Creates workspace.json for a wiki if missing, and records the folder it was opened from. */
export async function touchWorkspace(root: string, appVersion: string): Promise<WorkspaceRecord> {
  const dir = await stateDir(root)
  const file = join(dir, 'workspace.json')
  let record: WorkspaceRecord | null = null
  try {
    record = JSON.parse(await readFile(file, 'utf8')) as WorkspaceRecord
  } catch {
    /* new state */
  }
  const next: WorkspaceRecord = {
    schemaVersion: 1,
    workspaceId: await workspaceId(root),
    lastPath: resolve(root),
    createdAt: record?.createdAt ?? new Date().toISOString(),
    appVersion
  }
  await writeJsonAtomic(file, next)
  return next
}

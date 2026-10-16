import { constants } from 'fs'
import { access, mkdir, readFile, stat, writeFile } from 'fs/promises'
import { join } from 'path'

const MARKER_DIR = '.positioninghq'
const MARKER_FILE = 'workspace.json'

export const markerPath = (workspace: string): string => join(workspace, MARKER_DIR, MARKER_FILE)

export async function isWritableDir(path: string): Promise<boolean> {
  try {
    if (!(await stat(path)).isDirectory()) return false
    await access(path, constants.W_OK)
    return true
  } catch {
    return false
  }
}

export async function hasMarker(workspace: string): Promise<boolean> {
  try {
    JSON.parse(await readFile(markerPath(workspace), 'utf8'))
    return true
  } catch {
    return false
  }
}

export function defaultWorkspacePath(documentsDir: string): string {
  return join(documentsDir, 'PositioningHQ')
}

/** Creates the folder if missing and checks it is writable. */
export async function ensureWorkspaceDir(path: string): Promise<boolean> {
  try {
    await mkdir(path, { recursive: true })
  } catch {
    return false
  }
  return isWritableDir(path)
}

/**
 * Validates the folder and writes the marker. An existing marker is kept as is.
 * Returns null when the folder is not writable.
 */
export async function confirmWorkspace(
  path: string,
  appVersion: string
): Promise<{ existing: boolean } | null> {
  if (!(await ensureWorkspaceDir(path))) return null
  if (await hasMarker(path)) return { existing: true }
  try {
    await mkdir(join(path, MARKER_DIR), { recursive: true })
    await writeFile(
      markerPath(path),
      JSON.stringify({ schemaVersion: 1, createdAt: new Date().toISOString(), appVersion }, null, 2)
    )
  } catch {
    return null
  }
  return { existing: false }
}

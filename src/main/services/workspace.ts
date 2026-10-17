import { randomUUID } from 'crypto'
import { constants } from 'fs'
import { access, mkdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import { forgetWorkspace, touchWorkspace } from '../state/app-state'
import { parseDoc } from '../wiki/frontmatter'
import { isoDay } from '../wiki/paths'
import { createSkeleton } from '../wiki/skeleton'
import { detectWorkspace, statusOf } from '../workspace/detect'
import { PLACEHOLDER_COMPANY } from '../workspace/profile'

export async function isWritableDir(path: string): Promise<boolean> {
  try {
    if (!(await stat(path)).isDirectory()) return false
    await access(path, constants.W_OK)
    return true
  } catch {
    return false
  }
}

/** The folder is a PositioningHQ wiki (config.md declares a format_version). */
export async function isPhqWiki(path: string): Promise<boolean> {
  try {
    const doc = parseDoc(await readFile(join(path, 'config.md'), 'utf8'))
    return !!doc && 'format_version' in doc.data
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

export type ConfirmResult =
  | { ok: true; existing: boolean }
  | { ok: false; reason: 'not_writable' | 'needs_migration' | 'other_wiki' }

/**
 * Sets a folder up as the workspace (REQUIREMENTS-v2 2.2). An empty or unrelated folder gets the
 * wiki skeleton; an existing PositioningHQ wiki is used as it is (read-only if it is newer than
 * this app); old layouts and other llm-wikis are refused until converted or swapped.
 */
export async function confirmWorkspace(
  path: string,
  appVersion: string,
  company: string | null = null
): Promise<ConfirmResult> {
  if (!(await ensureWorkspaceDir(path))) return { ok: false, reason: 'not_writable' }
  const detection = await detectWorkspace(path)
  const status = statusOf(detection.kind)
  if (status === 'needs-migration') return { ok: false, reason: 'needs_migration' }
  if (status === 'other-wiki') return { ok: false, reason: 'other_wiki' }
  forgetWorkspace(path)
  const existing = await isPhqWiki(path)
  try {
    if (!existing) {
      await createSkeleton(path, {
        company: company || detection.company?.name || PLACEHOLDER_COMPANY,
        workspaceId: randomUUID(),
        created: isoDay()
      })
    }
    await touchWorkspace(path, appVersion)
  } catch {
    return { ok: false, reason: 'not_writable' }
  }
  return { ok: true, existing }
}

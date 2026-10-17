import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { ProfileSchema } from '@shared/profile'
import { FORMAT_VERSION } from '@shared/wiki-types'
import type { Detection } from '@shared/workspace'
import { parseDoc, stringField } from '../wiki/frontmatter'
import { outputVersions } from '../wiki/paths'
import { scanWiki } from '../wiki/scan'
import { exists } from './fs-util'
import { readVaultConfig } from './vault-config'

/** Files and folders that do not count as "content" in a folder. */
const IGNORED = new Set(['thumbs.db', 'desktop.ini', 'icon\r'])
const isIgnored = (name: string): boolean => name.startsWith('.') || IGNORED.has(name.toLowerCase())

const none = { company: null, formatVersion: null }

/** config.md front matter, when it is a PositioningHQ config (has format_version). */
async function phqConfig(
  root: string
): Promise<{ title: string; website: string; version: number | null } | null> {
  try {
    const doc = parseDoc(await readFile(join(root, 'config.md'), 'utf8'))
    if (!doc || !('format_version' in doc.data)) return null
    const v = doc.data.format_version
    return {
      title: stringField(doc.data.title),
      website: '',
      version: typeof v === 'number' && Number.isInteger(v) ? v : null
    }
  } catch {
    return null
  }
}

/** Company name and website from a v1 workspace's profile.json, if readable. */
async function v1Company(root: string): Promise<Detection['company']> {
  try {
    const raw = JSON.parse(await readFile(join(root, '.positioninghq', 'profile.json'), 'utf8'))
    const p = ProfileSchema.safeParse(raw)
    if (p.success && p.data.company.name)
      return { name: p.data.company.name, website: p.data.company.website }
  } catch {
    /* unreadable */
  }
  return null
}

/** Research has produced something: a playbook, or any article besides the company profile. */
async function hasResearch(root: string): Promise<boolean> {
  if ((await outputVersions(root, 'positioning-playbook')).length) return true
  return (await scanWiki(root)).some((f) => f.kind === 'article' && f.name !== 'company-profile')
}

/** REQUIREMENTS-v2 2.2. Call before the workspace is set up. */
export async function detectWorkspace(root: string): Promise<Detection> {
  const config = await phqConfig(root)
  if (config) {
    const company = config.title ? { name: config.title, website: config.website } : null
    const formatVersion = config.version
    if (formatVersion !== null && formatVersion > FORMAT_VERSION)
      return { kind: 'phq-newer', company, formatVersion }
    if (formatVersion === null || formatVersion < FORMAT_VERSION)
      return { kind: 'phq-older', company, formatVersion }
    return {
      kind: (await hasResearch(root)) ? 'phq-complete' : 'phq-incomplete',
      company,
      formatVersion
    }
  }

  if (
    (await exists(join(root, '.positioninghq', 'workspace.json'))) &&
    (await exists(join(root, 'memory')))
  )
    return { kind: 'v1-workspace', company: await v1Company(root), formatVersion: null }

  const vault = await readVaultConfig(root)
  if (vault)
    return {
      kind: 'skillpack-vault',
      company: { name: vault.name, website: vault.website },
      formatVersion: null
    }

  if (
    (await exists(join(root, '_index.md'))) &&
    (await exists(join(root, 'raw'))) &&
    (await exists(join(root, 'wiki')))
  )
    return { kind: 'other-wiki', ...none }

  let entries: string[] = []
  try {
    entries = await readdir(root)
  } catch {
    // a folder that does not exist yet is empty
  }
  return { kind: entries.some((e) => !isIgnored(e)) ? 'non-empty' : 'empty', ...none }
}

export type WorkspaceStatus = 'ok' | 'read-only' | 'needs-migration' | 'other-wiki'

/** What the app may do with a folder it has detected. */
export function statusOf(kind: Detection['kind']): WorkspaceStatus {
  if (kind === 'phq-newer') return 'read-only'
  if (kind === 'phq-older' || kind === 'v1-workspace' || kind === 'skillpack-vault')
    return 'needs-migration'
  if (kind === 'other-wiki') return 'other-wiki'
  return 'ok'
}

/**
 * The status of the configured workspace, cheaply (no wiki scan): read on every app:getState and
 * before every write.
 */
export async function workspaceStatus(root: string): Promise<WorkspaceStatus> {
  const config = await phqConfig(root)
  if (config) {
    if (config.version !== null && config.version > FORMAT_VERSION) return 'read-only'
    return config.version === FORMAT_VERSION ? 'ok' : 'needs-migration'
  }
  if (
    ((await exists(join(root, '.positioninghq', 'workspace.json'))) &&
      (await exists(join(root, 'memory')))) ||
    (await readVaultConfig(root))
  )
    return 'needs-migration'
  if (
    (await exists(join(root, '_index.md'))) &&
    (await exists(join(root, 'raw'))) &&
    (await exists(join(root, 'wiki')))
  )
    return 'other-wiki'
  return 'ok'
}

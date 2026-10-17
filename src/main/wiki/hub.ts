import { appendFile, readFile, rename, stat, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { isAbsolute, join, relative, resolve, sep } from 'path'
import { isoDay, slugify } from './paths'

/**
 * The llm-wiki hub (REQUIREMENTS-v2 2.3, spec section 10). Read from
 * ~/.config/llm-wiki/config.json; only a leading ~ in hub_path is expanded. The app writes to the
 * hub only with consent, and only two files: wikis.json (one entry) and log.md (one line).
 */

export interface Hub {
  path: string
  topicsPath: string
}

const expandTilde = (p: string, home: string): string =>
  p === '~' ? home : p.startsWith('~/') || p.startsWith('~\\') ? join(home, p.slice(2)) : p

interface Registry {
  wikis?: Record<string, { path?: string; description?: string; status?: string }>
  [key: string]: unknown
}

async function readRegistry(hubPath: string): Promise<Registry | null> {
  try {
    const data = JSON.parse(await readFile(join(hubPath, 'wikis.json'), 'utf8')) as unknown
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    const wikis = (data as Registry).wikis
    if (wikis !== undefined && (typeof wikis !== 'object' || Array.isArray(wikis))) return null
    return data as Registry
  } catch {
    return null
  }
}

/** The hub, when its config exists and wikis.json is readable. Otherwise null (the option is hidden). */
export async function findHub(home: string = homedir()): Promise<Hub | null> {
  try {
    const config = JSON.parse(
      await readFile(join(home, '.config', 'llm-wiki', 'config.json'), 'utf8')
    ) as { hub_path?: unknown }
    if (typeof config.hub_path !== 'string' || !config.hub_path.trim()) return null
    const path = resolve(expandTilde(config.hub_path.trim(), home))
    if (!(await readRegistry(path))) return null
    if (!(await stat(join(path, 'topics'))).isDirectory()) return null
    return { path, topicsPath: join(path, 'topics') }
  } catch {
    return null
  }
}

/** <hub>/topics/<company-slug>/ */
export const hubWorkspacePath = (hub: Hub, name: string): string =>
  join(hub.topicsPath, slugify(name, 'company'))

/** The registry key and relative path for a folder inside <hub>/topics/, else null. */
function topicOf(hub: Hub, workspace: string): { slug: string; rel: string } | null {
  const rel = relative(hub.topicsPath, resolve(workspace))
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || rel.includes(sep)) return null
  return { slug: rel, rel: `topics/${rel}` }
}

export async function isRegistered(hub: Hub, workspace: string): Promise<boolean> {
  const topic = topicOf(hub, workspace)
  const registry = await readRegistry(hub.path)
  if (!topic || !registry) return false
  return (
    Object.values(registry.wikis ?? {}).some(
      (e) => e?.path === topic.rel || e?.path === `<HUB>/${topic.rel}`
    ) || !!registry.wikis?.[topic.slug]
  )
}

/**
 * Adds the wiki to wikis.json and one line to the hub log.md. Keeps every other key and entry;
 * writes the JSON the way llm-wiki does (two-space indent, trailing newline), atomically.
 * Returns false when the folder is not directly inside <hub>/topics/ or the registry is unreadable.
 */
export async function registerInHub(
  hub: Hub,
  workspace: string,
  description: string,
  date: string = isoDay()
): Promise<boolean> {
  const topic = topicOf(hub, workspace)
  const registry = await readRegistry(hub.path)
  if (!topic || !registry) return false
  if (await isRegistered(hub, workspace)) return true
  registry.wikis = {
    ...(registry.wikis ?? {}),
    [topic.slug]: { path: topic.rel, description, status: 'active' }
  }
  const file = join(hub.path, 'wikis.json')
  await writeFile(`${file}.tmp`, JSON.stringify(registry, null, 2) + '\n')
  await rename(`${file}.tmp`, file)
  try {
    await stat(join(hub.path, 'log.md'))
    await appendFile(
      join(hub.path, 'log.md'),
      `\n## [${date}] register | PositioningHQ wiki ${topic.slug} (${topic.rel})\n`
    )
  } catch {
    /* llm-wiki skips the log line when the hub has no log.md; so do we */
  }
  return true
}

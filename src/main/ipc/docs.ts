import { clipboard, shell } from 'electron'
import { readdir, readFile, stat, writeFile, rename } from 'fs/promises'
import { join } from 'path'
import matter from 'gray-matter'
import { isAllowedExternalUrl } from '@shared/links'
import { setTagline } from '@shared/social'
import type { AppContext } from '../context'
import { listDocs, readDoc } from '../workspace/documents'
import { exists } from '../workspace/fs-util'
import { resolveInside } from '../workspace/paths'
import { stateDir } from '../state/app-state'
import { writableRoot } from './guard'
import { HandlerError, type Handle } from './register'
import { readProfile, writeProfile } from '../workspace/profile'

export function registerDocs(handle: Handle, ctx: AppContext): void {
  const root = (): string => {
    const r = ctx.settings.get().workspacePath
    if (!r) throw new HandlerError('no_workspace')
    return r
  }

  handle('profile:get', () => readProfile(root()))
  handle('profile:save', async (profile) => {
    await writeProfile(await writableRoot(ctx), profile)
    return null
  })

  handle('docs:list', ({ dir }) => listDocs(root(), dir))
  handle('docs:read', ({ path }) => readDoc(root(), path))

  handle('docs:copy', async ({ path }) => {
    const full = resolveInside(root(), path)
    if (!full || !(await exists(full))) throw new HandlerError('not_allowed')
    // The document as markdown, without the app's front matter.
    clipboard.writeText(matter(await readFile(full, 'utf8')).content.trim() + '\n')
    return null
  })

  /** Has the profile, or any user file, changed since this time? Drives the playbook's "out of date" banner. */
  handle('docs:changedSince', async ({ since }) => {
    const t = Date.parse(since)
    if (Number.isNaN(t)) throw new HandlerError('invalid_payload')
    const r = root()
    const newer = async (p: string): Promise<boolean> => {
      try {
        return (await stat(p)).mtimeMs > t + 1000
      } catch {
        return false
      }
    }
    let inputs = false
    try {
      for (const e of await readdir(join(r, 'inputs'), { recursive: true, withFileTypes: true })) {
        if (e.isFile() && !e.name.startsWith('.') && (await newer(join(e.parentPath, e.name)))) {
          inputs = true
          break
        }
      }
    } catch {
      // no inputs folder
    }
    return { profile: await newer(join(await stateDir(r), 'profile.json')), inputs }
  })

  /** "Paste it": the person's own text for a profile the research could not read. */
  handle('social:setTagline', async ({ network, text }) => {
    const full = join(await writableRoot(ctx), 'memory', 'research', 'social-taglines.md')
    let raw: string
    try {
      raw = await readFile(full, 'utf8')
    } catch {
      throw new HandlerError('not_allowed')
    }
    const parsed = matter(raw)
    const updated = setTagline(parsed.content, network, text)
    if (updated === null) throw new HandlerError('not_allowed')
    const tmp = `${full}.tmp`
    await writeFile(
      tmp,
      matter.stringify(updated, { ...parsed.data, edited: new Date().toISOString() })
    )
    await rename(tmp, full)
    return null
  })

  /**
   * A source link from a research document: any https URL listed in that document's `sources`,
   * once the person has agreed to open research links.
   */
  handle('shell:openSource', async ({ url, path }) => {
    if (!ctx.settings.get().openResearchLinks) throw new HandlerError('not_allowed')
    const doc = await readDoc(root(), path)
    const sources = Array.isArray(doc?.frontMatter.sources) ? doc.frontMatter.sources : []
    let ok: boolean
    try {
      const u = new URL(url)
      ok = u.protocol === 'https:' && !u.username && !u.password && sources.includes(url)
    } catch {
      ok = false
    }
    if (!ok && !isAllowedExternalUrl(url)) throw new HandlerError('not_allowed')
    await shell.openExternal(url)
    return null
  })

  handle('settings:allowResearchLinks', () => {
    ctx.settings.update({ openResearchLinks: true })
    return null
  })

  handle('docs:reveal', async ({ path }) => {
    const full = resolveInside(root(), path)
    if (!full || !(await exists(full))) throw new HandlerError('not_allowed')
    shell.showItemInFolder(full)
    return null
  })

  handle('docs:openInEditor', async ({ path }) => {
    const full = resolveInside(root(), path)
    if (!full || !(await exists(full))) throw new HandlerError('not_allowed')
    await shell.openPath(full)
    return null
  })
}

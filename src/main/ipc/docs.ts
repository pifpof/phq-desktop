import { clipboard, shell } from 'electron'
import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import matter from 'gray-matter'
import { isAllowedExternalUrl } from '@shared/links'
import { parseSocialTable } from '@shared/social'
import { pasteSocialNote } from '../ingest/files-to-raw'
import type { AppContext } from '../context'
import { listDocs, readDoc } from '../workspace/documents'
import { exists } from '../workspace/fs-util'
import { resolveInside } from '../workspace/paths'
import { readProvenance } from '../state/provenance'
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
  handle('docs:changedSince', async ({ path }) => {
    const r = root()
    const full = resolveInside(r, path)
    if (!full) throw new HandlerError('not_allowed')
    // When the output was really written: provenance, else its file time. A `created` date is a
    // whole day, so anything written later that same day (the run itself) looked newer.
    const at = Date.parse((await readProvenance(r))[path]?.at ?? '')
    const t = Number.isNaN(at) ? await stat(full).then((s) => s.mtimeMs, () => NaN) : at
    if (Number.isNaN(t)) return { profile: false, inputs: false }
    const newer = async (p: string): Promise<boolean> => {
      try {
        return (await stat(p)).mtimeMs > t + 1000
      } catch {
        return false
      }
    }
    // The person's files are private raw sources now.
    let inputs = false
    for (const dir of ['raw/papers', 'raw/data', 'raw/notes']) {
      try {
        for (const e of await readdir(join(r, dir), { withFileTypes: true })) {
          if (e.isFile() && e.name !== '_index.md' && (await newer(join(r, dir, e.name)))) {
            inputs = true
            break
          }
        }
      } catch {
        // folder missing
      }
      if (inputs) break
    }
    return { profile: await newer(join(await stateDir(r), 'profile.json')), inputs }
  })

  /** "Paste it": the person's own text for a profile the research could not read. */
  handle('social:setTagline', async ({ network, text }) => {
    const r = await writableRoot(ctx)
    // The profile URL, when the research found one, from the taglines article's table.
    const article = await readFile(join(r, 'wiki/references/social-taglines.md'), 'utf8').catch(
      () => ''
    )
    const row = parseSocialTable(article).find(
      (x) => x.network.toLowerCase() === network.toLowerCase()
    )
    await pasteSocialNote(r, network, text, row?.url ?? '')
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

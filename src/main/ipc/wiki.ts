import { app, dialog, shell } from 'electron'
import { readFile } from 'fs/promises'
import { isAbsolute, join, relative, sep } from 'path'
import { CheckReportSchema } from '@shared/conformance'
import { NavStateSchema } from '@shared/wiki-tree'
import type { AppContext } from '../context'
import { exportSingleFile, exportZip } from '../export/wiki-export'
import { assemblePlaybook } from '../research/assemble-playbook'
import { recordProvenance } from '../state/provenance'
import { stateDir, writeJsonAtomic } from '../state/app-state'
import { checkWiki } from '../wiki/conformance'
import { fixWiki } from '../wiki/fix'
import { findHub, isRegistered, registerInHub } from '../wiki/hub'
import { isoDay } from '../wiki/paths'
import { wikiDescription } from '../wiki/templates'
import { articleDetail, listArticles, listOutputs, listSources } from '../wiki/views'
import { readProfile } from '../workspace/profile'
import { workspaceRoot, writableRoot } from './guard'
import { HandlerError, type Handle } from './register'

export function registerWiki(handle: Handle, ctx: AppContext): void {
  const root = (): string => workspaceRoot(ctx)
  /** Writes that touch articles or outputs wait until a run is not writing them too. */
  const idleRoot = async (): Promise<string> => {
    if (ctx.research.isActive()) throw new HandlerError('research_running')
    return writableRoot(ctx)
  }

  handle('wiki:check', () => checkWiki(root()))
  handle('wiki:fix', async () => fixWiki(await idleRoot()))
  handle('wiki:lastCheck', async () => {
    try {
      const raw = await readFile(join(await stateDir(root()), 'conformance.json'), 'utf8')
      const parsed = CheckReportSchema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  })

  handle('wiki:articles', () => listArticles(root()))
  handle('wiki:article', ({ path }) => articleDetail(root(), path))
  handle('wiki:sources', () => listSources(root()))
  handle('wiki:tree', async () => (await ctx.wikiTree.get(root())).articles)
  handle('wiki:sourcesTree', async () => (await ctx.wikiTree.get(root())).sources)
  // Expand and collapse state: app state, never the wiki (REQUIREMENTS-v3 3.3).
  handle('wiki:getNavState', async () => {
    try {
      const raw = await readFile(join(await stateDir(root()), 'wiki-nav.json'), 'utf8')
      const parsed = NavStateSchema.safeParse(JSON.parse(raw))
      if (parsed.success) return parsed.data
    } catch {
      // first use, or an unreadable file: start from the defaults
    }
    return { collapsed: [], open: [] }
  })
  handle('wiki:setNavState', async (state) => {
    await writeJsonAtomic(join(await stateDir(root()), 'wiki-nav.json'), state)
    return null
  })
  handle('wiki:outputs', ({ kind }) => listOutputs(root(), kind))

  // Reassemble (REQUIREMENTS-v2 4.2): the playbook from the current articles, no model call.
  handle('wiki:reassemble', async () => {
    const r = await idleRoot()
    const company = (await readProfile(r))?.company.name || 'Company'
    const out = await assemblePlaybook(r, company, isoDay())
    await recordProvenance(r, {
      [out.output]: {
        task: 'reassemble',
        runId: 'manual',
        model: 'none',
        at: new Date().toISOString(),
        inputs: out.sources
      }
    })
    return { path: out.output, version: out.version }
  })

  handle('wiki:exportFile', async ({ includePrivate }) =>
    exportSingleFile(await idleRoot(), { includePrivate })
  )
  handle('wiki:exportZip', async () => {
    const r = root()
    const win = ctx.getWindow()
    const options = {
      title: 'Export the wiki as a zip',
      defaultPath: join(app.getPath('downloads'), `positioninghq-wiki-${isoDay()}.zip`),
      filters: [{ name: 'Zip', extensions: ['zip'] }]
    }
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    // Never write the zip inside the wiki it is a copy of.
    const rel = relative(r, result.filePath)
    if (!rel.startsWith('..') && !isAbsolute(rel)) throw new HandlerError('not_allowed')
    return { path: result.filePath, files: await exportZip(r, result.filePath) }
  })

  // Open as an Obsidian vault: the one extra URL scheme the app opens (REQUIREMENTS-v2 7.4).
  handle('shell:openObsidian', async () => {
    await shell.openExternal(`obsidian://open?path=${encodeURIComponent(root())}`)
    return null
  })

  handle('hub:get', async () => {
    const hub = await findHub()
    if (!hub) return null
    const ws = ctx.settings.get().workspacePath
    const rel = ws ? relative(hub.topicsPath, ws) : ''
    const insideHub = !!rel && !rel.startsWith('..') && !isAbsolute(rel) && !rel.includes(sep)
    return {
      hubPath: hub.path,
      topicsPath: hub.topicsPath,
      insideHub,
      registered: insideHub && ws ? await isRegistered(hub, ws) : false
    }
  })

  // Only on the person's explicit request: adds one wikis.json entry and one hub log line.
  handle('hub:register', async () => {
    const hub = await findHub()
    if (!hub) throw new HandlerError('no_hub')
    const ws = root()
    const company = (await readProfile(ws))?.company.name
    const description = company ? wikiDescription(company) : 'PositioningHQ positioning wiki'
    if (!(await registerInHub(hub, ws, description))) throw new HandlerError('no_hub')
    return null
  })
}

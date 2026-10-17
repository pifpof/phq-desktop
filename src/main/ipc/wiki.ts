import type { AppContext } from '../context'
import { checkWiki } from '../wiki/conformance'
import { findHub, isRegistered, registerInHub } from '../wiki/hub'
import { readProfile } from '../workspace/profile'
import { wikiDescription } from '../wiki/templates'
import { relative, isAbsolute, sep } from 'path'
import { fixWiki } from '../wiki/fix'
import { writableRoot } from './guard'
import { HandlerError, type Handle } from './register'

export function registerWiki(handle: Handle, ctx: AppContext): void {
  const root = (): string => {
    const r = ctx.settings.get().workspacePath
    if (!r) throw new HandlerError('no_workspace')
    return r
  }

  handle('wiki:check', () => checkWiki(root()))

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
    if (
      !(await registerInHub(
        hub,
        ws,
        company ? wikiDescription(company) : 'PositioningHQ positioning wiki'
      ))
    )
      throw new HandlerError('no_hub')
    return null
  })
  handle('wiki:fix', () => {
    // Fixes move files and regenerate indexes; a run may be writing the same folders.
    if (ctx.research.isActive()) throw new HandlerError('research_running')
    return writableRoot(ctx).then((r) => fixWiki(r))
  })
}

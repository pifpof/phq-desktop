import { dialog } from 'electron'
import { READABLE_EXTENSIONS } from '@shared/workspace'
import type { AppContext } from '../context'
import { addEvidenceFiles } from '../ingest/files-to-raw'
import {
  affectsOf,
  createChange,
  findChange,
  listChanges,
  pageSections,
  setChangeStatus,
  updateChange
} from '../wiki/changes'
import { stringField } from '../wiki/frontmatter'
import { scanWiki } from '../wiki/scan'
import { workspaceRoot, writableRoot } from './guard'
import { HandlerError, type Handle } from './register'

/** Changes (REQUIREMENTS-v3.1 3): saved right away as pending decision articles. */
export function registerChanges(handle: Handle, ctx: AppContext): void {
  const root = (): string => workspaceRoot(ctx)
  const pending = async (id: string): Promise<string> => {
    const r = await writableRoot(ctx)
    const c = await findChange(r, id)
    if (!c) throw new HandlerError('not_found')
    if (c.status !== 'pending') throw new HandlerError('not_pending')
    return r
  }

  handle('changes:list', () => listChanges(root()))
  handle('changes:page', async ({ page }) => {
    const f = (await scanWiki(root())).find(
      (x) => x.kind === 'article' && x.name === page && x.dir !== 'wiki/theses'
    )
    if (!f) return null
    return {
      slug: f.name,
      title: stringField(f.data?.title) || f.name,
      path: f.rel,
      sections: pageSections(f.body)
    }
  })
  handle('changes:affects', async ({ page }) => affectsOf(page, await scanWiki(root())))

  handle('changes:create', async (input) => {
    const r = await writableRoot(ctx)
    if (!(await scanWiki(r)).some((f) => f.kind === 'article' && f.name === input.page))
      throw new HandlerError('not_found')
    return createChange(r, input)
  })
  handle('changes:update', async ({ id, input }) => updateChange(await pending(id), id, input))
  handle('changes:withdraw', async ({ id }) => setChangeStatus(await pending(id), id, 'withdrawn'))

  handle('changes:addFiles', async () => {
    const target = await writableRoot(ctx)
    const win = ctx.getWindow()
    const options = {
      properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>,
      filters: [{ name: 'Documents', extensions: [...READABLE_EXTENSIONS] }]
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths.length) return []
    return addEvidenceFiles(target, result.filePaths)
  })
}

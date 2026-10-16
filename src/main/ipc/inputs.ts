import { dialog } from 'electron'
import { READABLE_EXTENSIONS } from '@shared/workspace'
import type { AppContext } from '../context'
import { addInputs, listInputs, removeInput } from '../workspace/inputs'
import { HandlerError, type Handle } from './register'

export function registerInputs(handle: Handle, ctx: AppContext): void {
  const root = (): string => {
    const r = ctx.settings.get().workspacePath
    if (!r) throw new HandlerError('no_workspace')
    return r
  }

  handle('inputs:list', () => listInputs(root()))

  handle('inputs:add', ({ category, paths }) => addInputs(root(), category, paths))

  handle('inputs:browse', async ({ category }) => {
    const win = ctx.getWindow()
    const options = {
      properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>,
      filters: [
        { name: 'Documents', extensions: [...READABLE_EXTENSIONS] },
        { name: 'All files', extensions: ['*'] }
      ]
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return { added: [], refused: [] }
    return addInputs(root(), category, result.filePaths)
  })

  handle('inputs:remove', async ({ category, name }) => {
    if (!(await removeInput(root(), category, name))) throw new HandlerError('not_allowed')
    return null
  })
}

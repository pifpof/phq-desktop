import { shell } from 'electron'
import { isAllowedExternalUrl } from '@shared/links'
import { HandlerError, type Handle } from './register'

export function openAllowlisted(url: string): boolean {
  if (!isAllowedExternalUrl(url)) return false
  void shell.openExternal(url)
  return true
}

export function registerShell(handle: Handle): void {
  handle('shell:openExternal', ({ url }) => {
    if (!openAllowlisted(url)) throw new HandlerError('not_allowed')
    return null
  })
}

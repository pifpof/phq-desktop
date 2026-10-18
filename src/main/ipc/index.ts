import type { AppContext } from '../context'
import { registerApp } from './app'
import { registerChanges } from './changes'
import { registerChat } from './chat'
import { registerDev } from './dev'
import { registerDocs } from './docs'
import { registerInputs } from './inputs'
import { registerNet } from './net'
import { registerRegen } from './regen'
import { registerResearch } from './research'
import { registerProvider } from './provider'
import { makeHandle } from './register'
import { registerShell } from './shell'
import { registerWiki } from './wiki'
import { registerMigrate } from './migrate'
import { registerWorkspace } from './workspace'

export function registerIpc(ctx: AppContext): void {
  const handle = makeHandle(ctx.log)
  registerApp(handle, ctx)
  registerProvider(handle, ctx)
  registerWorkspace(handle, ctx)
  registerChat(handle, ctx)
  registerDocs(handle, ctx)
  registerInputs(handle, ctx)
  registerNet(handle, ctx)
  registerResearch(handle, ctx)
  registerDev(handle, ctx)
  registerWiki(handle, ctx)
  registerChanges(handle, ctx)
  registerRegen(handle, ctx)
  registerMigrate(handle, ctx)
  registerShell(handle)
}

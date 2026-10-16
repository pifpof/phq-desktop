import type { AppContext } from '../context'
import { registerApp } from './app'
import { registerChat } from './chat'
import { registerDocs } from './docs'
import { registerProvider } from './provider'
import { makeHandle } from './register'
import { registerShell } from './shell'
import { registerWorkspace } from './workspace'

export function registerIpc(ctx: AppContext): void {
  const handle = makeHandle(ctx.log)
  registerApp(handle, ctx)
  registerProvider(handle, ctx)
  registerWorkspace(handle, ctx)
  registerChat(handle, ctx)
  registerDocs(handle, ctx)
  registerShell(handle)
}

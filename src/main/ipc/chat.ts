import { EVENT_CHAT } from '@shared/ipc-contract'
import type { AppContext } from '../context'
import { getProvider } from '../providers/registry'
import { HandlerError, type Handle } from './register'

export function registerChat(handle: Handle, ctx: AppContext): void {
  handle('chat:start', ({ modeId, messages }, event) => {
    const key = ctx.secrets.loadKey()
    if (!key) throw new HandlerError('no_key')
    const { model, provider } = ctx.settings.get()
    if (!model) throw new HandlerError('internal')

    const sender = event.sender
    const streamId = ctx.chat.start({
      provider: getProvider(provider),
      key,
      model,
      modeId,
      messages,
      send: (id, e) => {
        if (!sender.isDestroyed()) sender.send(EVENT_CHAT, { streamId: id, event: e })
      }
    })
    sender.once('destroyed', () => ctx.chat.cancel(streamId))
    return { streamId }
  })

  handle('chat:cancel', ({ streamId }) => {
    ctx.chat.cancel(streamId)
    return null
  })
}

import { EVENT_CHAT } from '@shared/ipc-contract'
import type { AppContext } from '../context'
import { modes } from '../modes'
import { deleteChat, getChat, listChats, renameChat, saveChat } from '../workspace/chats'
import { getProvider } from '../providers/registry'
import { HandlerError, type Handle } from './register'

export function registerChat(handle: Handle, ctx: AppContext): void {
  handle('chat:start', async ({ modeId, messages, pinned }, event) => {
    const key = ctx.secrets.loadKey()
    if (!key) throw new HandlerError('no_key')
    const { model, provider } = ctx.settings.get()
    if (!model) throw new HandlerError('internal')

    const { system, sources, stats } = await modes[modeId].context({
      root: ctx.settings.get().workspacePath,
      messages,
      pinned
    })
    // Sizes only: never the question or the articles (rule 15).
    if (stats)
      ctx.log.info(
        `Chat grounded in ${stats.articles} articles, about ${Math.round(stats.chars / 4)} tokens`
      )
    const sender = event.sender
    const streamId = ctx.chat.start({
      provider: getProvider(provider),
      key,
      model,
      system,
      messages,
      send: (id, e) => {
        if (!sender.isDestroyed()) sender.send(EVENT_CHAT, { streamId: id, event: e })
      }
    })
    sender.once('destroyed', () => ctx.chat.cancel(streamId))
    return { streamId, sources }
  })

  const root = (): string => {
    const r = ctx.settings.get().workspacePath
    if (!r) throw new HandlerError('no_workspace')
    return r
  }
  handle('chats:list', () => listChats(root()))
  handle('chats:get', ({ id }) => getChat(root(), id))
  handle('chats:save', async (chat) => (await saveChat(root(), chat), null))
  handle('chats:rename', async ({ id, title }) => {
    if (!(await renameChat(root(), id, title))) throw new HandlerError('not_allowed')
    return null
  })
  handle('chats:delete', async ({ id }) => (await deleteChat(root(), id), null))

  handle('chat:cancel', ({ streamId }) => {
    ctx.chat.cancel(streamId)
    return null
  })
}

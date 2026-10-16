import type { ModelInfo } from '@shared/types'
import type { AppContext } from '../context'
import { getProvider } from '../providers/registry'
import { fromProviderError, HandlerError, type Handle } from './register'

export function registerProvider(handle: Handle, ctx: AppContext): void {
  /** Keep the current model if the account still has it, else use the provider's default. */
  const resolveModel = (models: ModelInfo[]): ModelInfo | null => {
    const provider = getProvider(ctx.settings.get().provider)
    const current = models.find((m) => m.id === ctx.settings.get().model)
    if (current) return current
    const id = provider.pickDefaultModel(models)
    return models.find((m) => m.id === id) ?? null
  }

  handle('provider:verifyKey', async ({ key }) => {
    const trimmed = key.trim()
    const provider = getProvider(ctx.settings.get().provider)
    const result = await provider.verifyKey(trimmed)
    if (!result.ok) throw new HandlerError(result.code, result.detail)

    // The key is saved only after verification succeeds.
    const { persisted } = ctx.secrets.saveKey(trimmed)
    const selected = resolveModel(result.models)
    if (selected) ctx.settings.update({ model: selected.id, modelName: selected.displayName })
    return { models: result.models, defaultModelId: selected?.id ?? null, persisted }
  })

  handle('provider:listModels', async () => {
    const key = ctx.secrets.loadKey()
    if (!key) throw new HandlerError('no_key')
    const provider = getProvider(ctx.settings.get().provider)
    try {
      const models = await provider.listModels(key)
      const selected = resolveModel(models)
      return { models, defaultModelId: selected?.id ?? null }
    } catch (err) {
      throw fromProviderError(err)
    }
  })
}

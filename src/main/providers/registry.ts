import type { ProviderId } from '@shared/types'
import { anthropicProvider } from './anthropic'
import type { Provider } from './types'

const providers: Partial<Record<ProviderId, Provider>> = {
  anthropic: anthropicProvider
}

export function getProvider(id: ProviderId): Provider {
  const p = providers[id]
  if (!p) throw new Error(`Provider not available: ${id}`)
  return p
}

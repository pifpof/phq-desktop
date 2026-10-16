import Anthropic from '@anthropic-ai/sdk'
import type { ModelInfo } from '@shared/types'
import { errorMessage, type ProviderErrorCode } from '@shared/errors'
import { ProviderError, type Provider, type StreamChatArgs, type VerifyResult } from './types'

const MAX_TOKENS = 8192

/** Default rule: first model whose ID contains "sonnet", else the first model. */
export function pickDefaultModel(models: ModelInfo[]): string | null {
  return models.find((m) => m.id.includes('sonnet'))?.id ?? models[0]?.id ?? null
}

function errorType(err: InstanceType<typeof Anthropic.APIError>): string | undefined {
  const body = err.error as { error?: { type?: unknown }; type?: unknown } | undefined
  const t = body?.error?.type ?? body?.type
  return typeof t === 'string' ? t : undefined
}

export function isAbort(err: unknown): boolean {
  return (
    err instanceof Anthropic.APIUserAbortError ||
    (err instanceof Error && err.name === 'AbortError')
  )
}

export function mapAnthropicError(err: unknown): { code: ProviderErrorCode; detail?: string } {
  if (err instanceof Anthropic.AuthenticationError) return { code: 'invalid_key' }
  if (err instanceof Anthropic.PermissionDeniedError) return { code: 'no_permission' }
  if (err instanceof Anthropic.RateLimitError) return { code: 'rate_limited' }
  if (err instanceof Anthropic.APIConnectionError) return { code: 'network' }
  if (err instanceof Anthropic.APIError) {
    const type = errorType(err)
    if (err.status === 529 || type === 'overloaded_error') return { code: 'overloaded' }
    if (err.status === 400 && /credit balance/i.test(err.message)) return { code: 'no_credit' }
    return { code: 'unknown', detail: type }
  }
  return { code: 'unknown' }
}

function toProviderError(err: unknown): ProviderError {
  const { code, detail } = mapAnthropicError(err)
  return new ProviderError(code, detail)
}

async function listModels(key: string, client?: Anthropic): Promise<ModelInfo[]> {
  const c = client ?? new Anthropic({ apiKey: key, maxRetries: 1 })
  try {
    const out: ModelInfo[] = []
    for await (const m of c.models.list({ limit: 100 })) {
      out.push({ id: m.id, displayName: m.display_name, createdAt: m.created_at })
      if (out.length >= 500) break
    }
    return out
  } catch (err) {
    throw toProviderError(err)
  }
}

async function verifyKey(key: string): Promise<VerifyResult> {
  const client = new Anthropic({ apiKey: key, maxRetries: 1 })
  let models: ModelInfo[]
  try {
    models = await listModels(key, client)
  } catch (err) {
    const e = err as ProviderError
    return { ok: false, code: e.code, detail: e.detail }
  }
  const defaultModelId = pickDefaultModel(models)
  if (!defaultModelId) return { ok: false, code: 'unknown', detail: 'no_models' }
  try {
    await client.messages.create({
      model: defaultModelId,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'Hi' }]
    })
  } catch (err) {
    const { code, detail } = mapAnthropicError(err)
    return { ok: false, code, detail }
  }
  return { ok: true, models, defaultModelId }
}

async function streamChat({ key, model, system, messages, signal, onEvent }: StreamChatArgs) {
  const client = new Anthropic({ apiKey: key, maxRetries: 1 })
  try {
    const stream = client.messages.stream(
      { model, system, messages, max_tokens: MAX_TOKENS },
      { signal }
    )
    stream.on('text', (text) => onEvent({ type: 'delta', text }))
    const final = await stream.finalMessage()
    onEvent({
      type: 'usage',
      usage: { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens }
    })
    onEvent({ type: 'done', stopped: false })
  } catch (err) {
    if (signal.aborted || isAbort(err)) {
      onEvent({ type: 'done', stopped: true })
      return
    }
    const { code, detail } = mapAnthropicError(err)
    onEvent({ type: 'error', code, message: errorMessage(code, detail) })
  }
}

export const anthropicProvider: Provider = {
  id: 'anthropic',
  displayName: 'Claude (Anthropic)',
  verifyKey,
  pickDefaultModel,
  listModels: (key) => listModels(key),
  streamChat
}

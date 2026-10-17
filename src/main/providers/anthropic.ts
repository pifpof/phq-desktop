import Anthropic from '@anthropic-ai/sdk'
import type { ModelInfo } from '@shared/types'
import { errorMessage, type ProviderErrorCode } from '@shared/errors'
import { addUsage, emptyUsage, readBlocks } from './anthropic-task'
import { WEB_FETCH_TOOL, WEB_SEARCH_TOOL } from './anthropic-tools'
import {
  ProviderError,
  TaskAbortedError,
  type Capabilities,
  type PromptBlock,
  type Provider,
  type RunTaskArgs,
  type RunTaskResult,
  type StreamChatArgs,
  type VerifyResult
} from './types'

const MAX_TOKENS = 8192
/** A paused turn (pause_turn) is continued this many times at most. */
const MAX_CONTINUATIONS = 8

/** Default rule: first model whose ID contains "sonnet", else the first model. */
export function pickDefaultModel(models: ModelInfo[]): string | null {
  return models.find((m) => m.id.includes('sonnet'))?.id ?? models[0]?.id ?? null
}

type ApiError = InstanceType<typeof Anthropic.APIError>

function errorBody(err: ApiError): { type?: string; code?: string } {
  const body = err.error as
    { type?: unknown; error?: { type?: unknown; details?: { error_code?: unknown } } } | undefined
  const type = body?.error?.type ?? body?.type
  const code = body?.error?.details?.error_code
  return {
    type: typeof type === 'string' ? type : undefined,
    code: typeof code === 'string' ? code : undefined
  }
}

export function isAbort(err: unknown): boolean {
  return (
    err instanceof Anthropic.APIUserAbortError ||
    (err instanceof Error && err.name === 'AbortError')
  )
}

export interface MappedError {
  code: ProviderErrorCode
  detail?: string
  retryAfterSeconds?: number
}

function retryAfter(err: ApiError): number | undefined {
  const raw = err.headers?.get?.('retry-after')
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n >= 0 ? Math.ceil(n) : undefined
}

export function mapAnthropicError(err: unknown): MappedError {
  if (err instanceof Anthropic.AuthenticationError) return { code: 'invalid_key' }
  if (err instanceof Anthropic.PermissionDeniedError) return { code: 'no_permission' }
  if (err instanceof Anthropic.APIConnectionError) return { code: 'network' }
  if (err instanceof Anthropic.APIError) {
    const { type, code } = errorBody(err)
    const message = err.message ?? ''
    // A monthly cap on the account's tier answers 429 with no retry-after. Retrying cannot help.
    if (code === 'enforced_spend_limit_reached') return { code: 'spend_limit_reached' }
    if (err instanceof Anthropic.RateLimitError) {
      return { code: 'rate_limited', retryAfterSeconds: retryAfter(err) }
    }
    if (err.status === 529 || type === 'overloaded_error') return { code: 'overloaded' }
    if (err.status === 402 || (err.status === 400 && /credit balance/i.test(message))) {
      return { code: 'no_credit' }
    }
    if (err.status === 400 && /web[ _]search[^.]*(not (been )?enabled|disabled)/i.test(message)) {
      return { code: 'web_search_disabled' }
    }
    // A spend limit you set yourself on the organisation or workspace answers 400.
    if (err.status === 400 && /spend limit|usage limit/i.test(message)) {
      return { code: 'spend_limit_reached' }
    }
    if (err.status !== undefined && err.status >= 500) return { code: 'overloaded' }
    return { code: 'unknown', detail: type }
  }
  return { code: 'unknown' }
}

function toProviderError(err: unknown): ProviderError {
  const { code, detail, retryAfterSeconds } = mapAnthropicError(err)
  return new ProviderError(code, detail, retryAfterSeconds)
}

async function listModels(key: string, client?: Anthropic): Promise<ModelInfo[]> {
  const c = client ?? new Anthropic({ apiKey: key, maxRetries: 1 })
  try {
    const out: ModelInfo[] = []
    for await (const m of c.models.list({ limit: 100 })) {
      out.push({
        id: m.id,
        displayName: m.display_name,
        createdAt: m.created_at,
        webSearch: m.capabilities?.server_tools?.web_search?.supported
      })
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
      {
        model,
        system: typeof system === 'string' ? system : toParams(system),
        messages,
        max_tokens: MAX_TOKENS
      },
      { signal }
    )
    stream.on('text', (text) => onEvent({ type: 'delta', text }))
    const final = await stream.finalMessage()
    onEvent({
      type: 'usage',
      // Tokens read from or written to the prompt cache are reported apart from input_tokens. They are
      // still the prompt, so count them: otherwise a cached chat shows "15 in".
      usage: {
        inputTokens:
          final.usage.input_tokens +
          (final.usage.cache_read_input_tokens ?? 0) +
          (final.usage.cache_creation_input_tokens ?? 0),
        outputTokens: final.usage.output_tokens
      }
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

async function capabilities(key: string, modelId: string): Promise<Capabilities> {
  try {
    const m = await new Anthropic({ apiKey: key, maxRetries: 1 }).models.retrieve(modelId)
    const webSearch = m.capabilities?.server_tools?.web_search?.supported === true
    // The Models API reports web search but not web fetch. Fetch ships with search.
    return { webSearch, webFetch: webSearch }
  } catch (err) {
    throw toProviderError(err)
  }
}

const toParams = (blocks: PromptBlock[]) =>
  blocks.map((b) => ({
    type: 'text' as const,
    text: b.text,
    ...(b.cache ? { cache_control: { type: 'ephemeral' as const } } : {})
  }))

/** An assistant turn to send back before the follow-up that asks for the output tool. */
function lastTurn(
  blocks: Anthropic.Messages.ContentBlock[]
): Anthropic.Messages.ContentBlockParam[] {
  // Thinking is not used, so every block can be sent back as it came.
  return blocks.filter((b) => b.type !== 'tool_use') as Anthropic.Messages.ContentBlockParam[]
}

async function runTask({
  key,
  model,
  system,
  user,
  tools,
  maxTokens,
  signal
}: RunTaskArgs): Promise<RunTaskResult> {
  // No SDK retries here: the task engine owns retries so it can honour retry-after and slow down.
  const client = new Anthropic({ apiKey: key, maxRetries: 0 })
  const toolParams: Anthropic.Messages.ToolUnion[] = []
  if (tools.webSearch) {
    toolParams.push({ ...WEB_SEARCH_TOOL, max_uses: tools.webSearch.maxUses })
  }
  if (tools.webFetch) {
    toolParams.push({
      ...WEB_FETCH_TOOL,
      max_uses: tools.webFetch.maxUses,
      max_content_tokens: tools.webFetch.maxContentTokens,
      citations: { enabled: true }
    })
  }

  const output = tools.output
  if (output) {
    toolParams.push({
      name: output.name,
      description: output.description,
      input_schema: output.schema as Anthropic.Messages.Tool.InputSchema
    })
  }

  const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: toParams(user) }]
  const usage = emptyUsage()
  const blocks: Anthropic.Messages.ContentBlock[] = []
  let stopReason = 'end_turn'
  let outputArgs: unknown = undefined

  // tool_choice is always left on auto: current models refuse a forced tool ("tool" or "any").
  const send = async (): Promise<Anthropic.Messages.Message> => {
    const stream = client.messages.stream(
      {
        model,
        max_tokens: maxTokens ?? MAX_TOKENS,
        system: toParams(system),
        messages,
        ...(toolParams.length ? { tools: toolParams } : {})
      },
      { signal }
    )
    const msg = await stream.finalMessage()
    addUsage(usage, msg.usage)
    blocks.push(...msg.content)
    stopReason = msg.stop_reason ?? 'end_turn'
    const call = msg.content.find((b) => b.type === 'tool_use' && b.name === output?.name)
    if (call && call.type === 'tool_use') outputArgs = call.input
    return msg
  }

  try {
    // The prompt asks for the output tool; web tasks research first, then call it.
    let finalMsg: Anthropic.Messages.Message | null = null
    for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
      const msg = await send()
      finalMsg = msg
      if (stopReason !== 'pause_turn') break
      // Send the paused assistant turn back unchanged to continue it.
      messages.push({
        role: 'assistant',
        content: msg.content as Anthropic.Messages.ContentBlockParam[]
      })
    }
    // Finished without calling the output tool: ask once more.
    if (output && outputArgs === undefined && stopReason !== 'max_tokens' && finalMsg) {
      // Earlier paused turns are already in `messages`; add the final one, then ask.
      if (finalMsg.content.length)
        messages.push({ role: 'assistant', content: lastTurn(finalMsg.content) })
      messages.push({
        role: 'user',
        content: `Now call the ${output.name} tool with the finished output, using what you found. Do not reply with text.`
      })
      await send()
    }
  } catch (err) {
    if (signal.aborted || isAbort(err)) throw new TaskAbortedError()
    throw toProviderError(err)
  }

  const { text, citations, consulted, sources } = readBlocks(blocks)
  return {
    text,
    citations,
    consulted,
    sources,
    output: outputArgs,
    usage,
    stopReason,
    truncated: stopReason === 'max_tokens'
  }
}

export const anthropicProvider: Provider = {
  id: 'anthropic',
  displayName: 'Claude (Anthropic)',
  verifyKey,
  pickDefaultModel,
  listModels: (key) => listModels(key),
  capabilities,
  runTask,
  streamChat
}

import http from 'http'
import type { AddressInfo } from 'net'
import Anthropic from '@anthropic-ai/sdk'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { anthropicProvider, mapAnthropicError } from '../../src/main/providers/anthropic'
import { readBlocks } from '../../src/main/providers/anthropic-task'
import { TaskAbortedError } from '../../src/main/providers/types'

type Blocks = Parameters<typeof readBlocks>[0]

// The response from Anthropic's web search docs, plus a fetch result.
const docSample = [
  { type: 'text', text: "I'll search for when Claude Shannon was born." },
  {
    type: 'server_tool_use',
    id: 'srvtoolu_1',
    name: 'web_search',
    input: { query: 'claude shannon birth date' }
  },
  {
    type: 'web_search_tool_result',
    tool_use_id: 'srvtoolu_1',
    content: [
      {
        type: 'web_search_result',
        url: 'https://en.wikipedia.org/wiki/Claude_Shannon',
        title: 'Claude Shannon - Wikipedia',
        encrypted_content: 'x',
        page_age: 'April 30, 2025'
      },
      {
        type: 'web_search_result',
        url: 'https://example.com/other',
        title: 'Other',
        encrypted_content: 'y',
        page_age: null
      }
    ]
  },
  { type: 'text', text: 'Based on the search results, ' },
  {
    type: 'text',
    text: 'Claude Shannon was born on April 30, 1916',
    citations: [
      {
        type: 'web_search_result_location',
        url: 'https://en.wikipedia.org/wiki/Claude_Shannon',
        title: 'Claude Shannon - Wikipedia',
        encrypted_index: 'z',
        cited_text: 'Claude Elwood Shannon (April 30, 1916'
      }
    ]
  }
] as unknown as Blocks

describe('readBlocks', () => {
  it('keeps only the answer, drops narration, and collects citations and consulted pages', () => {
    const r = readBlocks(docSample)
    expect(r.text).toBe('Based on the search results, Claude Shannon was born on April 30, 1916')
    expect(r.citations).toEqual([
      { url: 'https://en.wikipedia.org/wiki/Claude_Shannon', title: 'Claude Shannon - Wikipedia' }
    ])
    expect(r.consulted.map((c) => c.url)).toEqual([
      'https://en.wikipedia.org/wiki/Claude_Shannon',
      'https://example.com/other'
    ])
  })

  it('uses all text when the model never used a tool', () => {
    const r = readBlocks([
      { type: 'text', text: 'Part one. ' },
      { type: 'text', text: 'Part two.' }
    ] as unknown as Blocks)
    expect(r.text).toBe('Part one. Part two.')
    expect(r.citations).toEqual([])
  })

  it('falls back to all text when the answer came before the last tool call', () => {
    const r = readBlocks([
      { type: 'text', text: 'The whole document.' },
      { type: 'server_tool_use', id: 's', name: 'web_search', input: {} },
      { type: 'web_search_tool_result', tool_use_id: 's', content: [] }
    ] as unknown as Blocks)
    expect(r.text).toBe('The whole document.')
  })

  it('maps web fetch citations (by document index) to the fetched URL', () => {
    const r = readBlocks([
      {
        type: 'server_tool_use',
        id: 'f',
        name: 'web_fetch',
        input: { url: 'https://example.com/article' }
      },
      {
        type: 'web_fetch_tool_result',
        tool_use_id: 'f',
        content: {
          type: 'web_fetch_result',
          url: 'https://example.com/article',
          content: {
            type: 'document',
            title: 'Article Title',
            source: { type: 'text', data: '..' }
          },
          retrieved_at: 't'
        }
      },
      {
        type: 'text',
        text: 'The main argument',
        citations: [
          {
            type: 'char_location',
            document_index: 0,
            document_title: 'Article Title',
            cited_text: '..'
          }
        ]
      }
    ] as unknown as Blocks)
    expect(r.citations).toEqual([{ url: 'https://example.com/article', title: 'Article Title' }])
    expect(r.text).toBe('The main argument')
  })

  it('dedupes repeated citations and ignores tool result errors', () => {
    const cite = {
      type: 'web_search_result_location',
      url: 'https://a.com',
      title: 'A',
      cited_text: ''
    }
    const r = readBlocks([
      {
        type: 'web_search_tool_result',
        tool_use_id: 's',
        content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' }
      },
      { type: 'text', text: 'One', citations: [cite] },
      { type: 'text', text: 'Two', citations: [cite] }
    ] as unknown as Blocks)
    expect(r.citations).toHaveLength(1)
    expect(r.consulted).toEqual([])
  })
})

const h = (retryAfter?: string) => new Headers(retryAfter ? { 'retry-after': retryAfter } : {})
const make = (C: unknown, status: number, body: unknown, msg: string, headers = h()) =>
  (C as { generate(s: number, b: unknown, m: string, h: Headers): unknown }).generate(
    status,
    body,
    msg,
    headers
  )

describe('error mapping for research', () => {
  it('reads retry-after on a rate limit', () => {
    const e = make(
      Anthropic.RateLimitError,
      429,
      { error: { type: 'rate_limit_error' } },
      'slow down',
      h('17')
    )
    expect(mapAnthropicError(e)).toEqual({ code: 'rate_limited', retryAfterSeconds: 17 })
    expect(mapAnthropicError(make(Anthropic.RateLimitError, 429, {}, 'x'))).toEqual({
      code: 'rate_limited',
      retryAfterSeconds: undefined
    })
  })

  it('recognises the monthly spend cap, which is not a retryable rate limit', () => {
    const body = {
      type: 'error',
      error: {
        type: 'rate_limit_error',
        message: 'You have reached your API usage limits',
        details: { error_code: 'enforced_spend_limit_reached' }
      }
    }
    expect(mapAnthropicError(make(Anthropic.RateLimitError, 429, body, 'x'))).toEqual({
      code: 'spend_limit_reached'
    })
  })

  it('recognises a self-set spend limit (400) and web search turned off (400)', () => {
    const bad = (message: string) =>
      make(
        Anthropic.BadRequestError,
        400,
        { type: 'error', error: { type: 'invalid_request_error', message } },
        message
      )
    expect(mapAnthropicError(bad('Your workspace has reached its spend limit')).code).toBe(
      'spend_limit_reached'
    )
    expect(mapAnthropicError(bad('Web search is not enabled for this organization')).code).toBe(
      'web_search_disabled'
    )
    expect(
      mapAnthropicError(bad('The web_search tool has been disabled by your administrator')).code
    ).toBe('web_search_disabled')
    expect(mapAnthropicError(bad('max_tokens must be positive')).code).toBe('unknown')
  })

  it('treats billing errors as no credit and 5xx as transient', () => {
    expect(
      mapAnthropicError(
        make(Anthropic.APIError, 402, { error: { type: 'billing_error' } }, '402 billing')
      ).code
    ).toBe('no_credit')
    expect(mapAnthropicError(make(Anthropic.InternalServerError, 503, {}, 'x')).code).toBe(
      'overloaded'
    )
  })
})

// A fake Anthropic streaming endpoint.
let server: http.Server
let bodies: Record<string, unknown>[] = []
let mode: 'pause' | 'plain' | 'hang' = 'pause'

const sse = (res: http.ServerResponse, events: [string, Record<string, unknown>][]) => {
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  for (const [t, d] of events)
    res.write(`event: ${t}\ndata: ${JSON.stringify({ type: t, ...d })}\n\n`)
  res.end()
}
const msgStart = (input: number) =>
  [
    'message_start',
    {
      message: {
        id: 'm',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-x',
        content: [],
        stop_reason: null,
        usage: {
          input_tokens: input,
          output_tokens: 1,
          cache_read_input_tokens: 10,
          cache_creation_input_tokens: 5
        }
      }
    }
  ] as [string, Record<string, unknown>]
const text = (i: number, t: string): [string, Record<string, unknown>][] => [
  ['content_block_start', { index: i, content_block: { type: 'text', text: '' } }],
  ['content_block_delta', { index: i, delta: { type: 'text_delta', text: t } }],
  ['content_block_stop', { index: i }]
]

beforeEach(async () => {
  bodies = []
  server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const body = JSON.parse(raw || '{}')
      bodies.push(body)
      if (mode === 'hang') return // never answers
      const continuing = body.messages.length > 1
      if (mode === 'pause' && !continuing) {
        sse(res, [
          msgStart(1000),
          ...text(0, "I'll search for it. "),
          [
            'content_block_start',
            {
              index: 1,
              content_block: { type: 'server_tool_use', id: 'srv1', name: 'web_search', input: {} }
            }
          ],
          [
            'content_block_delta',
            { index: 1, delta: { type: 'input_json_delta', partial_json: '{"query":"acme"}' } }
          ],
          ['content_block_stop', { index: 1 }],
          [
            'content_block_start',
            {
              index: 2,
              content_block: {
                type: 'web_search_tool_result',
                tool_use_id: 'srv1',
                content: [
                  {
                    type: 'web_search_result',
                    url: 'https://acme.com',
                    title: 'Acme',
                    encrypted_content: 'e',
                    page_age: null
                  }
                ]
              }
            }
          ],
          ['content_block_stop', { index: 2 }],
          [
            'message_delta',
            {
              delta: { stop_reason: 'pause_turn', stop_sequence: null },
              usage: { output_tokens: 40, server_tool_use: { web_search_requests: 1 } }
            }
          ],
          ['message_stop', {}]
        ])
      } else {
        sse(res, [
          msgStart(500),
          ['content_block_start', { index: 0, content_block: { type: 'text', text: '' } }],
          [
            'content_block_delta',
            { index: 0, delta: { type: 'text_delta', text: '# Acme\n\nAcme sells rockets.' } }
          ],
          [
            'content_block_delta',
            {
              index: 0,
              delta: {
                type: 'citations_delta',
                citation: {
                  type: 'web_search_result_location',
                  url: 'https://acme.com',
                  title: 'Acme',
                  encrypted_index: 'i',
                  cited_text: 'rockets'
                }
              }
            }
          ],
          ['content_block_stop', { index: 0 }],
          [
            'message_delta',
            {
              delta: { stop_reason: 'end_turn', stop_sequence: null },
              usage: { output_tokens: 60 }
            }
          ],
          ['message_stop', {}]
        ])
      }
    })
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(() => {
  delete process.env.ANTHROPIC_BASE_URL
  return new Promise<void>((ok) => (server.closeAllConnections(), server.close(() => ok())))
})

const args = (over = {}) => ({
  key: 'sk-ant-test',
  model: 'claude-sonnet-x',
  system: [{ text: 'Shared rules', cache: true }, { text: 'The step' }],
  user: [{ text: 'Docs', cache: true }, { text: 'Go' }],
  tools: { webSearch: { maxUses: 5 }, webFetch: { maxUses: 3, maxContentTokens: 20000 } },
  signal: new AbortController().signal,
  ...over
})

describe('runTask', () => {
  it('sends web tools and cache breakpoints, continues a paused turn, and returns only the answer', async () => {
    mode = 'pause'
    const r = await anthropicProvider.runTask(args())

    expect(bodies).toHaveLength(2)
    const first = bodies[0] as {
      tools: Record<string, unknown>[]
      system: Record<string, unknown>[]
      messages: { role: string; content: Record<string, unknown>[] }[]
    }
    expect(first.tools).toEqual([
      { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
      {
        type: 'web_fetch_20250910',
        name: 'web_fetch',
        max_uses: 3,
        max_content_tokens: 20000,
        citations: { enabled: true }
      }
    ])
    expect(first.system.map((b) => !!b.cache_control)).toEqual([true, false])
    expect(first.messages[0].content.map((b) => !!b.cache_control)).toEqual([true, false])

    // The paused assistant turn goes back unchanged, including the tool call and its result.
    const second = bodies[1] as { messages: { role: string; content: { type: string }[] }[] }
    expect(second.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(second.messages[1].content.map((b) => b.type)).toEqual([
      'text',
      'server_tool_use',
      'web_search_tool_result'
    ])

    expect(r.text).toBe('# Acme\n\nAcme sells rockets.')
    expect(r.citations).toEqual([{ url: 'https://acme.com', title: 'Acme' }])
    expect(r.consulted.map((c) => c.url)).toEqual(['https://acme.com'])
    expect(r.stopReason).toBe('end_turn')
    expect(r.truncated).toBe(false)
    expect(r.usage).toMatchObject({
      requests: 2,
      webSearchRequests: 1,
      inputTokens: 1500,
      cacheReadTokens: 20,
      cacheWriteTokens: 10
    })
    expect(r.usage.outputTokens).toBeGreaterThanOrEqual(100)
    expect(r.usage.maxRequestInputTokens).toBe(1015)
  })

  it('sends no tools block for a synthesis task', async () => {
    mode = 'plain'
    await anthropicProvider.runTask(args({ tools: {} }))
    expect(bodies[0]).not.toHaveProperty('tools')
    expect(bodies).toHaveLength(1)
  })

  it('throws TaskAbortedError when stopped', async () => {
    mode = 'hang'
    const ctl = new AbortController()
    const p = anthropicProvider.runTask(args({ signal: ctl.signal }))
    setTimeout(() => ctl.abort(), 50)
    await expect(p).rejects.toBeInstanceOf(TaskAbortedError)
  })

  it('maps an API failure to a ProviderError with the code', async () => {
    await new Promise<void>((ok) => server.close(() => ok()))
    server = http.createServer((_q, res) => {
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '9' })
      res.end(
        JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'slow' } })
      )
    })
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    await expect(anthropicProvider.runTask(args({ tools: {} }))).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 9
    })
  })
})

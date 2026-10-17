import type Anthropic from '@anthropic-ai/sdk'
import type { Citation, TaskUsage, WebSource } from './types'

type Block = Anthropic.Messages.ContentBlock
type Usage = Anthropic.Messages.Usage

export const emptyUsage = (): TaskUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  webSearchRequests: 0,
  webFetchRequests: 0,
  maxRequestInputTokens: 0,
  requests: 0
})

export function addUsage(total: TaskUsage, u: Usage): void {
  const read = u.cache_read_input_tokens ?? 0
  const write = u.cache_creation_input_tokens ?? 0
  total.inputTokens += u.input_tokens
  total.outputTokens += u.output_tokens
  total.cacheReadTokens += read
  total.cacheWriteTokens += write
  total.webSearchRequests += u.server_tool_use?.web_search_requests ?? 0
  total.webFetchRequests += u.server_tool_use?.web_fetch_requests ?? 0
  total.maxRequestInputTokens = Math.max(total.maxRequestInputTokens, u.input_tokens + read + write)
  total.requests += 1
}

const TOOL_BLOCKS = new Set(['server_tool_use', 'web_search_tool_result', 'web_fetch_tool_result'])

/**
 * Reads the answer, citations and consulted pages out of the content blocks of one task.
 * Blocks from every continuation of a paused turn are passed in order.
 *
 * Models narrate while they search ("I'll search for..."). That is not part of the document,
 * so the answer is the text after the last tool call. If there is none, all text is used.
 */
export function readBlocks(blocks: Block[]): {
  text: string
  citations: Citation[]
  consulted: Citation[]
  sources: WebSource[]
} {
  const consulted = new Map<string, Citation>()
  const citations = new Map<string, Citation>()
  const fetched: Citation[] = []
  const sources = new Map<string, WebSource>()
  const source = (url: string, title: string): WebSource => {
    let s = sources.get(url)
    if (!s) {
      s = { url, title: title || url, excerpts: [], cited: false }
      sources.set(url, s)
    }
    return s
  }

  for (const b of blocks) {
    const block = b as unknown as Record<string, unknown>
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content as { url?: string; title?: string }[]) {
        if (r.url && !consulted.has(r.url))
          consulted.set(r.url, { url: r.url, title: r.title ?? r.url })
      }
    } else if (block.type === 'web_fetch_tool_result') {
      const c = block.content as
        | {
            type?: string
            url?: string
            content?: { title?: string; source?: { type?: string; data?: unknown } }
          }
        | undefined
      if (c?.type === 'web_fetch_result' && c.url) {
        const entry = { url: c.url, title: c.content?.title ?? c.url }
        fetched.push(entry)
        if (!consulted.has(c.url)) consulted.set(c.url, entry)
        // Text pages are kept in full; PDFs (base64) become citation records instead.
        const src = c.content?.source
        if (src?.type === 'text' && typeof src.data === 'string' && src.data.trim())
          source(c.url, entry.title).fullText = src.data
      }
    }
  }

  for (const b of blocks) {
    if (b.type !== 'text' || !b.citations) continue
    for (const c of b.citations as unknown as Record<string, unknown>[]) {
      let url = typeof c.url === 'string' ? c.url : ''
      let title = typeof c.title === 'string' ? c.title : ''
      // Web fetch citations point at a document by index, not a URL.
      if (!url && typeof c.document_index === 'number') {
        const doc = fetched[c.document_index]
        if (doc) ({ url, title } = doc)
      }
      if (url && !citations.has(url)) citations.set(url, { url, title: title || url })
      if (url) {
        const s = source(url, title)
        s.cited = true
        const excerpt =
          typeof c.cited_text === 'string' ? c.cited_text.replace(/\s+/g, ' ').trim() : ''
        if (excerpt && !s.excerpts.includes(excerpt)) s.excerpts.push(excerpt)
      }
    }
  }

  let lastTool = -1
  blocks.forEach((b, i) => {
    if (TOOL_BLOCKS.has(b.type)) lastTool = i
  })
  const textOf = (from: number): string =>
    blocks
      .slice(from)
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
  const text = textOf(lastTool + 1) || textOf(0)

  return {
    text,
    citations: [...citations.values()],
    consulted: [...consulted.values()],
    // Fetched pages count even when uncited: the model read them in full.
    sources: [...sources.values()].filter((s) => s.cited || s.fullText)
  }
}

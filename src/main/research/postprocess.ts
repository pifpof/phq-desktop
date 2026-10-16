import matter from 'gray-matter'
import type { Citation } from '../providers/types'

/** Some models wrap a whole document in a ```markdown fence because the skill templates show one. */
export function stripOuterFence(text: string): string {
  const t = text.trim()
  const m = /^```(?:markdown|md)\s*\n([\s\S]*)\n```$/.exec(t)
  if (!m) return t
  // Only unwrap when the fence is really the outer wrapper: inner fences must pair up.
  const fences = m[1].split('\n').filter((l) => /^```/.test(l.trim())).length
  return fences % 2 === 0 ? m[1].trim() : t
}

/** The em dash, built from its code so this file holds none (the copy sweep greps for the character). */
const EM = String.fromCharCode(0x2014)
const EM_RUN = new RegExp(`\\s*${EM}\\s*`, 'g')

/**
 * The app writes no em dashes (copy rule). Models still produce them, so replace them in prose.
 * Fenced code is left alone, except JSON blocks. In headings a dash becomes a colon, elsewhere a comma.
 */
export function replaceEmDashes(text: string): string {
  let inCode = false
  let inJson = false
  return text
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inCode = !inCode
        inJson = inCode && /^\s*```json/i.test(line)
        return line
      }
      // JSON blocks are app data shown as text (the scorecard evidence), so they follow the copy rule too.
      if (inJson) return line.replace(EM_RUN, ', ')
      if (inCode || !line.includes(EM)) return line
      if (/^\s*\|/.test(line)) {
        // An empty table cell written as a dash.
        return line
          .replace(new RegExp(`\\|\\s*${EM}\\s*(?=\\|)`, 'g'), '| n/a ')
          .replace(EM_RUN, ', ')
      }
      if (/^\s*#/.test(line)) return line.replace(EM_RUN, ': ')
      return line.replace(new RegExp(`^(\\s*(?:[-*]\\s+)?)${EM}\\s*`), '$1').replace(EM_RUN, ', ')
    })
    .join('\n')
}

export function sourcesSection(citations: Citation[], consulted: Citation[]): string {
  const link = (c: Citation): string => `- [${c.title.replace(/[[\]]/g, '')}](${c.url})`
  if (citations.length) return ['## Sources', '', ...citations.map(link)].join('\n')
  if (consulted.length) {
    return [
      '## Sources',
      '',
      'Pages the search returned. The text above does not cite them one by one.',
      '',
      ...consulted.map(link)
    ].join('\n')
  }
  return '## Sources\n\nNo sources were returned.'
}

export interface FinalizeArgs {
  /** Fallback title when the document has no H1. */
  title: string
  task: string
  runId: string
  model: string
  body: string
  /** Workspace-relative files this task was shown. */
  inputs: string[]
  /** True for tasks with web tools: they get a Sources section. */
  web: boolean
  citations: Citation[]
  consulted: Citation[]
  truncated?: boolean
  now?: Date
}

/** Front matter (REQUIREMENTS-v1 3.4), cleaned body and, for web tasks, a Sources section. */
export function finalizeDocument(a: FinalizeArgs): string {
  let body = replaceEmDashes(stripOuterFence(a.body))
  const h1 = /^#\s+(.+)$/m.exec(body)?.[1]?.trim()
  if (a.web) body = `${body}\n\n${replaceEmDashes(sourcesSection(a.citations, a.consulted))}`
  const sources = a.web ? (a.citations.length ? a.citations : a.consulted).map((c) => c.url) : []
  return matter.stringify(`${body}\n`, {
    title: h1 ?? a.title,
    task: a.task,
    run_id: a.runId,
    model: a.model,
    created: (a.now ?? new Date()).toISOString(),
    status: 'draft',
    inputs: a.inputs,
    sources,
    ...(a.truncated ? { truncated: true } : {})
  })
}

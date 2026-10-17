import { KEYS, type FileKind } from '@shared/wiki-types'

/**
 * Front matter for wiki files (spec section 4, docs/v2-assumptions.md 3.1).
 *
 * llm-wiki's lint reads YAML line by line, so this writes the subset it understands: one line per
 * scalar, double-quoted strings, inline lists for tags and aliases, two-space block lists for
 * sources. The reader accepts the same subset (plus a little slack for hand edits), so what the app
 * sees is what lint sees. Never use gray-matter's stringify for wiki files: it folds long strings.
 */

export type FrontMatter = Record<string, unknown>

export interface ParsedDoc {
  data: FrontMatter
  body: string
}

const DATE_KEYS = new Set(['created', 'updated', 'ingested', 'verified'])
const BARE_KEYS = new Set([
  'type',
  'category',
  'confidence',
  'volatility',
  'compiled-from',
  'schema_state'
])
const BLOCK_LIST_KEYS = new Set(['sources'])

/** One line, no double quotes or backslashes (lint strips quotes without unescaping). */
export function cleanScalar(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/"/g, "'").replace(/\\/g, '/').trim()
}

const quote = (value: string): string => `"${cleanScalar(value)}"`

function scalar(key: string, value: unknown): string {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const s = String(value ?? '')
  if (DATE_KEYS.has(key) && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (BARE_KEYS.has(key) && /^[a-z][a-z0-9-]*$/.test(s)) return s
  return quote(s)
}

/** Tags are slugs and stay bare; anything else in an inline list is quoted. */
function inlineList(key: string, values: unknown[]): string {
  const items = values.map((v) => cleanScalar(String(v))).filter(Boolean)
  if (key === 'tags') return `[${items.join(', ')}]`
  return `[${items.map((v) => `"${v}"`).join(', ')}]`
}

function blockList(values: unknown[]): string[] {
  return values
    .map((v) => cleanScalar(String(v)))
    .filter(Boolean)
    .map((v) => (/[\s#:]/.test(v) ? `  - "${v}"` : `  - ${v}`))
}

/** Front matter lines for a file kind: whitelisted keys only, in spec order. */
export function frontMatterLines(kind: FileKind, data: FrontMatter): string[] {
  const out: string[] = []
  for (const key of KEYS[kind]) {
    const value = data[key]
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      if (BLOCK_LIST_KEYS.has(key)) {
        if (value.length === 0) continue
        out.push(`${key}:`, ...blockList(value))
      } else out.push(`${key}: ${inlineList(key, value)}`)
    } else out.push(`${key}: ${scalar(key, value)}`)
  }
  return out
}

/** A complete file: front matter, a blank line, then the body with one trailing newline. */
export function stringifyDoc(kind: FileKind, data: FrontMatter, body: string): string {
  const lines = frontMatterLines(kind, data)
  return `---\n${lines.join('\n')}\n---\n\n${body.replace(/^\s*\n/, '').trimEnd()}\n`
}

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1)
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'"))
    return value.slice(1, -1).replace(/''/g, "'")
  return value
}

/** Splits an inline list on commas outside quotes. */
function splitInline(inner: string): string[] {
  const parts: string[] = []
  let current = ''
  let q: string | null = null
  for (const ch of inner) {
    if (ch === '"' || ch === "'") {
      if (q === null) q = ch
      else if (q === ch) q = null
      current += ch
    } else if (ch === ',' && q === null) {
      parts.push(current.trim())
      current = ''
    } else current += ch
  }
  parts.push(current.trim())
  return parts.filter((p) => p !== '')
}

function parseScalar(raw: string): unknown {
  const value = raw.trim()
  if (value === '') return ''
  if (['null', 'Null', 'NULL', '~'].includes(value)) return null
  if (['true', 'True', 'TRUE'].includes(value)) return true
  if (['false', 'False', 'FALSE'].includes(value)) return false
  if (value.startsWith('[') && value.endsWith(']'))
    return splitInline(value.slice(1, -1)).map((p) => unquote(p))
  if (/^-?\d+$/.test(value)) return Number(value)
  return unquote(value)
}

/** Parses a front matter block (the text between the --- lines). */
export function parseFrontMatter(text: string): FrontMatter {
  const data: FrontMatter = {}
  let current: string | null = null
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const item = /^\s*- (.*)$/.exec(line)
    if (item && current) {
      const list = Array.isArray(data[current]) ? (data[current] as unknown[]) : []
      list.push(parseScalar(item[1]))
      data[current] = list
      continue
    }
    if (/^\s/.test(line) || !line.includes(':')) continue
    const at = line.indexOf(':')
    const key = line.slice(0, at).trim()
    if (!key) continue
    current = key
    const value = line.slice(at + 1).trim()
    data[key] = value === '' ? [] : parseScalar(value)
  }
  return data
}

/** Splits a markdown file into front matter and body. Null when there is no front matter. */
export function parseDoc(text: string): ParsedDoc | null {
  const t = text.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '')
  if (!t.startsWith('---\n')) return null
  const end = t.indexOf('\n---', 4)
  if (end === -1) return null
  const after = t.indexOf('\n', end + 4)
  const body = after === -1 ? '' : t.slice(after + 1)
  return { data: parseFrontMatter(t.slice(4, end)), body: body.replace(/^\n/, '') }
}

/** Reads a string list from front matter, tolerating a single string or junk. */
export function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean)
  if (typeof value === 'string' && value) return [value]
  return []
}

export const stringField = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''

/**
 * Adds a tag by editing only the `tags` line(s) of the front matter, so the rest of a file the
 * founder may have edited stays byte for byte as it was. Returns null if there is no front matter.
 */
export function addTagInPlace(text: string, tag: string): string | null {
  const nl = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  if (lines[0] !== '---') return null
  const end = lines.indexOf('---', 1)
  if (end === -1) return null
  const at = lines.findIndex((l, i) => i > 0 && i < end && /^tags\s*:/.test(l))
  if (at === -1) {
    lines.splice(end, 0, `tags: [${tag}]`)
    return lines.join(nl)
  }
  const value = lines[at].replace(/^tags\s*:/, '').trim()
  const current = stringList(parseFrontMatter(lines.slice(at, end).join('\n')).tags)
  if (current.includes(tag)) return text
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim()
    lines[at] = `tags: [${inner ? `${inner}, ` : ''}${tag}]`
  } else if (value === '') {
    let last = at
    while (last + 1 < end && /^\s+- /.test(lines[last + 1])) last++
    const indent = /^(\s+)- /.exec(lines[last])?.[1] ?? '  '
    lines.splice(last + 1, 0, `${indent}- ${tag}`)
  } else {
    lines[at] = `tags: [${value}, ${tag}]`
  }
  return lines.join(nl)
}

/** Sets one scalar key by editing its line only (added before the closing --- if absent). */
export function setScalarInPlace(text: string, key: string, value: string): string | null {
  const nl = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  if (lines[0] !== '---') return null
  const end = lines.indexOf('---', 1)
  if (end === -1) return null
  const next = `${key}: "${cleanScalar(value)}"`
  const at = lines.findIndex((l, i) => i > 0 && i < end && new RegExp(`^${key}\\s*:`).test(l))
  if (at === -1) lines.splice(end, 0, next)
  else lines[at] = next
  return lines.join(nl)
}

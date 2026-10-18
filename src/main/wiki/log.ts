import { appendFile, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { isoDay } from './paths'

/**
 * log.md (spec section 11): append-only, one line per operation, llm-wiki format:
 *   ## [YYYY-MM-DD] op | text
 * The file is opened for append and never rewritten. Never put file content or keys in it.
 */

export const LOG_OPS = [
  'init',
  'ingest',
  'compile',
  'output',
  'decision',
  'change',
  'regenerate',
  'lint',
  'migrate'
] as const
export type LogOp = (typeof LOG_OPS)[number]

export const LOG_HEADER = '# Wiki Activity Log\n'

export const logLine = (op: LogOp, text: string, date: string): string =>
  `## [${date}] ${op} | ${text.replace(/\s+/g, ' ').trim()}\n`

export async function appendLog(
  root: string,
  op: LogOp,
  text: string,
  date: string = isoDay()
): Promise<void> {
  const path = join(root, 'log.md')
  let existing: string | null = null
  try {
    existing = await readFile(path, 'utf8')
  } catch {
    // Created on first use (a hand-made wiki may not have one).
    await writeFile(path, `${LOG_HEADER}\n`, { flag: 'wx' }).catch(() => undefined)
  }
  // Keep each entry on its own line even if someone saved the file without a final newline.
  const prefix = existing && !existing.endsWith('\n') ? '\n' : ''
  await appendFile(path, prefix + logLine(op, text, date))
}

/** Date of the latest entry for an operation, or null. */
export function lastLogDate(log: string, op: LogOp): string | null {
  let last: string | null = null
  for (const m of log.matchAll(/^## \[(\d{4}-\d{2}-\d{2})\] ([a-z-]+) \|/gm)) {
    if (m[2] === op && (last === null || m[1] > last)) last = m[1]
  }
  return last
}

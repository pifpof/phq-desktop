/**
 * A line diff (longest common subsequence), for the review's before and after (REQUIREMENTS-v3.1
 * 5) and for describing outside edits (4.2). Pages are short, so the quadratic table is fine; very
 * long inputs fall back to "everything removed, everything added".
 */

export interface DiffOp {
  type: 'same' | 'add' | 'del'
  text: string
}

const MAX_CELLS = 4_000_000

export function diffLines(before: string, after: string): DiffOp[] {
  const a = before.replace(/\r\n/g, '\n').split('\n')
  const b = after.replace(/\r\n/g, '\n').split('\n')
  if (a.length * b.length > MAX_CELLS)
    return [
      ...a.map((text) => ({ type: 'del' as const, text })),
      ...b.map((text) => ({ type: 'add' as const, text }))
    ]
  const n = a.length
  const m = b.length
  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      table[i][j] =
        a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
  const out: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] })
      i++
      j++
    } else if (table[i + 1][j] >= table[i][j + 1]) out.push({ type: 'del', text: a[i++] })
    else out.push({ type: 'add', text: b[j++] })
  }
  while (i < n) out.push({ type: 'del', text: a[i++] })
  while (j < m) out.push({ type: 'add', text: b[j++] })
  return out
}

/** A short plain-text account of what changed, for "Turn my edits into a change". */
export function describeEdits(before: string, after: string, maxLines = 12): string {
  const ops = diffLines(before, after).filter((o) => o.type !== 'same' && o.text.trim())
  if (!ops.length) return ''
  const lines = ops
    .slice(0, maxLines)
    .map((o) => `${o.type === 'add' ? 'Added' : 'Removed'}: ${o.text.trim()}`)
  if (ops.length > maxLines) lines.push(`And ${ops.length - maxLines} more edited lines.`)
  return lines.join('\n')
}

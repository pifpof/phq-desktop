import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { FixReport } from '@shared/conformance'
import { checkWiki } from './conformance'
import { addTagInPlace, parseDoc, stringField } from './frontmatter'
import { writeIndexes } from './index-gen'
import { canonicalRel, runLintPort } from './lint-port'
import { appendLog } from './log'
import { isoDay, safeJoin } from './paths'
import { SKELETON_DIRS } from './skeleton'
import { readmeMd, schemaMd } from './templates'
import { exists } from '../workspace/fs-util'

/**
 * Mechanical fixes only (REQUIREMENTS-v2 section 5): missing folders and root files, misplaced
 * files moved to their canonical folder, a missing `private` tag re-added, indexes regenerated.
 * Never edits raw file content, never rewrites article text, never deletes or quarantines.
 */
export async function fixWiki(root: string, today: string = isoDay()): Promise<FixReport> {
  const fixed: string[] = []
  for (const dir of SKELETON_DIRS) {
    if (!(await exists(join(root, dir)))) {
      await mkdir(join(root, dir), { recursive: true })
      fixed.push(`Created ${dir}/`)
    }
  }

  const config =
    parseDoc(await readFile(join(root, 'config.md'), 'utf8').catch(() => ''))?.data ?? {}
  const company = stringField(config.title) || 'Company'
  if (!(await exists(join(root, 'README.md')))) {
    await writeFile(join(root, 'README.md'), readmeMd(company), { flag: 'wx' })
    fixed.push('Created README.md')
  }
  if (!(await exists(join(root, 'schema.md')))) {
    await writeFile(
      join(root, 'schema.md'),
      schemaMd(company, stringField(config.created) || today),
      { flag: 'wx' }
    )
    fixed.push('Created schema.md')
  }

  // C11: move misplaced raw sources and articles (only when the destination is free).
  const port = await runLintPort(root, today)
  for (const doc of port.documents.values()) {
    if (!doc.rel.startsWith('raw/') && !doc.rel.startsWith('wiki/')) continue
    const expected = canonicalRel(doc.rel, doc.frontmatter)
    if (!expected || expected === doc.rel) continue
    const dest = safeJoin(root, expected)
    if (await exists(dest)) continue
    await mkdir(dirname(dest), { recursive: true })
    await rename(safeJoin(root, doc.rel), dest)
    fixed.push(`Moved ${doc.rel} to ${expected}`)
  }

  // 12.4: re-add the private tag. Only the tags line changes.
  // Checked after the moves, so the paths are current.
  const afterMoves = await checkWiki(root, today)
  for (const f of afterMoves.findings.filter((x) => x.check === 'S12.4')) {
    const full = safeJoin(root, f.path)
    if (!(await exists(full))) continue
    const text = await readFile(full, 'utf8')
    const next = addTagInPlace(text, 'private')
    if (next && next !== text) {
      await writeFile(full, next)
      fixed.push(`Tagged ${f.path} private`)
    }
  }

  for (const rel of await writeIndexes(root)) fixed.push(`Regenerated ${rel}`)

  const report = await checkWiki(root, today)
  if (fixed.length) {
    const c = report.counts
    await appendLog(
      root,
      'lint',
      `PositioningHQ check: ${c.critical} critical, ${c.warning} warnings, ${c.suggestion} suggestions, ${fixed.length} auto-fixed`,
      today
    )
    // The log entry feeds "Last lint" in the master index.
    await writeIndexes(root)
  }
  return { fixed, report }
}

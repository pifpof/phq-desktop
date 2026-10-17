import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { FORMAT_VERSION } from '@shared/wiki-types'
import { exists } from '../workspace/fs-util'
import { writeIndexes } from './index-gen'
import { appendLog } from './log'
import { RAW_DIRS, THESES_DIR, WIKI_DIRS } from './scan'
import { configMd, readmeMd, schemaMd, type WikiIdentity } from './templates'

/** Every folder of a new wiki (spec section 2, plus the two llm-wiki requires). */
export const SKELETON_DIRS = ['inbox/.processed', ...RAW_DIRS, ...WIKI_DIRS, THESES_DIR, 'output']

async function writeOnce(path: string, text: string): Promise<boolean> {
  if (await exists(path)) return false
  await writeFile(path, text, { flag: 'wx' })
  return true
}

/**
 * Builds the full spec layout with root files, indexes and an `init` log line. Idempotent: it
 * fills in whatever is missing and never overwrites an existing file.
 */
export async function createSkeleton(root: string, id: WikiIdentity): Promise<void> {
  for (const dir of SKELETON_DIRS) await mkdir(join(root, dir), { recursive: true })
  await writeOnce(join(root, 'config.md'), configMd(id))
  await writeOnce(join(root, 'README.md'), readmeMd(id.company))
  await writeOnce(join(root, 'schema.md'), schemaMd(id.company, id.created))
  if (!(await exists(join(root, 'log.md')))) {
    await appendLog(
      root,
      'init',
      `PositioningHQ wiki created (format ${FORMAT_VERSION})`,
      id.created
    )
  }
  await writeIndexes(root)
}

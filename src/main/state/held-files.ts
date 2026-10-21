import { copyFile, mkdir, readdir, rm, stat } from 'fs/promises'
import { basename, extname, join } from 'path'
import { INPUT_LIMITS, READABLE_EXTENSIONS } from '@shared/workspace'
import { addInputs } from '../ingest/files-to-raw'
import { stateDir } from './app-state'

/**
 * Proof added while research runs (REQUIREMENTS-v4.4 4.4). The files wait in app state, outside the
 * wiki, so the run that is going never reads them: its inputs stay fixed and the isolation rule is
 * untouched. Once the founder chooses to update the playbook with them, they are added as customer
 * references, the ordinary way.
 */

const dir = async (root: string): Promise<string> => join(await stateDir(root), 'held-files')

export async function heldFiles(root: string): Promise<string[]> {
  try {
    return (await readdir(await dir(root))).filter((n) => !n.startsWith('.')).sort()
  } catch {
    return []
  }
}

/** Copies the files aside. Returns the names kept and the ones refused, with why. */
export async function holdFiles(
  root: string,
  paths: string[]
): Promise<{ held: string[]; refused: { name: string; reason: string }[] }> {
  const target = await dir(root)
  await mkdir(target, { recursive: true })
  const held: string[] = []
  const refused: { name: string; reason: string }[] = []
  let count = (await heldFiles(root)).length
  for (const src of paths) {
    const name = basename(src)
    try {
      const info = await stat(src)
      if (!info.isFile()) refused.push({ name, reason: 'Folders are not supported.' })
      else if (
        !(READABLE_EXTENSIONS as readonly string[]).includes(extname(name).slice(1).toLowerCase())
      )
        refused.push({ name, reason: 'This kind of file cannot be read.' })
      else if (info.size > INPUT_LIMITS.maxFileBytes) refused.push({ name, reason: 'Too large.' })
      else if (count >= INPUT_LIMITS.maxFiles) refused.push({ name, reason: 'Too many files.' })
      else {
        await copyFile(src, join(target, name))
        held.push(name)
        count++
      }
    } catch {
      refused.push({ name, reason: 'Could not be copied.' })
    }
  }
  return { held, refused }
}

/** Adds the held files as customer references, then clears them. Returns how many were added. */
export async function addHeldFiles(root: string): Promise<number> {
  const d = await dir(root)
  const names = await heldFiles(root)
  if (!names.length) return 0
  const r = await addInputs(
    root,
    'customer references',
    names.map((n) => join(d, n))
  )
  await rm(d, { recursive: true, force: true })
  return r.added.length
}

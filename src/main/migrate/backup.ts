import { mkdir, readdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import JSZip from 'jszip'

/**
 * Migration backups (REQUIREMENTS-v2 6.1 step 2): the whole workspace zipped into
 * userData/backups/ before anything changes, then re-opened and checked file by file. Migration
 * does not start without a verified backup, and a failed conversion restores from it.
 */

async function listFiles(root: string, rel = ''): Promise<string[]> {
  const out: string[] = []
  for (const e of await readdir(join(root, rel), { withFileTypes: true })) {
    const child = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...(await listFiles(root, child)))
    else if (e.isFile()) out.push(child)
  }
  return out.sort()
}

export interface Backup {
  path: string
  files: number
  bytes: number
}

/** Zips the workspace to `target` and verifies it (entry count and every size). Throws if it doesn't match. */
export async function createBackup(root: string, target: string): Promise<Backup> {
  const files = await listFiles(root)
  const zip = new JSZip()
  let bytes = 0
  const sizes = new Map<string, number>()
  for (const f of files) {
    const data = await readFile(join(root, f))
    zip.file(f, data)
    sizes.set(f, data.length)
    bytes += data.length
  }
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))

  // Verify: re-open from disk, same files, same sizes.
  const check = await JSZip.loadAsync(await readFile(target))
  const entries = Object.values(check.files).filter((e) => !e.dir)
  if (entries.length !== files.length) throw new Error('The backup is incomplete.')
  for (const e of entries) {
    const data = await e.async('nodebuffer')
    if (sizes.get(e.name) !== data.length)
      throw new Error('The backup does not match the workspace.')
  }
  return { path: target, files: files.length, bytes }
}

/**
 * Puts the workspace back exactly as the backup holds it: everything in the folder is removed,
 * then the backup's files are written. Used only after a failed conversion.
 */
export async function restoreBackup(root: string, backup: string): Promise<void> {
  const zip = await JSZip.loadAsync(await readFile(backup))
  for (const e of await readdir(root)) await rm(join(root, e), { recursive: true, force: true })
  for (const e of Object.values(zip.files)) {
    if (e.dir) continue
    // Entry names come from our own zip of this folder; still refuse anything that climbs out.
    if (e.name.split('/').includes('..') || e.name.startsWith('/')) continue
    const full = join(root, e.name)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, await e.async('nodebuffer'))
  }
}

export async function backupExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

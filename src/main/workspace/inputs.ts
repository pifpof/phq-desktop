import { constants } from 'fs'
import { copyFile, mkdir, readdir, rm, stat } from 'fs/promises'
import { basename, extname, join } from 'path'
import {
  INPUT_CATEGORIES,
  INPUT_LIMITS,
  READABLE_EXTENSIONS,
  type AddResult,
  type InputCategory,
  type InputFile
} from '@shared/workspace'

const isReadable = (name: string): boolean =>
  (READABLE_EXTENSIONS as readonly string[]).includes(extname(name).slice(1).toLowerCase())

const mb = (bytes: number): number => Math.round(bytes / 1024 / 1024)

export async function listInputs(root: string): Promise<Record<InputCategory, InputFile[]>> {
  const out = {} as Record<InputCategory, InputFile[]>
  for (const category of INPUT_CATEGORIES) {
    const dir = join(root, 'inputs', category)
    const files: InputFile[] = []
    try {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        if (!e.isFile() || e.name.startsWith('.')) continue
        files.push({
          name: e.name,
          size: (await stat(join(dir, e.name))).size,
          readable: isReadable(e.name)
        })
      }
    } catch {
      // folder missing: empty
    }
    out[category] = files.sort((a, b) => a.name.localeCompare(b.name))
  }
  return out
}

/** Copies `src` into `dir` without overwriting: "report.pdf", "report-2.pdf", "report-3.pdf"... */
async function copyUnique(src: string, dir: string): Promise<string> {
  const ext = extname(src)
  const stem = basename(src, ext)
  for (let n = 1; n < 1000; n++) {
    const name = n === 1 ? `${stem}${ext}` : `${stem}-${n}${ext}`
    try {
      await copyFile(src, join(dir, name), constants.COPYFILE_EXCL)
      return name
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    }
  }
  throw new Error('Too many files with the same name')
}

/** Files are copied, never moved. Originals are untouched. */
export async function addInputs(
  root: string,
  category: InputCategory,
  paths: string[]
): Promise<AddResult> {
  const result: AddResult = { added: [], refused: [] }
  const dir = join(root, 'inputs', category)
  let total = Object.values(await listInputs(root)).reduce((n, f) => n + f.length, 0)

  for (const src of paths) {
    const name = basename(src)
    try {
      const info = await stat(src)
      if (!info.isFile()) {
        result.refused.push({ name, reason: 'Folders are not supported. Add the files inside it.' })
      } else if (info.size > INPUT_LIMITS.maxFileBytes) {
        result.refused.push({ name, reason: `Over ${mb(INPUT_LIMITS.maxFileBytes)} MB.` })
      } else if (total >= INPUT_LIMITS.maxFiles) {
        result.refused.push({ name, reason: `Limit of ${INPUT_LIMITS.maxFiles} files reached.` })
      } else {
        await mkdir(dir, { recursive: true })
        const stored = await copyUnique(src, dir)
        total++
        result.added.push({ name: stored, size: info.size, readable: isReadable(stored) })
      }
    } catch {
      result.refused.push({ name, reason: "Couldn't read this file." })
    }
  }
  return result
}

/** Removes the copy in the workspace only. Never touches the original. */
export async function removeInput(
  root: string,
  category: InputCategory,
  name: string
): Promise<boolean> {
  if (!name || name !== basename(name) || name.startsWith('.')) return false
  try {
    await rm(join(root, 'inputs', category, name), { force: true })
    return true
  } catch {
    return false
  }
}

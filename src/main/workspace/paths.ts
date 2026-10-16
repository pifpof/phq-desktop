import { isAbsolute, join, relative, resolve, sep } from 'path'

/**
 * Resolves a workspace-relative path and refuses anything that escapes the workspace.
 * Returns null for absolute paths, `..` traversal and empty input.
 */
export function resolveInside(root: string, rel: string): string | null {
  if (!rel || isAbsolute(rel)) return null
  const full = resolve(join(root, rel))
  const back = relative(resolve(root), full)
  if (!back || back.startsWith('..') || isAbsolute(back)) return null
  return full
}

export const toPosix = (p: string): string => p.split(sep).join('/')

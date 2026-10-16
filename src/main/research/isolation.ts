import type { TaskDef } from './types'

/**
 * The isolation rule (REQUIREMENTS-v1 3.2, CLAUDE.md rule 11).
 * Web content is untrusted and user files may be confidential, so they never meet in one AI call:
 *  - a web task sees no user files, and nothing derived from user files;
 *  - a task that sees user files has no web tools.
 *
 * "Derived from user files" follows the graph: extracted file text is user content, and so is the
 * output of any task that was shown it.
 */

/** IDs of tasks whose output may contain user file content. */
export function taintedTasks(tasks: TaskDef[]): Set<string> {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const tainted = new Set<string>()
  const isTainted = (id: string, seen: Set<string>): boolean => {
    if (tainted.has(id)) return true
    if (seen.has(id)) return false
    seen.add(id)
    const t = byId.get(id)
    if (!t) return false
    const sources = [
      ...t.dependsOn,
      ...(t.inputs?.outputs ?? []),
      ...(t.inputs?.optionalOutputs ?? [])
    ]
    const direct = t.local === 'extract' || (t.inputs?.inputCategories.length ?? 0) > 0
    if (direct || sources.some((s) => isTainted(s, seen))) {
      tainted.add(id)
      return true
    }
    return false
  }
  for (const t of tasks) isTainted(t.id, new Set())
  return tainted
}

/** Human-readable problems. An empty list means the rule holds. */
export function findIsolationViolations(tasks: TaskDef[]): string[] {
  const tainted = taintedTasks(tasks)
  const problems: string[] = []
  for (const t of tasks) {
    if (t.web === false) continue
    const cats = t.inputs?.inputCategories ?? []
    if (cats.length)
      problems.push(`${t.id}: has web tools and is shown user files (${cats.join(', ')})`)
    const sources = [
      ...t.dependsOn,
      ...(t.inputs?.outputs ?? []),
      ...(t.inputs?.optionalOutputs ?? [])
    ]
    for (const s of new Set(sources)) {
      if (tainted.has(s))
        problems.push(`${t.id}: has web tools and depends on ${s}, which carries user file content`)
    }
  }
  return problems
}

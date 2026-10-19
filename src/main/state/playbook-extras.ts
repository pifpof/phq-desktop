import { readFile } from 'fs/promises'
import { join } from 'path'
import { z } from 'zod'
import { GapSchema, StepIdSchema } from '@shared/playbook'
import type { PlaybookExtras } from '../research/assemble-playbook'
import { replaceEmDashes } from '../research/postprocess'
import { stateDir, writeJsonAtomic } from './app-state'

/**
 * Takeaways and gaps for steps with no article of their own (Distinct Advantages has no parent
 * moats article, REQUIREMENTS-v4 7.1). App state, so assembly can copy them into every new
 * playbook version; the wiki never holds them outside the output.
 */

const ExtrasSchema = z.partialRecord(
  StepIdSchema,
  z.object({ takeaways: z.array(z.string()).length(3).nullable(), gap: GapSchema.nullable() })
)

const file = async (root: string): Promise<string> =>
  join(await stateDir(root), 'playbook-extras.json')

export async function readPlaybookExtras(root: string): Promise<PlaybookExtras> {
  try {
    const parsed = ExtrasSchema.safeParse(JSON.parse(await readFile(await file(root), 'utf8')))
    return parsed.success ? parsed.data : {}
  } catch {
    return {}
  }
}

export async function writePlaybookExtras(root: string, extras: PlaybookExtras): Promise<void> {
  await writeJsonAtomic(await file(root), { ...(await readPlaybookExtras(root)), ...extras })
}

const line = (s: string): string => replaceEmDashes(s).replace(/\s+/g, ' ').trim()

/** Model output (snake_case gap) as stored extras. Call after checkTakeaways passes. */
export function extrasFrom(
  takeaways: string[],
  gap: { problem: string; next_step: string } | undefined
): { takeaways: string[]; gap: { problem: string; nextStep: string } | null } {
  return {
    takeaways: takeaways.map(line),
    gap: gap ? { problem: line(gap.problem), nextStep: line(gap.next_step) } : null
  }
}

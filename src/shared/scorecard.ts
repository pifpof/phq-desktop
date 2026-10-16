import { z } from 'zod'

export const SCORE_DIMENSIONS = [
  'Clarity',
  'Differentiation',
  'Customer focus',
  'Proof',
  'Consistency'
] as const

const ScoreSchema = z.object({
  dimension: z.string(),
  score: z.number().int().min(1).max(5),
  evidence: z.string().trim().min(1)
})
const ScorecardSchema = z.object({ scores: z.array(ScoreSchema).length(5) })

export interface Score {
  dimension: (typeof SCORE_DIMENSIONS)[number]
  score: number
  evidence: string
}

/** The first ```json block in a document, or null. */
function jsonBlock(markdown: string): string | null {
  return /```json\s*\n([\s\S]*?)\n\s*```/i.exec(markdown)?.[1] ?? null
}

/** Reads and checks the scorecard. The explanation is shown to the model on a retry. */
export function readScorecard(markdown: string): { scores: Score[] } | { error: string } {
  const raw = jsonBlock(markdown)
  if (!raw) return { error: 'The answer must start with a ```json block holding the scorecard.' }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { error: 'The scorecard block is not valid JSON.' }
  }
  const parsed = ScorecardSchema.safeParse(data)
  if (!parsed.success) {
    return {
      error:
        'The scorecard must have exactly five entries, each with dimension, a whole-number score from 1 to 5, and evidence.'
    }
  }
  const scores: Score[] = []
  for (const [i, s] of parsed.data.scores.entries()) {
    const want = SCORE_DIMENSIONS[i]
    if (s.dimension.trim().toLowerCase() !== want.toLowerCase()) {
      return {
        error: `Entry ${i + 1} must be "${want}". The order is: ${SCORE_DIMENSIONS.join(', ')}.`
      }
    }
    scores.push({ dimension: want, score: s.score, evidence: s.evidence.trim() })
  }
  return { scores }
}

export function parseScorecard(markdown: string): Score[] | null {
  const r = readScorecard(markdown)
  return 'scores' in r ? r.scores : null
}

export function checkScorecard(markdown: string): string | null {
  const r = readScorecard(markdown)
  return 'error' in r ? r.error : null
}

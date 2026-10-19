import type { Pricing } from './pricing'
import { costOf } from './pricing'

/**
 * What kinds of work a research task can be. Each kind has an expected size.
 * These are first guesses. Real runs record actual usage so they can be tuned.
 */
export type TaskKind =
  | 'web-research'
  | 'web-profile'
  | 'synthesis'
  | 'synthesis-large'
  | 'playbook-section'
  | 'messaging-analysis'
  | 'playbook-takeaways'
  | 'local'

export interface Range {
  low: number
  high: number
}

export interface KindEstimate {
  inputTokens: Range
  outputTokens: Range
  searches: Range
  /** Rough wall time in seconds. */
  seconds: Range
}

const r = (low: number, high: number): Range => ({ low, high })

export const ESTIMATES: Record<TaskKind, KindEstimate> = {
  local: { inputTokens: r(0, 0), outputTokens: r(0, 0), searches: r(0, 0), seconds: r(5, 60) },
  'web-research': {
    inputTokens: r(15_000, 45_000),
    outputTokens: r(1_500, 3_500),
    searches: r(3, 6),
    seconds: r(30, 120)
  },
  'web-profile': {
    inputTokens: r(25_000, 70_000),
    outputTokens: r(2_000, 4_500),
    searches: r(3, 6),
    seconds: r(45, 150)
  },
  synthesis: {
    inputTokens: r(15_000, 45_000),
    outputTokens: r(1_500, 3_500),
    searches: r(0, 0),
    seconds: r(20, 80)
  },
  'synthesis-large': {
    inputTokens: r(25_000, 70_000),
    outputTokens: r(2_500, 6_000),
    searches: r(0, 0),
    seconds: r(40, 120)
  },
  'playbook-section': {
    inputTokens: r(25_000, 75_000),
    outputTokens: r(2_000, 5_000),
    searches: r(0, 0),
    seconds: r(30, 100)
  },
  'playbook-takeaways': {
    inputTokens: r(12_000, 30_000),
    outputTokens: r(600, 1_500),
    searches: r(0, 0),
    seconds: r(15, 45)
  },
  'messaging-analysis': {
    inputTokens: r(40_000, 95_000),
    outputTokens: r(3_000, 7_000),
    searches: r(0, 0),
    seconds: r(60, 150)
  }
}

export interface RunEstimate {
  costUsd: Range
  /** Minutes, assuming the given concurrency. */
  minutes: Range
  searches: Range
  tasks: number
}

/** Share of input tokens assumed to come from the prompt cache in the low case. */
const LOW_CACHED_SHARE = 0.5

/**
 * Low to high cost and time for a run made of these task kinds.
 * `concurrency` is how many AI tasks run at once. Time is total task time divided by concurrency,
 * which ignores task dependencies, so it is only a rough guide.
 */
export function estimateRun(
  kinds: TaskKind[],
  modelId: string,
  pricing: Pricing,
  concurrency: number
): RunEstimate {
  const total = { low: 0, high: 0 }
  const searches = { low: 0, high: 0 }
  const seconds = { low: 0, high: 0 }
  for (const kind of kinds) {
    const e = ESTIMATES[kind]
    for (const end of ['low', 'high'] as const) {
      const input = e.inputTokens[end]
      const cached = end === 'low' ? input * LOW_CACHED_SHARE : 0
      total[end] += costOf(pricing, modelId, {
        inputTokens: input - cached,
        outputTokens: e.outputTokens[end],
        cacheReadTokens: cached,
        cacheWriteTokens: 0,
        webSearchRequests: e.searches[end],
        webFetchRequests: 0,
        maxRequestInputTokens: input,
        requests: 1
      }).usd
      searches[end] += e.searches[end]
      seconds[end] += e.seconds[end]
    }
  }
  const c = Math.max(1, concurrency)
  return {
    costUsd: total,
    minutes: {
      low: Math.max(1, Math.round(seconds.low / c / 60)),
      high: Math.max(2, Math.round(seconds.high / c / 60))
    },
    searches,
    tasks: kinds.length
  }
}

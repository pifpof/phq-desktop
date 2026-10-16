import { z } from 'zod'
import type { TaskUsage } from '../providers/types'

const Rates = z.object({
  input: z.number(),
  output: z.number(),
  cacheWrite: z.number(),
  cacheRead: z.number()
})

const ModelPrice = Rates.extend({
  match: z.string().min(1),
  name: z.string(),
  /** Some models charge more when a single request's prompt is long. */
  longPrompt: Rates.extend({ overTokens: z.number() }).optional()
})

export const PricingSchema = z.object({
  lastUpdated: z.string(),
  source: z.string().optional(),
  note: z.string().optional(),
  webSearchPer1000: z.number(),
  /** `match` of the entry used when a model is not recognised. */
  fallback: z.string(),
  models: z.array(ModelPrice).min(1)
})

export type Pricing = z.infer<typeof PricingSchema>
export type ModelPrice = z.infer<typeof ModelPrice>

export function parsePricing(raw: unknown): Pricing {
  return PricingSchema.parse(raw)
}

export interface PriceLookup {
  price: ModelPrice
  /** False when the model ID matched nothing and the fallback was used. */
  known: boolean
}

/** First entry whose `match` is a substring of the model ID. */
export function priceFor(pricing: Pricing, modelId: string): PriceLookup {
  const id = modelId.toLowerCase()
  const hit = pricing.models.find((m) => id.includes(m.match.toLowerCase()))
  if (hit) return { price: hit, known: true }
  const fallback = pricing.models.find((m) => m.match === pricing.fallback) ?? pricing.models[0]
  return { price: fallback, known: false }
}

export interface Cost {
  usd: number
  tokensUsd: number
  searchUsd: number
  /** True when the model was not recognised, so the number is a guess. */
  approximate: boolean
}

const PER_MILLION = 1_000_000

/** Dollar cost of a task's usage. Server tool use is billed per search. Web fetch has no charge of its own. */
export function costOf(pricing: Pricing, modelId: string, usage: TaskUsage): Cost {
  const { price, known } = priceFor(pricing, modelId)
  const long = price.longPrompt && usage.maxRequestInputTokens > price.longPrompt.overTokens
  const r = long ? price.longPrompt! : price
  const tokensUsd =
    (usage.inputTokens * r.input +
      usage.outputTokens * r.output +
      usage.cacheWriteTokens * r.cacheWrite +
      usage.cacheReadTokens * r.cacheRead) /
    PER_MILLION
  const searchUsd = (usage.webSearchRequests * pricing.webSearchPer1000) / 1000
  return { usd: tokensUsd + searchUsd, tokensUsd, searchUsd, approximate: !known }
}

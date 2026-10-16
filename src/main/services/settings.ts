import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'
import type { ProviderId } from '@shared/types'

const BoundsSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number(),
  height: z.number()
})

const SettingsSchema = z.object({
  schemaVersion: z.literal(1),
  onboardingComplete: z.boolean(),
  provider: z.enum(['anthropic', 'openai', 'gemini']),
  model: z.string().nullable(),
  modelName: z.string().nullable(),
  workspacePath: z.string().nullable(),
  windowBounds: BoundsSchema.nullable(),
  /** The person agreed once to open links from research sources in the browser (REQUIREMENTS-v1 4.3). */
  openResearchLinks: z.boolean().default(false)
})

export type Settings = z.infer<typeof SettingsSchema>

export const defaultSettings = (): Settings => ({
  schemaVersion: 1,
  onboardingComplete: false,
  provider: 'anthropic' satisfies ProviderId,
  model: null,
  modelName: null,
  workspacePath: null,
  windowBounds: null,
  openResearchLinks: false
})

export interface SettingsStore {
  get(): Settings
  update(patch: Partial<Settings>): Settings
}

/** settings.json in `dir`. Not secret. Written atomically (temp file, then rename). */
export function createSettingsStore(dir: string): SettingsStore {
  const file = join(dir, 'settings.json')
  let cache: Settings | null = null

  const load = (): Settings => {
    try {
      const parsed = SettingsSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')))
      if (parsed.success) return parsed.data
    } catch {
      // missing or corrupt: fall back to defaults
    }
    return defaultSettings()
  }

  return {
    get() {
      cache ??= load()
      return cache
    },
    update(patch) {
      const next = { ...this.get(), ...patch }
      mkdirSync(dir, { recursive: true })
      const tmp = `${file}.tmp`
      writeFileSync(tmp, JSON.stringify(next, null, 2))
      renameSync(tmp, file)
      cache = next
      return next
    }
  }
}

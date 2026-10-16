import { readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { parsePricing, type Pricing } from './pricing'

/** Bundled files: next to the app in a packaged build, in the repo's resources/ folder in dev. */
export function resourcesDir(): string {
  return app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
}

export const skillsDir = (): string => join(resourcesDir(), 'skills')

export function loadPricing(): Pricing {
  return parsePricing(JSON.parse(readFileSync(join(resourcesDir(), 'pricing.json'), 'utf8')))
}

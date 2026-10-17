import type { Confidence } from '@shared/wiki-types'

/**
 * Spec 4.3. The model proposes a confidence; the app clamps it to what the sources support.
 *
 *   high:   three or more independent sources, at least one first-party
 *   medium: two independent sources, or one first-party source
 *   low:    anything else
 *
 * "Independent" is counted by origin: every page of one website is one origin; each user file
 * is its own origin. First-party means tagged own-site or private.
 */

export interface SourceInfo {
  /** Wiki-relative path of the raw file. */
  path: string
  /** The raw file's `source` (a URL, or a local path for user files). */
  source: string
  tags: string[]
}

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 }

export const isFirstParty = (s: SourceInfo): boolean =>
  s.tags.includes('own-site') || s.tags.includes('private')

function origin(s: SourceInfo): string {
  try {
    const url = new URL(s.source)
    if (url.protocol === 'http:' || url.protocol === 'https:')
      return url.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    /* not a URL */
  }
  return s.path
}

/** The highest confidence these sources allow. */
export function maxConfidence(sources: SourceInfo[]): Confidence {
  const origins = new Set(sources.map(origin)).size
  const firstParty = sources.some(isFirstParty)
  if (origins >= 3 && firstParty) return 'high'
  if (origins >= 2 || firstParty) return 'medium'
  return 'low'
}

export function clampConfidence(proposed: Confidence, sources: SourceInfo[]): Confidence {
  const max = maxConfidence(sources)
  return RANK[proposed] <= RANK[max] ? proposed : max
}

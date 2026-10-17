import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { ProfileSchema, type Profile } from '@shared/profile'
import { FORMAT_VERSION } from '@shared/wiki-types'
import { stateDir, writeJsonAtomic } from '../state/app-state'
import {
  COMPANY_PROFILE_PATH,
  companyProfileArticle,
  createdOf,
  profileFromArticle
} from '../wiki/company-profile'
import { parseDoc, setScalarInPlace, stringField } from '../wiki/frontmatter'
import { writeIndexes } from '../wiki/index-gen'
import { isoDay } from '../wiki/paths'
import { readmeMd, schemaMd, wikiDescription } from '../wiki/templates'

/** Name used for a new wiki before onboarding has asked for the company. */
export const PLACEHOLDER_COMPANY = 'Your company'

const profilePath = async (root: string): Promise<string> =>
  join(await stateDir(root), 'profile.json')

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

/**
 * profile.json from app state. A wiki this machine has no state for (copied from another
 * machine, or made by the skill pack) gets its profile rebuilt from the company profile article.
 */
export async function readProfile(root: string): Promise<Profile | null> {
  const path = await profilePath(root)
  const saved = await readText(path)
  if (saved !== null) {
    try {
      const parsed = ProfileSchema.safeParse(JSON.parse(saved))
      if (parsed.success) return parsed.data
    } catch {
      /* corrupt: fall back to the article */
    }
  }
  const article = await readText(join(root, COMPANY_PROFILE_PATH))
  const rebuilt = article ? profileFromArticle(article) : null
  if (rebuilt) await writeJsonAtomic(path, rebuilt)
  return rebuilt
}

/** The wiki's format version, or null when the folder is not a PositioningHQ wiki. */
async function wikiFormat(root: string): Promise<number | null> {
  const v = parseDoc((await readText(join(root, 'config.md'))) ?? '')?.data.format_version
  return typeof v === 'number' ? v : null
}

/**
 * Keeps config.md, README.md and schema.md in step with the company name. README and schema are
 * only rewritten while they are exactly what the app wrote for the old name: a founder's edits win.
 */
async function syncIdentity(root: string, company: string): Promise<void> {
  const configPath = join(root, 'config.md')
  const config = await readText(configPath)
  if (!config) return
  const data = parseDoc(config)?.data ?? {}
  const old = stringField(data.title)
  if (old === company) return
  let next = setScalarInPlace(config, 'title', company)
  if (next) next = setScalarInPlace(next, 'description', wikiDescription(company))
  if (next) await writeFile(configPath, next)

  const created = stringField(data.created) || isoDay()
  const readme = await readText(join(root, 'README.md'))
  if (readme === readmeMd(old)) await writeFile(join(root, 'README.md'), readmeMd(company))
  const schema = await readText(join(root, 'schema.md'))
  if (schema === schemaMd(old, created))
    await writeFile(join(root, 'schema.md'), schemaMd(company, created))
}

/** Same article apart from its dates. */
const sameContent = (a: string, b: string): boolean => {
  const strip = (t: string): string => t.replace(/^(created|updated|verified): .*$/gm, '')
  return strip(a) === strip(b)
}

/**
 * Writes profile.json (app state, atomic) and, once the company has a name, the company profile
 * article in the wiki. Profile edits are founder-supplied facts, so rewriting the article is
 * legitimate (it is `compiled-from: conversation`).
 */
export async function writeProfile(root: string, profile: Profile): Promise<void> {
  await writeJsonAtomic(await profilePath(root), profile)
  if (!profile.company.name || (await wikiFormat(root)) !== FORMAT_VERSION) return

  const path = join(root, COMPANY_PROFILE_PATH)
  const existing = await readText(path)
  const today = isoDay()
  const created = (existing && createdOf(existing)) || today
  const next = companyProfileArticle(profile, { created, updated: today })
  if (!existing || !sameContent(existing, next)) await writeFile(path, next)
  await syncIdentity(root, profile.company.name)
  await writeIndexes(root)
}

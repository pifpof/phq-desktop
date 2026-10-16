import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { join } from 'path'
import matter from 'gray-matter'
import { GOALS, ProfileSchema, type Profile } from '@shared/profile'
import { updateVaultCompany } from './vault-config'

const profilePath = (root: string): string => join(root, '.positioninghq', 'profile.json')
const summaryPath = (root: string): string => join(root, 'memory', 'company-profile.md')

export async function readProfile(root: string): Promise<Profile | null> {
  try {
    const parsed = ProfileSchema.safeParse(JSON.parse(await readFile(profilePath(root), 'utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

const line = (label: string, value: string): string => `- **${label}:** ${value || 'Not provided'}`

export function profileMarkdown(p: Profile): string {
  const goals = p.goals.map((id) => GOALS.find((g) => g.id === id)?.label ?? id)
  const role = p.user.role === 'Other' && p.user.roleOther ? p.user.roleOther : p.user.role
  const body = [
    `# ${p.company.name || 'Company'} profile`,
    '',
    'Answers given during onboarding. Treated as ground truth by every research task.',
    '',
    '## Company',
    line('Name', p.company.name),
    line('Website', p.company.website),
    line('Product', p.company.productName || p.company.name),
    line('What you sell', p.company.description),
    line('Main competitors', p.company.competitors.join(', ')),
    '',
    '## About the user',
    line('Name', p.user.name),
    line('Role', role),
    line('Company size', p.user.companySize),
    '',
    '## Goals',
    ...(goals.length ? goals.map((g) => `- ${g}`) : ['- Not provided']),
    ''
  ].join('\n')
  return matter.stringify(body, { title: 'Company profile', status: 'draft' })
}

/** Writes profile.json (app state, atomic) and the readable memory/company-profile.md. */
export async function writeProfile(root: string, profile: Profile): Promise<void> {
  await mkdir(join(root, '.positioninghq'), { recursive: true })
  const tmp = `${profilePath(root)}.tmp`
  await writeFile(tmp, JSON.stringify(profile, null, 2))
  await rename(tmp, profilePath(root))
  if (profile.company.name) {
    await mkdir(join(root, 'memory'), { recursive: true })
    await writeFile(summaryPath(root), profileMarkdown(profile))
    await updateVaultCompany(root, { name: profile.company.name, website: profile.company.website })
  }
}

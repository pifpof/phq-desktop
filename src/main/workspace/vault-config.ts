import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

export const vaultConfigPath = (root: string): string => join(root, 'vault.config.md')

export const STATUS_KEYS = [
  'Company Research',
  'Positioning Playbook',
  'Battlecards',
  'Call Plans'
] as const
export type StatusKey = (typeof STATUS_KEYS)[number]

export interface VaultConfig {
  name: string
  website: string
  industry: string
  status: Record<StatusKey, boolean>
}

const PLACEHOLDER = /^\(.*\)$/

/** Same shape as the skill pack's setup-positioning-vault writes. */
export function createVaultConfig(args: {
  root: string
  createdAt: Date
  name?: string
  website?: string
  industry?: string
  status?: Partial<Record<StatusKey, boolean>>
}): string {
  const box = (k: StatusKey): string => `- [${args.status?.[k] ? 'x' : ' '}] ${k}`
  return `# PositioningHQ Vault

**Created:** ${args.createdAt.toISOString().slice(0, 10)}
**Vault Root:** ${args.root}

## Company
- **Name:** ${args.name || '(not set)'}
- **Website:** ${args.website || '(not set)'}
- **Industry:** ${args.industry || '(not set)'}

## Status
${STATUS_KEYS.map(box).join('\n')}
`
}

function field(text: string, label: string): string {
  const m = new RegExp(`^- \\*\\*${label}:\\*\\*[ \\t]*(.*)$`, 'mi').exec(text)
  const v = m?.[1]?.trim() ?? ''
  return PLACEHOLDER.test(v) ? '' : v
}

export function parseVaultConfig(text: string): VaultConfig {
  const status = Object.fromEntries(
    STATUS_KEYS.map((k) => [k, new RegExp(`^- \\[x\\] ${k}`, 'mi').test(text)])
  ) as Record<StatusKey, boolean>
  return {
    name: field(text, 'Name'),
    website: field(text, 'Website'),
    industry: field(text, 'Industry'),
    status
  }
}

export async function readVaultConfig(root: string): Promise<VaultConfig | null> {
  try {
    return parseVaultConfig(await readFile(vaultConfigPath(root), 'utf8'))
  } catch {
    return null
  }
}

/** Updates company fields in place, keeping everything else in the file as the user left it. */
export async function updateVaultCompany(
  root: string,
  patch: { name?: string; website?: string; industry?: string }
): Promise<void> {
  let text: string
  try {
    text = await readFile(vaultConfigPath(root), 'utf8')
  } catch {
    return
  }
  const set = (label: string, value: string | undefined): void => {
    if (!value) return
    const re = new RegExp(`^(- \\*\\*${label}:\\*\\*)[ \\t]*.*$`, 'mi')
    text = re.test(text) ? text.replace(re, `$1 ${value}`) : text
  }
  set('Name', patch.name)
  set('Website', patch.website)
  set('Industry', patch.industry)
  await writeFile(vaultConfigPath(root), text)
}

/** Ticks or clears a status checkbox. */
export async function setVaultStatus(root: string, key: StatusKey, done: boolean): Promise<void> {
  let text: string
  try {
    text = await readFile(vaultConfigPath(root), 'utf8')
  } catch {
    return
  }
  const re = new RegExp(`^- \\[[ xX]\\] ${key}`, 'm')
  if (!re.test(text)) return
  await writeFile(vaultConfigPath(root), text.replace(re, `- [${done ? 'x' : ' '}] ${key}`))
}

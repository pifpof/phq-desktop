import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { INPUT_CATEGORIES } from '@shared/workspace'
import { createVaultConfig, vaultConfigPath } from './vault-config'
import { exists } from './fs-util'

/** Folders from REQUIREMENTS-v1 section 5. Compatible with the skill pack's vault. */
export const LAYOUT_DIRS = [
  '.positioninghq/runs',
  '.positioninghq/chats',
  ...INPUT_CATEGORIES.map((c) => `inputs/${c}`),
  'memory/research/website/pages',
  'memory/research/competitors',
  'memory/research/inputs-extracted',
  'memory/company-research/steps',
  'memory/positioning-playbook/versions',
  'memory/messaging-analysis',
  'outputs/battlecards',
  'outputs/call-plans',
  'outputs/launch'
] as const

/** Creates the folder tree and a vault.config.md if missing. Idempotent: never overwrites anything. */
export async function createLayout(root: string): Promise<void> {
  for (const dir of LAYOUT_DIRS) await mkdir(join(root, dir), { recursive: true })
  if (!(await exists(vaultConfigPath(root)))) {
    await writeFile(vaultConfigPath(root), createVaultConfig({ root, createdAt: new Date() }))
  }
}

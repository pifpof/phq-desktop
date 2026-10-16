import { readdir } from 'fs/promises'
import { join } from 'path'
import type { Detection } from '@shared/workspace'
import { exists } from './fs-util'
import { readVaultConfig } from './vault-config'

/** Files and folders that do not count as "content" in a folder. */
const IGNORED = new Set(['thumbs.db', 'desktop.ini', 'icon\r'])
const isIgnored = (name: string): boolean => name.startsWith('.') || IGNORED.has(name.toLowerCase())

async function hasPlaybook(root: string): Promise<boolean> {
  try {
    const files = await readdir(join(root, 'memory', 'positioning-playbook'))
    return files.some((f) => f.toLowerCase().endsWith('.md'))
  } catch {
    return false
  }
}

/** REQUIREMENTS-v1 2.1. Call before the workspace marker is written. */
export async function detectWorkspace(root: string): Promise<Detection> {
  if (await exists(join(root, '.positioninghq', 'workspace.json'))) {
    return { kind: (await hasPlaybook(root)) ? 'phq-complete' : 'phq-incomplete', company: null }
  }
  const vault = await readVaultConfig(root)
  if (vault)
    return { kind: 'skillpack-vault', company: { name: vault.name, website: vault.website } }

  let entries: string[] = []
  try {
    entries = await readdir(root)
  } catch {
    // a folder that does not exist yet is empty
  }
  return { kind: entries.some((e) => !isIgnored(e)) ? 'non-empty' : 'empty', company: null }
}

import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { detectWorkspace } from '../../src/main/workspace/detect'
import { createLayout } from '../../src/main/workspace/layout'
import { createVaultConfig } from '../../src/main/workspace/vault-config'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'phq-detect-'))
const write = (root: string, rel: string, text = 'x'): void => {
  mkdirSync(join(root, rel, '..'), { recursive: true })
  writeFileSync(join(root, rel), text)
}

describe('detectWorkspace', () => {
  it('treats an empty folder, or one with only hidden files, as empty', async () => {
    const dir = tmp()
    expect((await detectWorkspace(dir)).kind).toBe('empty')
    write(dir, '.DS_Store')
    mkdirSync(join(dir, '.git'))
    expect((await detectWorkspace(dir)).kind).toBe('empty')
    expect((await detectWorkspace(join(dir, 'does-not-exist'))).kind).toBe('empty')
  })

  it('detects a non-empty folder that is not a workspace', async () => {
    const dir = tmp()
    write(dir, 'Welcome.md')
    mkdirSync(join(dir, '.obsidian'))
    expect((await detectWorkspace(dir)).kind).toBe('non-empty')
  })

  it('detects a PositioningHQ workspace, complete only once a playbook exists', async () => {
    const dir = tmp()
    write(dir, '.positioninghq/workspace.json', '{}')
    expect((await detectWorkspace(dir)).kind).toBe('phq-incomplete')
    write(dir, 'memory/positioning-playbook/versions/Acme-v1.md')
    expect((await detectWorkspace(dir)).kind).toBe('phq-incomplete')
    write(dir, 'memory/positioning-playbook/Acme.md')
    expect((await detectWorkspace(dir)).kind).toBe('phq-complete')
  })

  it('detects a skill-pack vault and reads the company from vault.config.md', async () => {
    const dir = tmp()
    write(
      dir,
      'vault.config.md',
      createVaultConfig({ root: dir, createdAt: new Date(), name: 'Acme', website: 'acme.com' })
    )
    write(dir, 'memory/company-research/Acme.md')
    expect(await detectWorkspace(dir)).toEqual({
      kind: 'skillpack-vault',
      company: { name: 'Acme', website: 'acme.com' }
    })
  })

  it('treats an unfilled vault.config.md as a vault with no company', async () => {
    const dir = tmp()
    write(dir, 'vault.config.md', createVaultConfig({ root: dir, createdAt: new Date() }))
    expect((await detectWorkspace(dir)).company).toEqual({ name: '', website: '' })
  })

  it('a workspace marker wins over a vault config', async () => {
    const dir = tmp()
    write(dir, 'vault.config.md', createVaultConfig({ root: dir, createdAt: new Date() }))
    write(dir, '.positioninghq/workspace.json', '{}')
    expect((await detectWorkspace(dir)).kind).toBe('phq-incomplete')
  })
})

describe('createLayout', () => {
  it('creates the tree idempotently and never overwrites existing files', async () => {
    const dir = tmp()
    write(dir, 'memory/company-research/Acme.md', 'mine')
    await createLayout(dir)
    write(dir, 'vault.config.md', 'edited')
    await createLayout(dir)
    const { readFileSync, existsSync } = await import('fs')
    expect(readFileSync(join(dir, 'memory/company-research/Acme.md'), 'utf8')).toBe('mine')
    expect(readFileSync(join(dir, 'vault.config.md'), 'utf8')).toBe('edited')
    for (const d of [
      'inputs/sales collateral',
      'inputs/help-docs',
      'memory/positioning-playbook/versions',
      'outputs/launch',
      '.positioninghq/runs'
    ]) {
      expect(existsSync(join(dir, d))).toBe(true)
    }
  })
})

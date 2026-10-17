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

  const config = (version: string): string =>
    `---\ntitle: "Acme"\ndescription: "x"\ncreated: 2026-10-17\nformat_version: ${version}\n---\n`

  it('detects a PositioningHQ wiki, complete once research has written something', async () => {
    const dir = tmp()
    write(dir, 'config.md', config('1'))
    expect(await detectWorkspace(dir)).toEqual({
      kind: 'phq-incomplete',
      company: { name: 'Acme', website: '' },
      formatVersion: 1
    })
    write(dir, 'wiki/references/company-profile.md', '---\ntitle: "P"\n---\n')
    expect((await detectWorkspace(dir)).kind).toBe('phq-incomplete')
    write(dir, 'output/positioning-playbook-v1-2026-10-17.md')
    expect((await detectWorkspace(dir)).kind).toBe('phq-complete')
  })

  it('opens a newer format read-only and sends an older one to migration', async () => {
    const dir = tmp()
    write(dir, 'config.md', config('2'))
    expect((await detectWorkspace(dir)).kind).toBe('phq-newer')
    write(dir, 'config.md', config('0'))
    expect((await detectWorkspace(dir)).kind).toBe('phq-older')
  })

  it('detects a v1 app workspace and reads the company from its profile', async () => {
    const dir = tmp()
    write(dir, '.positioninghq/workspace.json', '{}')
    write(
      dir,
      '.positioninghq/profile.json',
      JSON.stringify({ company: { name: 'Acme', website: 'acme.com' } })
    )
    write(dir, 'memory/company-profile.md')
    expect(await detectWorkspace(dir)).toEqual({
      kind: 'v1-workspace',
      company: { name: 'Acme', website: 'acme.com' },
      formatVersion: null
    })
  })

  it('warns about an llm-wiki on another subject', async () => {
    const dir = tmp()
    write(dir, '_index.md')
    write(dir, 'config.md', '---\ntitle: "Bitcoin"\n---\n')
    mkdirSync(join(dir, 'raw'))
    mkdirSync(join(dir, 'wiki'))
    expect((await detectWorkspace(dir)).kind).toBe('other-wiki')
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
      company: { name: 'Acme', website: 'acme.com' },
      formatVersion: null
    })
  })

  it('treats an unfilled vault.config.md as a vault with no company', async () => {
    const dir = tmp()
    write(dir, 'vault.config.md', createVaultConfig({ root: dir, createdAt: new Date() }))
    expect((await detectWorkspace(dir)).company).toEqual({ name: '', website: '' })
  })

  it('a v1 workspace marker wins over a vault config', async () => {
    const dir = tmp()
    write(dir, 'vault.config.md', createVaultConfig({ root: dir, createdAt: new Date() }))
    write(dir, '.positioninghq/workspace.json', '{}')
    mkdirSync(join(dir, 'memory'))
    expect((await detectWorkspace(dir)).kind).toBe('v1-workspace')
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
      'outputs/launch'
    ]) {
      expect(existsSync(join(dir, d))).toBe(true)
    }
  })
})

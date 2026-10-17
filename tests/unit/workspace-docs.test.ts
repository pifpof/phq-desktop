import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { listDocs, readDoc } from '../../src/main/workspace/documents'
import { readProfile } from '../../src/main/workspace/profile'
import { createLayout } from '../../src/main/workspace/layout'
import {
  parseVaultConfig,
  readVaultConfig,
  setVaultStatus
} from '../../src/main/workspace/vault-config'
import { stateDir } from '../../src/main/state/app-state'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'phq-docs-'))

describe('documents', () => {
  it('reads front matter, title and body; lists markdown only; tolerates missing files', async () => {
    const root = tmp()
    mkdirSync(join(root, 'memory/a'), { recursive: true })
    writeFileSync(
      join(root, 'memory/a/one.md'),
      '---\ntitle: First\nstatus: draft\ncreated: 2026-10-16\n---\nBody here'
    )
    writeFileSync(join(root, 'memory/a/two.md'), '# Heading title\n\ntext')
    writeFileSync(join(root, 'memory/a/skip.txt'), 'no')
    const one = await readDoc(root, 'memory/a/one.md')
    expect(one).toMatchObject({ title: 'First', body: 'Body here', path: 'memory/a/one.md' })
    expect(typeof one!.frontMatter.created).toBe('string')
    expect((await listDocs(root)).map((d) => [d.path, d.title])).toEqual([
      ['memory/a/one.md', 'First'],
      ['memory/a/two.md', 'Heading title']
    ])
    expect(await readDoc(root, 'memory/a/gone.md')).toBeNull()
    expect(await readDoc(root, '../outside.md')).toBeNull()
    expect(await readDoc(root, 'memory/a/skip.txt')).toBeNull()
  })

  it('survives malformed front matter', async () => {
    const root = tmp()
    mkdirSync(join(root, 'memory'), { recursive: true })
    writeFileSync(join(root, 'memory/bad.md'), '---\n: : [unclosed\n---\ntext')
    await expect(listDocs(root)).resolves.toBeInstanceOf(Array)
  })
})

describe('profile and vault config', () => {
  it('returns null for a missing or corrupt profile', async () => {
    const root = tmp()
    expect(await readProfile(root)).toBeNull()
    writeFileSync(join(await stateDir(root), 'profile.json'), '{nope')
    expect(await readProfile(root)).toBeNull()
  })

  it('ticks and clears status checkboxes without touching other lines', async () => {
    const root = tmp()
    await createLayout(root)
    await setVaultStatus(root, 'Company Research', true)
    expect((await readVaultConfig(root))!.status).toMatchObject({
      'Company Research': true,
      'Positioning Playbook': false
    })
    await setVaultStatus(root, 'Company Research', false)
    expect((await readVaultConfig(root))!.status['Company Research']).toBe(false)
  })

  it('parses a skill-pack style config', () => {
    const text =
      '# PositioningHQ Vault\n\n## Company\n- **Name:** Acme Corp\n- **Website:** acmecorp.com\n- **Industry:** B2B SaaS\n\n## Status\n- [x] Company Research\n- [ ] Positioning Playbook\n'
    expect(parseVaultConfig(text)).toMatchObject({
      name: 'Acme Corp',
      website: 'acmecorp.com',
      industry: 'B2B SaaS',
      status: { 'Company Research': true, 'Positioning Playbook': false }
    })
  })
})

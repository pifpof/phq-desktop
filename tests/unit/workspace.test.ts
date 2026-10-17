import { spawnSync } from 'child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync } from 'fs'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { emptyProfile } from '../../src/shared/profile'
import { confirmWorkspace, defaultWorkspacePath } from '../../src/main/services/workspace'
import {
  forgetWorkspace,
  stateDir,
  stateRoot,
  withWorkspaceId,
  workspaceId
} from '../../src/main/state/app-state'
import { checkWiki } from '../../src/main/wiki/conformance'
import { findHub, hubWorkspacePath, isRegistered, registerInHub } from '../../src/main/wiki/hub'
import { profileFromArticle } from '../../src/main/wiki/company-profile'
import { workspaceIdFrom } from '../../src/main/wiki/templates'
import { workspaceStatus } from '../../src/main/workspace/detect'
import { readProfile, writeProfile } from '../../src/main/workspace/profile'
import { isoDay } from '../../src/main/wiki/paths'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'phq-ws-'))
const LINT = resolve(__dirname, '../../.cache/llm-wiki-v0.25.1/scripts/llm-wiki')

function officialLint(root: string): { ran: boolean; ok: boolean; out: string } {
  if (!existsSync(LINT)) return { ran: false, ok: true, out: '' }
  const r = spawnSync('python3', [LINT, 'lint', '--fail-on', 'warning', root], {
    env: { ...process.env, LLM_WIKI_TODAY: isoDay() },
    encoding: 'utf8'
  })
  if (r.error) return { ran: false, ok: true, out: '' }
  return { ran: true, ok: r.status === 0, out: r.stdout }
}

const acme = () => {
  const p = emptyProfile()
  p.company = {
    name: 'Acme',
    website: 'https://acme.com',
    productName: 'Acme Forecast',
    description: 'revenue forecasting for RevOps teams',
    competitors: ['Ledgerly', 'Sheets & Co']
  }
  p.user = { name: 'Wile', role: 'Founder or CEO', roleOther: '', companySize: '11 to 50' }
  p.goals = ['positioning', 'competitors']
  p.onboarding = { step: 'start', complete: true }
  return p
}

describe('new workspace', () => {
  it('builds the default path under documents', () => {
    expect(defaultWorkspacePath('/docs')).toBe(join('/docs', 'PositioningHQ'))
  })

  it('creates a wiki skeleton that is lint-clean before any research, with state outside it', async () => {
    const dir = join(tmp(), 'new')
    expect(await confirmWorkspace(dir, '0.2.0')).toEqual({ ok: true, existing: false })
    expect(readdirSync(dir).sort()).toEqual(
      [
        'README.md',
        '_index.md',
        'config.md',
        'inbox',
        'log.md',
        'output',
        'raw',
        'schema.md',
        'wiki'
      ].sort()
    )
    const config = readFileSync(join(dir, 'config.md'), 'utf8')
    const id = workspaceIdFrom(config)
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(config).toContain('title: "Your company"')
    const record = JSON.parse(readFileSync(join(stateRoot(), id!, 'workspace.json'), 'utf8'))
    expect(record).toMatchObject({ schemaVersion: 1, workspaceId: id, appVersion: '0.2.0' })

    const report = await checkWiki(dir)
    expect(report.findings).toEqual([])
    const lint = officialLint(dir)
    if (lint.ran) expect(lint.ok, lint.out).toBe(true)
  })

  it('keeps an existing wiki as it is', async () => {
    const dir = tmp()
    await confirmWorkspace(dir, '0.2.0')
    const config = readFileSync(join(dir, 'config.md'), 'utf8')
    expect(await confirmWorkspace(dir, '0.3.0')).toEqual({ ok: true, existing: true })
    expect(readFileSync(join(dir, 'config.md'), 'utf8')).toBe(config)
  })

  it('refuses old layouts and other wikis', async () => {
    const v1 = tmp()
    await mkdir(join(v1, '.positioninghq'), { recursive: true })
    await writeFile(join(v1, '.positioninghq/workspace.json'), '{}')
    await mkdir(join(v1, 'memory'))
    expect(await confirmWorkspace(v1, '0.2.0')).toEqual({ ok: false, reason: 'needs_migration' })
    expect(existsSync(join(v1, 'config.md'))).toBe(false)

    const other = tmp()
    await writeFile(join(other, '_index.md'), '# Bitcoin')
    await mkdir(join(other, 'raw'))
    await mkdir(join(other, 'wiki'))
    expect(await confirmWorkspace(other, '0.2.0')).toEqual({ ok: false, reason: 'other_wiki' })
  })

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'rejects an unwritable folder',
    async () => {
      const dir = tmp()
      chmodSync(dir, 0o500)
      expect(await confirmWorkspace(dir, '1.0.0')).toEqual({ ok: false, reason: 'not_writable' })
      chmodSync(dir, 0o700)
    }
  )
})

describe('profile and identity', () => {
  it('writes the profile to app state and the company profile article to the wiki', async () => {
    const dir = tmp()
    await confirmWorkspace(dir, '0.2.0')
    await writeProfile(dir, acme())
    expect(await readProfile(dir)).toEqual(acme())
    expect(existsSync(join(await stateDir(dir), 'profile.json'))).toBe(true)

    const article = await readFile(join(dir, 'wiki/references/company-profile.md'), 'utf8')
    expect(article).toContain('compiled-from: conversation')
    expect(article).toContain('- **Product:** Acme Forecast')
    expect(article).toContain('- Sheets & Co')
    // The placeholder name is replaced everywhere the app wrote it.
    expect(await readFile(join(dir, 'config.md'), 'utf8')).toContain('title: "Acme"')
    expect(await readFile(join(dir, 'README.md'), 'utf8')).toMatch(/^# Acme positioning wiki/)
    expect(await readFile(join(dir, '_index.md'), 'utf8')).toMatch(/^# Acme/)
    expect((await checkWiki(dir)).findings).toEqual([])
    const lint = officialLint(dir)
    if (lint.ran) expect(lint.ok, lint.out).toBe(true)
  })

  it("doesn't overwrite a README the founder edited", async () => {
    const dir = tmp()
    await confirmWorkspace(dir, '0.2.0')
    await writeFile(join(dir, 'README.md'), '# Our own readme')
    await writeProfile(dir, acme())
    expect(await readFile(join(dir, 'README.md'), 'utf8')).toBe('# Our own readme')
  })

  it('rebuilds the profile from the wiki when this machine has no state for it', async () => {
    const dir = tmp()
    await confirmWorkspace(dir, '0.2.0')
    await writeProfile(dir, acme())
    // Delete all app state: as if the wiki was copied to another machine.
    await rm(await stateDir(dir), { recursive: true, force: true })
    forgetWorkspace()
    const rebuilt = await readProfile(dir)
    expect(rebuilt).toEqual({ ...acme(), updates: emptyProfile().updates })
    expect(existsSync(join(await stateDir(dir), 'profile.json'))).toBe(true)
  })

  it('reads a custom role and tolerates hand edits in the article', () => {
    const text = `---\ntitle: "Company Profile"\n---\n\n# Company Profile\n\n## Company\n\n- **Name:** Acme\n- **Website:** Not provided\n\n## About the founder\n\n- **Role:** Head of Growth\n\n## Goals\n\n- Understand our competitors\n- Something we made up\n`
    const p = profileFromArticle(text)!
    expect(p.company.name).toBe('Acme')
    expect(p.company.website).toBe('')
    expect(p.user).toMatchObject({ role: 'Other', roleOther: 'Head of Growth' })
    expect(p.goals).toEqual(['competitors'])
    expect(profileFromArticle('---\ntitle: "x"\n---\nno name')).toBeNull()
  })

  it('gives a wiki without an ID a new one in config.md, keeping the rest', async () => {
    const dir = tmp()
    const config =
      '---\ntitle: "Acme"\ndescription: "x"\ncreated: 2026-10-17\nformat_version: 1\n---\n\n# Wiki Configuration\n'
    await writeFile(join(dir, 'config.md'), config)
    const id = await workspaceId(dir)
    const after = await readFile(join(dir, 'config.md'), 'utf8')
    expect(after.startsWith(config.trimEnd())).toBe(true)
    expect(workspaceIdFrom(after)).toBe(id)
    expect(withWorkspaceId('x\n\n## PositioningHQ\n', id)).toBe(
      `x\n\n## PositioningHQ\n\nWorkspace ID: ${id}\n`
    )
  })

  it('follows the wiki when it is moved', async () => {
    const a = tmp()
    await confirmWorkspace(a, '0.2.0')
    await writeProfile(a, acme())
    const b = join(tmp(), 'moved')
    await (await import('fs/promises')).cp(a, b, { recursive: true })
    expect(await workspaceId(b)).toBe(await workspaceId(a))
    expect((await readProfile(b))?.company.name).toBe('Acme')
  })

  it('reports read-only for a newer format', async () => {
    const dir = tmp()
    await writeFile(join(dir, 'config.md'), '---\ntitle: "A"\nformat_version: 9\n---\n')
    expect(await workspaceStatus(dir)).toBe('read-only')
    await writeFile(join(dir, 'config.md'), '---\ntitle: "A"\nformat_version: 1\n---\n')
    expect(await workspaceStatus(dir)).toBe('ok')
  })
})

describe('a wiki made elsewhere (acceptance 13)', () => {
  it('opens without conversion, passes the check, and gets its profile from the wiki', async () => {
    const dir = join(tmp(), 'wiki')
    await (
      await import('fs/promises')
    ).cp(resolve(__dirname, '../fixtures/phq-wiki-min'), dir, { recursive: true })
    const { detectWorkspace } = await import('../../src/main/workspace/detect')
    expect((await detectWorkspace(dir)).kind).toBe('phq-complete')
    expect(await confirmWorkspace(dir, '0.2.0')).toEqual({ ok: true, existing: true })
    expect((await checkWiki(dir, '2026-10-17')).ok).toBe(true)
    const p = await readProfile(dir)
    expect(p?.company.name).toBe('Acme')
    expect(p?.company.competitors).toEqual(['Ledgerly'])
  })
})

describe('llm-wiki hub', () => {
  async function makeHub(home: string, hubPath: string): Promise<string> {
    const hub = join(home, 'wiki')
    await mkdir(join(hub, 'topics'), { recursive: true })
    await writeFile(
      join(hub, 'wikis.json'),
      JSON.stringify(
        {
          default: '<HUB>',
          wikis: { hub: { path: '<HUB>', description: 'Hub' } },
          local_wikis: []
        },
        null,
        4
      )
    )
    await writeFile(join(hub, 'log.md'), '# Hub log\n')
    await mkdir(join(home, '.config', 'llm-wiki'), { recursive: true })
    await writeFile(
      join(home, '.config', 'llm-wiki', 'config.json'),
      JSON.stringify({ hub_path: hubPath })
    )
    return hub
  }

  it('is hidden without a readable hub config', async () => {
    const home = tmp()
    expect(await findHub(home)).toBeNull()
    await mkdir(join(home, '.config', 'llm-wiki'), { recursive: true })
    await writeFile(
      join(home, '.config', 'llm-wiki', 'config.json'),
      JSON.stringify({ hub_path: '~/wiki' })
    )
    expect(await findHub(home)).toBeNull()
  })

  it('expands only a leading ~ and registers a topic wiki, keeping the rest of wikis.json', async () => {
    const home = tmp()
    const hubDir = await makeHub(home, '~/wiki')
    const hub = (await findHub(home))!
    expect(hub.path).toBe(resolve(hubDir))
    const ws = hubWorkspacePath(hub, 'Acme Inc.')
    expect(ws).toBe(join(hubDir, 'topics', 'acme-inc'))
    await confirmWorkspace(ws, '0.2.0')
    expect(await isRegistered(hub, ws)).toBe(false)
    expect(
      await registerInHub(hub, ws, 'PositioningHQ positioning wiki for Acme', '2026-10-17')
    ).toBe(true)
    const registry = JSON.parse(await readFile(join(hubDir, 'wikis.json'), 'utf8'))
    expect(registry).toEqual({
      default: '<HUB>',
      wikis: {
        hub: { path: '<HUB>', description: 'Hub' },
        'acme-inc': {
          path: 'topics/acme-inc',
          description: 'PositioningHQ positioning wiki for Acme',
          status: 'active'
        }
      },
      local_wikis: []
    })
    expect(await readFile(join(hubDir, 'log.md'), 'utf8')).toBe(
      '# Hub log\n\n## [2026-10-17] register | PositioningHQ wiki acme-inc (topics/acme-inc)\n'
    )
    expect(await isRegistered(hub, ws)).toBe(true)
    // Registering twice changes nothing.
    await registerInHub(hub, ws, 'x', '2026-10-18')
    expect((await readFile(join(hubDir, 'log.md'), 'utf8')).match(/register/g)).toHaveLength(1)
  })

  it('refuses a folder that is not directly inside the hub topics', async () => {
    const home = tmp()
    await makeHub(home, join(home, 'wiki'))
    const hub = (await findHub(home))!
    expect(await registerInHub(hub, tmp(), 'x')).toBe(false)
    expect(await registerInHub(hub, join(hub.topicsPath, 'a', 'b'), 'x')).toBe(false)
  })
})

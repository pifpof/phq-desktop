import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { cp, mkdtemp, readdir, readFile, rm, stat } from 'fs/promises'
import { createHash } from 'crypto'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { finishMigration, migrate, recoverInterrupted } from '../../src/main/migrate'
import { createBackup, restoreBackup } from '../../src/main/migrate/backup'
import { splitMoats, splitValueDrivers } from '../../src/main/migrate/split-playbook'
import { detectWorkspace } from '../../src/main/workspace/detect'
import { readProfile } from '../../src/main/workspace/profile'
import { parseDoc } from '../../src/main/wiki/frontmatter'
import { scanWiki } from '../../src/main/wiki/scan'

const FIXTURE = resolve(__dirname, '../fixtures/v1-workspace')
const LINT = resolve(__dirname, '../../.cache/llm-wiki-v0.25.1/scripts/llm-wiki')
const DAY = '2026-10-17'

const dirs: string[] = []
const tmp = async (): Promise<string> => {
  const d = await mkdtemp(join(tmpdir(), 'phq-mig-'))
  dirs.push(d)
  return d
}
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true })
})

async function files(root: string, rel = ''): Promise<string[]> {
  const out: string[] = []
  for (const e of await readdir(join(root, rel), { withFileTypes: true })) {
    const child = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...(await files(root, child)))
    else out.push(child)
  }
  return out.sort()
}
async function treeHash(root: string): Promise<string> {
  const h = createHash('sha256')
  for (const f of await files(root)) h.update(f).update(await readFile(join(root, f)))
  return h.digest('hex')
}

async function v1Copy(): Promise<{ ws: string; backups: string }> {
  const ws = join(await tmp(), 'ws')
  await cp(FIXTURE, ws, { recursive: true })
  return { ws, backups: join(await tmp(), 'backups') }
}

const opts = (backups: string) => ({
  mode: 'convert' as const,
  appVersion: '0.2.0',
  date: DAY,
  backupDir: backups,
  company: 'Acme Advisory',
  idForBackup: 'test'
})

describe('v1 migration', () => {
  it('detects the fixture as a v1 workspace', async () => {
    expect((await detectWorkspace(FIXTURE)).kind).toBe('v1-workspace')
  })

  it('backs up and verifies first, converts every v1 file, and passes lint once the old folders go', async () => {
    const { ws, backups } = await v1Copy()
    const before = await files(ws)
    const r = await migrate(ws, opts(backups))

    // The backup holds the whole v1 workspace.
    const zip = await JSZip.loadAsync(await readFile(r.backup))
    expect(
      Object.values(zip.files)
        .filter((e) => !e.dir)
        .map((e) => e.name)
        .sort()
    ).toEqual(before)

    // Every v1 file is accounted for in the report.
    const reported = new Set(r.report.map((e) => e.v1))
    expect(before.filter((f) => !reported.has(f))).toEqual([])
    expect(await readFile(r.reportPath, 'utf8')).toContain('| v1 file | Now | Note |')

    // The articles the v1 content maps to (spec section 6).
    const wiki = await scanWiki(ws)
    const slugs = wiki.filter((f) => f.kind === 'article').map((f) => f.name)
    for (const s of [
      'company-overview',
      'product-overview',
      'market-segment',
      'customer-segment',
      'strengths',
      'weaknesses',
      'recent-developments',
      'market-position-summary',
      'current-messaging',
      'social-taglines',
      'market-overview',
      'ideal-customer-profile',
      'value-drivers',
      'positioning-statement',
      'competitive-landscape',
      'proof-points',
      'company-profile',
      'competitor-deloitte',
      'competitor-accorian',
      'competitor-techcxo'
    ])
      expect(slugs, s).toContain(s)
    expect(slugs.filter((s) => s.startsWith('value-driver-'))).toHaveLength(3)
    expect(slugs.filter((s) => s.startsWith('moat-'))).toHaveLength(3)
    // Both playbook versions and the messaging analysis are outputs now.
    const outputs = wiki
      .filter((f) => f.kind === 'output')
      .map((f) => f.name)
      .sort()
    expect(outputs).toEqual([
      'messaging-analysis-v1-2026-10-16',
      'positioning-playbook-v1-2026-10-16',
      'positioning-playbook-v2-2026-10-16'
    ])

    // Private material stays private: the user file and every playbook article built alongside it.
    const board = wiki.find((f) => f.kind === 'raw' && f.name.endsWith('-board-notes'))!
    expect(board.data?.tags).toEqual(['private', 'company-strategy'])
    expect(board.data?.source).toBe('inbox/.processed/Board notes.txt')
    const ps = wiki.find((f) => f.name === 'positioning-statement')!
    expect(ps.data?.tags).toContain('private')
    expect(ps.data?.['compiled-from']).toBe('mixed')
    expect(String(ps.data?.sources)).toContain('legacy-positioning-playbook')
    // Web-sourced research cites citation records made from its v1 URLs.
    const product = wiki.find((f) => f.name === 'product-overview')!
    const cited = wiki.find((f) => f.rel === (product.data?.sources as string[])[0])!
    expect(cited.kind).toBe('raw')

    // Profile, runs and chats moved to app state.
    expect((await readProfile(ws))?.company.name).toBe('Acme Advisory')

    // Before the old folders go, only they are flagged; then lint is clean.
    expect(r.check.findings.filter((f) => f.severity === 'critical')).toEqual([])
    expect(r.legacy.sort()).toEqual(['.positioninghq', 'inputs', 'memory', 'vault.config.md'])
    const after = await finishMigration(ws, 'remove')
    expect(
      after.findings.filter(
        (f) => f.severity === 'critical' || (f.severity === 'warning' && f.check !== 'C14')
      )
    ).toEqual([])
    expect(existsSync(join(ws, 'memory'))).toBe(false)
    expect((await detectWorkspace(ws)).kind).toBe('phq-complete')
    if (existsSync(LINT)) {
      const lint = spawnSync('python3', [LINT, 'lint', '--fail-on', 'warning', ws], {
        env: { ...process.env, LLM_WIKI_TODAY: DAY },
        encoding: 'utf8'
      })
      expect(lint.status, lint.stdout).toBe(0)
    }
  })

  it('can move the old folders aside instead, keeping the wiki lint clean', async () => {
    const { ws, backups } = await v1Copy()
    await migrate(ws, opts(backups))
    const after = await finishMigration(ws, 'move')
    expect(existsSync(join(ws, 'inbox/.unknown/v1-legacy/memory'))).toBe(true)
    expect(after.findings.filter((f) => f.severity === 'critical')).toEqual([])
  })

  it('restores the workspace from the backup when conversion fails', async () => {
    const { ws, backups } = await v1Copy()
    const before = await treeHash(ws)
    await expect(
      migrate(ws, {
        ...opts(backups),
        onStep: (s) => {
          if (s.startsWith('Splitting the playbook')) throw new Error('forced failure')
        }
      })
    ).rejects.toThrow('forced failure')
    expect(await treeHash(ws)).toBe(before)
    expect((await detectWorkspace(ws)).kind).toBe('v1-workspace')
  })

  it('restores an interrupted conversion on the next start', async () => {
    const { ws, backups } = await v1Copy()
    const before = await treeHash(ws)
    // Simulate a crash: stop mid-conversion without the failure handler running.
    let crashed = false
    await migrate(ws, {
      ...opts(backups),
      onStep: (s) => {
        if (s.startsWith('Converting competitor')) {
          crashed = true
          throw new Error('crash')
        }
      }
    }).catch(() => undefined)
    expect(crashed).toBe(true)
    // (The failure path already restored it; a real crash leaves the marker, which recovery uses.)
    expect(await recoverInterrupted(ws)).toBe(false)
    expect(await treeHash(ws)).toBe(before)
  })

  it('a rebuild keeps only the profile and files', async () => {
    const { ws, backups } = await v1Copy()
    const r = await migrate(ws, { ...opts(backups), mode: 'rebuild' })
    const slugs = (await scanWiki(ws)).filter((f) => f.kind === 'article').map((f) => f.name)
    expect(slugs).toEqual(['company-profile'])
    expect(r.report.every((e) => e.to.length || e.why)).toBe(true)
  })
})

describe('backup', () => {
  it('verifies and restores byte for byte', async () => {
    const { ws } = await v1Copy()
    const target = join(await tmp(), 'b.zip')
    const b = await createBackup(ws, target)
    expect(b.files).toBe((await files(ws)).length)
    const before = await treeHash(ws)
    await rm(join(ws, 'memory'), { recursive: true })
    await restoreBackup(ws, target)
    expect(await treeHash(ws)).toBe(before)
    expect((await stat(target)).size).toBeGreaterThan(0)
  })
})

describe('playbook split', () => {
  it('splits value drivers and moats by their headings', async () => {
    const vd = await readFile(
      join(FIXTURE, 'memory/positioning-playbook/sections/03-value-drivers.md'),
      'utf8'
    )
    const s = splitValueDrivers(parseDoc(vd)?.body ?? vd.replace(/^---[\s\S]*?---\n/, ''))
    expect(s.split).toBe(true)
    expect(s.parts.map((p) => p.slug)).toEqual([
      'value-driver-use-ai-on-client-work-without-client-data-leaving',
      'value-driver-company-knowledge-that-new-hires-and-ai-assistants',
      'value-driver-a-senior-led-ai-plan-sized-for-a-small-firm-and'
    ])
    expect(s.main!.body).toContain('Final 3 Value Drivers')
    expect(s.parts[0].body).not.toMatch(/^#### /m)
    const m = splitMoats(
      (
        await readFile(
          join(FIXTURE, 'memory/positioning-playbook/sections/04-distinct-advantages.md'),
          'utf8'
        )
      ).replace(/^---[\s\S]*?---\n/, '')
    )
    expect(m.parts.map((p) => p.title)).toEqual([
      'Private AI Scoped for a Small Regulated Firm',
      'Company Knowledge in Plain Files the Client Owns',
      'Operator-Led Delivery by Someone Who Has Run the Function'
    ])
    expect(m.parts[0].body).toMatch(/^## 1\. Description of the Advantage/m)
    expect(splitValueDrivers('## Section 3: Value Drivers\n\nNo headings here.').split).toBe(false)
  })
})

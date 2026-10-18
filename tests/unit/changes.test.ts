import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { cp, mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ChangeInput } from '../../src/shared/changes'
import { recordDecision } from '../../src/main/research/decisions'
import {
  affectsOf,
  changesForPage,
  createChange,
  listChanges,
  setChangeStatus,
  shortName,
  updateChange
} from '../../src/main/wiki/changes'
import { checkWiki } from '../../src/main/wiki/conformance'
import { scanWiki } from '../../src/main/wiki/scan'

const GENERATED = resolve(__dirname, '../fixtures/phq-wiki-generated')
const LINT = resolve(__dirname, '../../.cache/llm-wiki-v0.25.1/scripts/llm-wiki')
const DAY = '2026-10-18'

const dirs: string[] = []
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true })
})
async function wiki(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'phq-changes-'))
  dirs.push(d)
  await cp(GENERATED, d, { recursive: true })
  return d
}

function lintClean(root: string): void {
  if (!existsSync(LINT)) return
  const r = spawnSync('python3', [LINT, 'lint', '--fail-on', 'warning', root], {
    env: { ...process.env, LLM_WIKI_TODAY: DAY },
    encoding: 'utf8'
  })
  expect(r.status, r.stdout).toBe(0)
}

const input = (more: Partial<ChangeInput> = {}): ChangeInput => ({
  page: 'ideal-customer-profile',
  section: 'Buyer roles',
  quote: 'Founders at seed-stage companies.',
  why: 'Our buyers are heads of sales, not founders.',
  changeTo: 'Lead with heads of sales at 50 to 200 person companies. Founders are secondary.',
  basedOn: [],
  notes: '',
  affects: ['value-drivers', 'positioning-statement'],
  ...more
})

describe('short names', () => {
  it('takes the first sentence of "Change it to", cut near 70 characters', () => {
    expect(shortName('Lead with heads of sales. Founders are secondary.')).toBe(
      'Lead with heads of sales'
    )
    const long = shortName(
      'Position the product as the governance layer every regulated firm needs before it lets AI near client work'
    )
    expect(long.length).toBeLessThanOrEqual(73)
    expect(long.endsWith('...')).toBe(true)
  })
})

describe('changes', () => {
  it('saves a pending change as a decision article, logs it, and reads it back', async () => {
    const root = await wiki()
    const c = await createChange(root, input(), DAY)
    expect(c).toMatchObject({
      name: 'Lead with heads of sales at 50 to 200 person companies',
      page: 'ideal-customer-profile',
      pageTitle: 'Ideal Customer Profile',
      section: 'Buyer roles',
      quote: 'Founders at seed-stage companies.',
      why: 'Our buyers are heads of sales, not founders.',
      status: 'pending',
      created: DAY,
      legacy: false
    })
    expect(c.affects.map((a) => a.slug)).toEqual(['value-drivers', 'positioning-statement'])
    expect(c.path).toMatch(/^wiki\/references\/decision-2026-10-18-lead-with-heads-of-sales/)
    const text = await readFile(join(root, c.path), 'utf8')
    expect(text).toContain('title: "Change: Lead with heads of sales')
    expect(text).toContain('**Status:** Pending')
    expect(text).toContain('compiled-from: conversation')
    expect(await readFile(join(root, 'log.md'), 'utf8')).toContain(
      `## [${DAY}] change | requested: Lead with heads of sales at 50 to 200 person companies (Ideal Customer Profile)`
    )
    // The affected articles link back (See Also), so the wiki stays reciprocal.
    const icp = await readFile(join(root, 'wiki/topics/ideal-customer-profile.md'), 'utf8')
    expect(icp).toContain(c.id)
    expect(
      (await checkWiki(root, DAY)).findings.filter((f) => f.severity !== 'suggestion')
    ).toEqual([])
    lintClean(root)
  })

  it('keeps pasted notes as a private raw note and tags the change private', async () => {
    const root = await wiki()
    const files = await scanWiki(root)
    const pub = files.find((f) => f.kind === 'raw' && f.rel.includes('source-example-a'))!.rel
    const c = await createChange(
      root,
      input({
        basedOn: [pub, 'raw/articles/missing.md'],
        notes: 'Call with Dana: heads of sales sign.'
      }),
      DAY
    )
    expect(c.basedOn.map((b) => b.path)).toEqual([
      pub,
      expect.stringMatching(/^raw\/notes\/2026-10-18-change-notes-/)
    ])
    expect(c.private).toBe(true)
    const note = await readFile(join(root, c.basedOn[1].path), 'utf8')
    expect(note).toContain('tags: [private, change-notes]')
    expect(note).toContain('Call with Dana')
    const text = await readFile(join(root, c.path), 'utf8')
    expect(text).toContain('compiled-from: mixed')
    lintClean(root)
  })

  it('edits and withdraws waiting changes only, logging each', async () => {
    const root = await wiki()
    const c = await createChange(root, input(), DAY)
    const edited = await updateChange(
      root,
      c.id,
      input({ section: null, why: 'Sales leads buy.' }),
      DAY
    )
    expect([edited.id, edited.section, edited.why]).toEqual([c.id, null, 'Sales leads buy.'])
    const w = await setChangeStatus(root, c.id, 'withdrawn', null, DAY)
    expect([w.status, w.statusDate]).toEqual(['withdrawn', DAY])
    await expect(updateChange(root, c.id, input(), DAY)).rejects.toThrow()
    const log = await readFile(join(root, 'log.md'), 'utf8')
    expect(log).toContain('change | edited:')
    expect(log).toContain('change | withdrawn:')
    lintClean(root)
  })

  it('marks a change applied to its page, and another as replaced by it', async () => {
    const root = await wiki()
    const a = await createChange(root, input(), DAY)
    const b = await createChange(
      root,
      input({ changeTo: 'Lead with revenue leaders instead.' }),
      DAY
    )
    const applied = await setChangeStatus(root, b.id, 'applied', 'ideal-customer-profile', DAY)
    expect([applied.status, applied.statusRef]).toEqual(['applied', 'ideal-customer-profile'])
    const replaced = await setChangeStatus(root, a.id, 'replaced', b.id, DAY)
    expect([replaced.status, replaced.statusRef]).toEqual(['replaced', b.id])
    const text = await readFile(join(root, applied.path), 'utf8')
    expect(text).toMatch(/^\*\*Status:\*\* Applied 2026-10-18 to \[\[ideal-customer-profile\|/m)
    expect(text).toMatch(/^updated: 2026-10-18$/m)
    lintClean(root)
  })

  it('reads a v2 "Decision:" article as an applied change', async () => {
    const root = await wiki()
    await recordDecision(
      root,
      {
        title: 'Lead with privacy',
        decided: 'Privacy first.',
        why: 'Clients ask.',
        affects: ['positioning-statement', 'value-drivers']
      },
      DAY
    )
    const [c] = await listChanges(root)
    expect(c).toMatchObject({
      name: 'Lead with privacy',
      status: 'applied',
      legacy: true,
      page: 'positioning-statement',
      changeTo: 'Privacy first.',
      why: 'Clients ask.'
    })
    expect(c.affects.map((x) => x.slug)).toEqual(['value-drivers'])
    await expect(setChangeStatus(root, c.id, 'withdrawn')).rejects.toThrow()
  })

  it('groups changes for a page: its own, from other pages, and those to respect', async () => {
    const root = await wiki()
    await createChange(root, input(), DAY)
    await createChange(
      root,
      input({
        page: 'market-overview',
        affects: ['ideal-customer-profile'],
        changeTo: 'Drop AI 101 as an alternative.'
      }),
      DAY
    )
    const applied = await createChange(
      root,
      input({ changeTo: 'Name the buyer as VP Sales.' }),
      DAY
    )
    await setChangeStatus(root, applied.id, 'applied', 'ideal-customer-profile', DAY)
    const g = changesForPage(await listChanges(root), 'ideal-customer-profile')
    expect(g.pending.map((c) => c.name)).toEqual([
      'Lead with heads of sales at 50 to 200 person companies'
    ])
    expect(g.fromOthers.map((c) => c.name)).toEqual(['Drop AI 101 as an alternative'])
    expect(g.respected.map((c) => c.name)).toEqual(['Name the buyer as VP Sales'])
  })
})

describe('what a change affects', () => {
  it('follows the article map: the pages fed by it and the outputs that include it', async () => {
    const files = await scanWiki(GENERATED)
    const icp = affectsOf('ideal-customer-profile', files)
    expect(icp.pages.map((p) => p.slug).sort()).toEqual(
      [
        'market-overview',
        'moat-alpha',
        'moat-beta',
        'positioning-statement',
        'value-driver-one',
        'value-driver-three',
        'value-driver-two',
        'value-drivers'
      ]
        .filter((s) => s !== 'market-overview')
        .sort()
    )
    expect(icp.outputs).toEqual(['Positioning Playbook', 'Messaging Analysis'])
    expect(affectsOf('strengths', files)).toEqual({
      pages: [{ slug: 'market-position-summary', title: 'Market Position Summary' }],
      outputs: []
    })
  })
})

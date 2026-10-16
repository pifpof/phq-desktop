import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import matter from 'gray-matter'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  anchor,
  assembleCompanyResearch,
  assemblePlaybook,
  demoteHeadings,
  latestVersion
} from '../../src/main/research/assemble'
import { createLayout } from '../../src/main/workspace/layout'
import { readVaultConfig } from '../../src/main/workspace/vault-config'
import { emptyProfile } from '../../src/shared/profile'

const profile = emptyProfile()
profile.company.name = 'Acme: Rockets'
const doc = (body: string, sources: string[] = []) =>
  matter.stringify(body, { status: 'draft', sources })
let root: string

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'phq-asm-'))
  await createLayout(root)
})

const writeStep = (file: string, body: string, sources: string[] = []) =>
  writeFileSync(join(root, 'memory/company-research/steps', file), doc(body, sources))
const writeSection = (file: string, body: string) => {
  mkdirSync(join(root, 'memory/positioning-playbook/sections'), { recursive: true })
  writeFileSync(join(root, 'memory/positioning-playbook/sections', file), doc(body))
}
const sections = [
  '01-market-overview',
  '02-target-customers',
  '03-value-drivers',
  '04-distinct-advantages',
  '05-positioning-statement',
  '06-competitive-intelligence',
  '07-customer-proof-points'
]

describe('helpers', () => {
  it('makes GitHub-style anchors and demotes headings outside code', () => {
    expect(anchor('Section 1: Market Overview')).toBe('section-1-market-overview')
    expect(anchor('Value Drivers')).toBe('value-drivers')
    expect(demoteHeadings('# A\n## B\n```\n# not a heading\n```\n###### deep')).toBe(
      '## A\n### B\n```\n# not a heading\n```\n###### deep'
    )
  })
})

describe('assembleCompanyResearch', () => {
  it('joins every step under one title with contents, gathers sources once, and ticks the vault', async () => {
    writeStep(
      '01-company-overview.md',
      '# Company Overview\n## Brand & Positioning\nRockets.\n\n## Sources\n\n- [x](https://a.com)',
      ['https://a.com']
    )
    writeStep('02-product-analysis.md', '# Product Analysis\n## Offerings\nBig rockets.', [
      'https://b.com',
      'https://a.com'
    ])
    writeStep('09-synthesis.md', '# Market Overview\nThe market is moving.')
    const r = await assembleCompanyResearch({ root, profile, runId: 'r1' })
    expect(r.output).toBe('memory/company-research/Acme- Rockets.md')
    expect(r.note).toBe('6 of 9 steps missing')
    const out = matter(readFileSync(join(root, r.output), 'utf8'))
    expect(out.content).toMatch(/^# Company Research: Acme: Rockets/)
    expect(out.content).toContain('1. [Company Overview](#company-overview)')
    expect(out.content).toContain('## Company Overview\n\n### Brand & Positioning')
    expect(out.content).toContain('## Weaknesses\n\nNot available. This step did not run.')
    expect(out.content.match(/## Sources/g)).toHaveLength(1)
    expect(out.data.sources).toEqual(['https://a.com', 'https://b.com'])
    expect(out.data.inputs).toHaveLength(3)
    expect((await readVaultConfig(root))!.status['Company Research']).toBe(true)
  })
})

describe('assemblePlaybook', () => {
  it('builds the seven sections with fixed headings and a working table of contents', async () => {
    sections.forEach((s, i) =>
      writeSection(
        `${s}.md`,
        `## Section ${i + 1} — Whatever the model wrote\n\n### Detail\nBody ${i + 1}.`
      )
    )
    const r = await assemblePlaybook({
      root,
      profile,
      runId: 'r1',
      now: new Date('2026-10-16T09:00:00Z')
    })
    const text = readFileSync(join(root, r.output), 'utf8')
    const out = matter(text)
    expect(out.data).toMatchObject({
      title: 'Positioning Playbook: Acme: Rockets',
      version: 1,
      status: 'draft',
      task: 'playbook-assemble'
    })
    expect(out.content).toContain('Version 1. Generated 2026-10-16. Draft.')
    for (let i = 1; i <= 7; i++) expect(out.content).toContain(`Body ${i}.`)
    // Every contents link points at a heading that exists.
    const links = [...out.content.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1])
    const headings = [...out.content.matchAll(/^## (.+)$/gm)].map((m) => anchor(m[1]))
    expect(links).toHaveLength(7)
    for (const l of links) expect(headings).toContain(l)
    expect(out.content).toContain('## Section 6: Competitive Intelligence')
    expect(out.content).not.toContain('Whatever the model wrote')
    expect(text).not.toContain('—')
    expect((await readVaultConfig(root))!.status['Positioning Playbook']).toBe(true)
  })

  it('writes v1, then v2 on the next run, and never touches v1', async () => {
    sections.forEach((s) => writeSection(`${s}.md`, `First run text for ${s}`))
    const first = await assemblePlaybook({
      root,
      profile,
      runId: 'r1',
      now: new Date('2026-10-16T09:00:00Z')
    })
    expect(first.version).toBe(1)
    const v1Path = join(root, 'memory/positioning-playbook/versions/Acme- Rockets-v1-2026-10-16.md')
    const v1 = readFileSync(v1Path, 'utf8')

    // The person edits the current playbook in Obsidian, then research runs again.
    writeFileSync(join(root, first.output), 'edited by hand')
    sections.forEach((s) => writeSection(`${s}.md`, `Second run text for ${s}`))
    const second = await assemblePlaybook({
      root,
      profile,
      runId: 'r2',
      now: new Date('2026-10-17T09:00:00Z')
    })
    expect(second.version).toBe(2)
    expect(readFileSync(v1Path, 'utf8')).toBe(v1)
    expect(readdirSync(join(root, 'memory/positioning-playbook/versions')).sort()).toEqual([
      'Acme- Rockets-v1-2026-10-16.md',
      'Acme- Rockets-v2-2026-10-17.md'
    ])
    expect(readFileSync(join(root, second.output), 'utf8')).toContain('Second run text')
    expect(await latestVersion(root, 'Acme- Rockets')).toBe(2)
  })

  it('marks missing sections instead of failing', async () => {
    writeSection('01-market-overview.md', 'Only one')
    const r = await assemblePlaybook({ root, profile, runId: 'r1' })
    expect(r.note).toBe('Version 1, 6 of 7 sections missing')
    expect(readFileSync(join(root, r.output), 'utf8')).toContain(
      '## Section 7: Customer Proof Points\n\nNot available. This section did not run.'
    )
  })

  it('counts versions per company only', async () => {
    mkdirSync(join(root, 'memory/positioning-playbook/versions'), { recursive: true })
    writeFileSync(join(root, 'memory/positioning-playbook/versions/Other-v9-2026-01-01.md'), 'x')
    writeFileSync(
      join(root, 'memory/positioning-playbook/versions/Acme- Rockets-v3-2026-01-01.md'),
      'x'
    )
    expect(await latestVersion(root, 'Acme- Rockets')).toBe(3)
  })
})

import { mkdir, readdir, readFile, rename, writeFile } from 'fs/promises'
import { join } from 'path'
import matter from 'gray-matter'
import { anchor } from '@shared/anchor'
import type { Profile } from '@shared/profile'
import { safeName } from '../workspace/safe-name'
import { setVaultStatus } from '../workspace/vault-config'
import { replaceEmDashes } from './postprocess'
import { SECTION_TITLES } from './tasks'

const STEPS: { file: string; title: string }[] = [
  { file: '01-company-overview.md', title: 'Company Overview' },
  { file: '02-product-analysis.md', title: 'Product Analysis' },
  { file: '03-market-segment.md', title: 'Market Segment' },
  { file: '04-customer-segment.md', title: 'Customer Segment' },
  { file: '05-strengths.md', title: 'Strengths' },
  { file: '06-weaknesses.md', title: 'Weaknesses' },
  { file: '07-recent-developments.md', title: 'Recent Developments' },
  { file: '08-competitive-analysis.md', title: 'Competitive Analysis' },
  { file: '09-synthesis.md', title: 'Market Overview' }
]

const SECTION_FILES: Record<string, string> = {
  '01': '01-market-overview.md',
  '02': '02-target-customers.md',
  '03': '03-value-drivers.md',
  '04': '04-distinct-advantages.md',
  '05': '05-positioning-statement.md',
  '06': '06-competitive-intelligence.md',
  '07': '07-customer-proof-points.md'
}

/** Moves every heading down one level (# to ##), outside code blocks. */
export function demoteHeadings(md: string): string {
  let inCode = false
  return md
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) inCode = !inCode
      if (inCode) return line
      return /^#{1,5}\s/.test(line) ? `#${line}` : line
    })
    .join('\n')
}

/** Drops a trailing "## Sources" section (sources are gathered once at the end) and the first heading. */
function body(md: string, dropFirstHeading: boolean): string {
  let text = md.replace(/\n#{1,6}\s+Sources\s*\n[\s\S]*$/i, '').trim()
  if (dropFirstHeading) text = text.replace(/^#{1,2}\s+.*\n?/, '').trim()
  return text
}

async function readPart(path: string): Promise<{ content: string; sources: string[] } | null> {
  try {
    const parsed = matter(await readFile(path, 'utf8'))
    const sources = Array.isArray(parsed.data.sources)
      ? parsed.data.sources.filter((s: unknown) => typeof s === 'string')
      : []
    return { content: parsed.content.trim(), sources }
  } catch {
    return null
  }
}

async function writeAtomic(path: string, text: string): Promise<void> {
  const tmp = `${path}.tmp`
  await writeFile(tmp, text)
  await rename(tmp, path)
}

const dateOnly = (d: Date): string => d.toISOString().slice(0, 10)

export interface AssembleArgs {
  root: string
  profile: Profile
  runId: string
  now?: Date
}

/** memory/company-research/<Company>.md: every step plus the synthesis, as the skill pack does. */
export { anchor }

export async function assembleCompanyResearch(
  a: AssembleArgs
): Promise<{ output: string; note: string }> {
  const name = a.profile.company.name
  const company = safeName(name)
  const stepsDir = join(a.root, 'memory', 'company-research', 'steps')
  const parts: string[] = []
  const sources = new Set<string>()
  const inputs: string[] = []
  let missing = 0

  for (const step of STEPS) {
    const part = await readPart(join(stepsDir, step.file))
    parts.push(`## ${step.title}`)
    if (!part?.content) {
      missing++
      parts.push('Not available. This step did not run.')
      continue
    }
    inputs.push(`memory/company-research/steps/${step.file}`)
    part.sources.forEach((s) => sources.add(s))
    parts.push(demoteHeadings(body(part.content, true)))
  }

  const toc = STEPS.map((s, i) => `${i + 1}. [${s.title}](#${anchor(s.title)})`)
  const doc = [
    `# Company Research: ${name}`,
    '',
    '## Contents',
    '',
    ...toc,
    '',
    parts.join('\n\n'),
    ...(sources.size ? ['', '## Sources', '', ...[...sources].map((s) => `- ${s}`)] : [])
  ].join('\n')

  const rel = `memory/company-research/${company}.md`
  await mkdir(join(a.root, 'memory', 'company-research'), { recursive: true })
  await writeAtomic(
    join(a.root, rel),
    matter.stringify(`${replaceEmDashes(doc)}\n`, {
      title: `Company Research: ${name}`,
      task: 'research-09-synthesis',
      run_id: a.runId,
      created: (a.now ?? new Date()).toISOString(),
      status: 'draft',
      inputs,
      sources: [...sources]
    })
  )
  await setVaultStatus(a.root, 'Company Research', true)
  return {
    output: rel,
    note: missing ? `${missing} of ${STEPS.length} steps missing` : 'Company research assembled'
  }
}

/** Highest version number already written for this company, or 0. */
export async function latestVersion(root: string, company: string): Promise<number> {
  const escaped = company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^${escaped}-v(\\d+)-\\d{4}-\\d{2}-\\d{2}\\.md$`)
  try {
    return (await readdir(join(root, 'memory', 'positioning-playbook', 'versions')))
      .map((f) => Number(re.exec(f)?.[1] ?? 0))
      .reduce((a, b) => Math.max(a, b), 0)
  } catch {
    return 0
  }
}

/**
 * T20: the seven sections, a table of contents, and a version. Writes the current playbook and an
 * immutable copy in versions/. Earlier versions are never touched.
 */
export async function assemblePlaybook(
  a: AssembleArgs
): Promise<{ output: string; version: number; note: string }> {
  const name = a.profile.company.name
  const company = safeName(name)
  const now = a.now ?? new Date()
  const base = join(a.root, 'memory', 'positioning-playbook')
  const parts: string[] = []
  const inputs: string[] = []
  const headings: string[] = []
  let missing = 0

  for (const [n, file] of Object.entries(SECTION_FILES)) {
    const heading = `Section ${Number(n)}: ${SECTION_TITLES[n]}`
    headings.push(heading)
    const part = await readPart(join(base, 'sections', file))
    if (!part?.content) {
      missing++
      parts.push(`## ${heading}\n\nNot available. This section did not run.`)
      continue
    }
    inputs.push(`memory/positioning-playbook/sections/${file}`)
    // The section's own first heading is replaced by a fixed one, so the contents links always work.
    parts.push(`## ${heading}\n\n${body(part.content, /^#{1,2}\s/.test(part.content))}`)
  }

  const version = (await latestVersion(a.root, company)) + 1
  const doc = [
    `# Positioning Playbook: ${name}`,
    '',
    `Version ${version}. Generated ${dateOnly(now)}. Draft.`,
    '',
    '## Table of Contents',
    '',
    ...headings.map(
      (h, i) => `${i + 1}. [${SECTION_TITLES[Object.keys(SECTION_FILES)[i]]}](#${anchor(h)})`
    ),
    '',
    parts.join('\n\n')
  ].join('\n')

  const text = matter.stringify(`${replaceEmDashes(doc)}\n`, {
    title: `Positioning Playbook: ${name}`,
    task: 'playbook-assemble',
    run_id: a.runId,
    version,
    created: now.toISOString(),
    status: 'draft',
    inputs,
    sources: []
  })

  await mkdir(join(base, 'versions'), { recursive: true })
  const versionRel = `memory/positioning-playbook/versions/${company}-v${version}-${dateOnly(now)}.md`
  // "wx": a version file is written once and never overwritten.
  await writeFile(join(a.root, versionRel), text, { flag: 'wx' })
  const rel = `memory/positioning-playbook/${company}.md`
  await writeAtomic(join(a.root, rel), text)
  await setVaultStatus(a.root, 'Positioning Playbook', true)
  return {
    output: rel,
    version,
    note: missing ? `Version ${version}, ${missing} of 7 sections missing` : `Version ${version}`
  }
}

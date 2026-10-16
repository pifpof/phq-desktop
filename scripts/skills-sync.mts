/**
 * npm run skills:sync [-- --commit <sha>] [-- --source <dir>]
 *
 * Copies the skill-pack skills the app uses into resources/skills at the commit pinned in
 * resources/skills/VENDORED.md. Prompts ship with the app and are never downloaded at runtime.
 * Skills written for this app (not in VENDORED) are left alone.
 *
 * Runs on Node 24 directly (type stripping), so keep to erasable TypeScript.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const REPO = 'https://github.com/pifpof/positioningHQ'
const VENDORED_SKILLS = ['company-research', 'positioning-playbook']
const root = resolve(import.meta.dirname, '..')
const skillsDir = join(root, 'resources', 'skills')
const vendoredFile = join(skillsDir, 'VENDORED.md')

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function pinnedCommit(): string {
  const text = existsSync(vendoredFile) ? readFileSync(vendoredFile, 'utf8') : ''
  return /^Commit:\s*([0-9a-f]{40})\s*$/im.exec(text)?.[1] ?? ''
}

const commit = arg('commit') ?? pinnedCommit()
if (!/^[0-9a-f]{40}$/.test(commit)) {
  console.error('No pinned commit. Pass --commit <40 character sha>.')
  process.exit(1)
}

const source = arg('source')
const work = mkdtempSync(join(tmpdir(), 'phq-skills-'))
try {
  const checkout = source ? resolve(source) : join(work, 'repo')
  if (!source) {
    execFileSync('git', ['clone', '--quiet', REPO, checkout], { stdio: 'inherit' })
    execFileSync('git', ['-C', checkout, 'checkout', '--quiet', commit], { stdio: 'inherit' })
  }
  for (const name of VENDORED_SKILLS) {
    const from = join(checkout, 'skills', name)
    const to = join(skillsDir, name)
    rmSync(to, { recursive: true, force: true })
    cpSync(from, to, {
      recursive: true,
      filter: (p) => !p.endsWith('README.md') && !p.endsWith('.DS_Store')
    })
  }
  cpSync(join(checkout, 'LICENSE'), join(skillsDir, 'LICENSE-positioningHQ'))
  writeFileSync(
    vendoredFile,
    `# Vendored skills

These skills are copied from the PositioningHQ skill pack. Do not edit them here. Change them
upstream, then run \`npm run skills:sync -- --commit <sha>\`.

Source: ${REPO}
Commit: ${commit}
Skills: ${VENDORED_SKILLS.join(', ')}
Licence: MIT. Copyright (c) 2026 PositioningHQ See LICENSE-positioningHQ.
Synced: ${new Date().toISOString().slice(0, 10)}

Skills written for this app (not from the skill pack) live beside these and are not touched by the sync.
`
  )
  console.log(`Vendored ${VENDORED_SKILLS.join(', ')} at ${commit.slice(0, 7)}`)
} finally {
  rmSync(work, { recursive: true, force: true })
}

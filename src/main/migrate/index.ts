import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { CheckReport } from '@shared/conformance'
import { mkdir } from 'fs/promises'
import { resolve } from 'path'
import { stateDir, stateRoot, writeJsonAtomic } from '../state/app-state'
import { checkWiki } from '../wiki/conformance'
import { isoDay } from '../wiki/paths'
import { createBackup, restoreBackup } from './backup'
import { convertV1, retireLegacy, type ConvertOptions } from './convert'
import { reportMarkdown, type ReportEntry } from './report'

/**
 * The v1 migration (REQUIREMENTS-v2 section 6): verified backup first, then the conversion, then
 * the conformance check. Any failure restores the workspace from the backup. Progress is saved to
 * app state after each step; an interrupted migration starts again from the backup.
 */

export interface MigrationResult {
  backup: string
  report: ReportEntry[]
  reportPath: string
  articles: number
  check: CheckReport
  legacy: string[]
}

export interface MigrationState {
  status: 'running' | 'converted' | 'failed' | 'finished'
  backup: string
  steps: string[]
  error?: string
}

const stamp = (): string => new Date().toISOString().replace(/[:.]/g, '-')

/**
 * Migrations in progress on this machine, by folder. A half-converted folder already looks like a
 * v2 wiki, so this is what tells the app, after a crash or quit, to restore it from the backup.
 */
const runningFile = (): string => join(stateRoot(), 'migrations-running.json')

async function readRunning(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(runningFile(), 'utf8')) as Record<string, string>
  } catch {
    return {}
  }
}

async function setRunning(root: string, backup: string | null): Promise<void> {
  const all = await readRunning()
  if (backup) all[resolve(root)] = backup
  else delete all[resolve(root)]
  await mkdir(stateRoot(), { recursive: true })
  await writeJsonAtomic(runningFile(), all)
}

/** Restores a folder whose conversion was interrupted. True when it did. */
export async function recoverInterrupted(root: string): Promise<boolean> {
  const backup = (await readRunning())[resolve(root)]
  if (!backup) return false
  await restoreBackup(root, backup)
  await setRunning(root, null)
  return true
}

export async function migrate(
  root: string,
  o: ConvertOptions & { backupDir: string; company: string; idForBackup: string }
): Promise<MigrationResult> {
  const backup = join(o.backupDir, `${o.idForBackup}-v1-${stamp()}.zip`)
  await createBackup(root, backup)
  await setRunning(root, backup)
  const progress: MigrationState = {
    status: 'running',
    backup,
    steps: ['Backup written and checked']
  }
  let statePath: string | null = null
  const save = async (): Promise<void> => {
    if (statePath) await writeJsonAtomic(statePath, progress)
  }
  try {
    const result = await convertV1(root, {
      ...o,
      onStep: (s) => {
        progress.steps.push(s)
        o.onStep?.(s)
        void save()
      }
    })
    statePath = join(await stateDir(root), 'migration.json')
    const date = o.date ?? isoDay()
    const reportPath = join(await stateDir(root), 'conversion-report.md')
    await writeFile(reportPath, reportMarkdown(result.report, { company: o.company, date, backup }))
    await writeJsonAtomic(join(await stateDir(root), 'conversion-report.json'), result.report)
    const check = await checkWiki(root, date)
    progress.status = 'converted'
    progress.steps.push('Checked')
    await save()
    await setRunning(root, null)
    return {
      backup,
      report: result.report,
      reportPath,
      articles: result.articles.length,
      check,
      legacy: result.legacy
    }
  } catch (err) {
    // Put everything back exactly as it was.
    await restoreBackup(root, backup)
    await setRunning(root, null)
    progress.status = 'failed'
    progress.error = err instanceof Error ? err.message.slice(0, 300) : 'unknown'
    throw err
  }
}

/** Step 6: remove the old folders, or move them aside so the wiki stays lint clean. */
export async function finishMigration(root: string, how: 'remove' | 'move'): Promise<CheckReport> {
  await retireLegacy(root, how)
  const path = join(await stateDir(root), 'migration.json')
  try {
    const s = JSON.parse(await readFile(path, 'utf8')) as MigrationState
    await writeJsonAtomic(path, { ...s, status: 'finished' })
  } catch {
    /* no progress file */
  }
  return checkWiki(root)
}

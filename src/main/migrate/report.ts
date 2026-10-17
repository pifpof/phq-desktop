/** The conversion report (REQUIREMENTS-v2 6.1, acceptance 11): every v1 file and where it went. */

export interface ReportEntry {
  /** Path in the v1 workspace. */
  v1: string
  /** Where its content went (wiki paths, or "app data"). Empty when not carried over. */
  to: string[]
  /** Why, when it was not carried over or was handled specially. */
  why?: string
}

export function reportMarkdown(
  entries: ReportEntry[],
  meta: { company: string; date: string; backup: string }
): string {
  const rows = [...entries]
    .sort((a, b) => a.v1.localeCompare(b.v1))
    .map(
      (e) =>
        `| ${e.v1} | ${e.to.length ? e.to.join('<br>') : 'Not carried over'} | ${e.why ?? ''} |`
    )
  return [
    `# Conversion report: ${meta.company}`,
    '',
    `Converted on ${meta.date}. Backup of the v1 workspace: ${meta.backup}`,
    '',
    `${entries.length} v1 files accounted for: ${entries.filter((e) => e.to.length).length} carried over, ${entries.filter((e) => !e.to.length).length} not carried over.`,
    '',
    '| v1 file | Now | Note |',
    '|---|---|---|',
    ...rows,
    ''
  ].join('\n')
}

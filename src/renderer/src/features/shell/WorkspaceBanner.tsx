import { useApp } from '@/store/app'

/** Shown above everything else on Home when the workspace can't be edited (REQUIREMENTS-v2 2.2). */
export function WorkspaceBanner() {
  const status = useApp((s) => s.state?.workspaceStatus)
  const text =
    status === 'read-only'
      ? 'This wiki was made by a newer version of PositioningHQ. Update the app to edit it.'
      : status === 'needs-migration'
        ? 'This workspace uses the old PositioningHQ format. It needs converting to the new wiki format before research can run.'
        : status === 'other-wiki'
          ? 'This is an llm-wiki about something else. Choose an empty folder or a PositioningHQ wiki in Settings.'
          : null
  if (!text) return null
  return (
    <div className="bg-secondary shrink-0 border-b px-6 py-2.5" role="alert">
      <p className="text-sm">{text}</p>
    </div>
  )
}

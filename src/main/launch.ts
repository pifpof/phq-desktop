import type { Route } from '@shared/types'
import type { Settings } from './services/settings'

export interface LaunchInput {
  settings: Settings
  hasKey: boolean
  workspaceWritable: boolean
}

/** REQUIREMENTS 4.5. Never calls the provider. */
export function computeRoute({ settings, hasKey, workspaceWritable }: LaunchInput): {
  route: Route
  note: string | null
} {
  if (!settings.onboardingComplete) return { route: 'welcome', note: null }
  if (!hasKey) return { route: 'connect', note: 'Reconnect your AI to continue' }
  if (!settings.workspacePath || !workspaceWritable) {
    return { route: 'workspace', note: "We couldn't find your workspace folder" }
  }
  return { route: 'chat', note: null }
}

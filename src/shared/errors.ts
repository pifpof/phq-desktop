import { z } from 'zod'

export const PROVIDER_ERROR_CODES = [
  'invalid_key',
  'no_permission',
  'no_credit',
  'rate_limited',
  'overloaded',
  'network',
  'web_search_disabled',
  'spend_limit_reached',
  'unknown'
] as const
export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[number]

export const APP_ERROR_CODES = [
  ...PROVIDER_ERROR_CODES,
  'invalid_payload',
  'forbidden',
  'not_writable',
  'no_workspace',
  'research_running',
  'read_only',
  'needs_migration',
  'other_wiki',
  'no_hub',
  'source_in_use',
  'no_key',
  'not_allowed',
  'internal'
] as const
export type ErrorCode = (typeof APP_ERROR_CODES)[number]
export const ErrorCodeSchema = z.enum(APP_ERROR_CODES)

export const ERROR_COPY: Record<ErrorCode, string> = {
  invalid_key: "That key didn't work. Check you copied all of it.",
  no_permission: "This key doesn't have access. Create a new key in the Console.",
  no_credit:
    'Your key works, but your account has no credit. Add credits under Billing, then try again.',
  rate_limited: 'Anthropic is busy. Try again in a moment.',
  overloaded: 'Anthropic is busy. Try again in a moment.',
  network: "Can't reach Anthropic. Check your internet connection.",
  web_search_disabled:
    "Web search isn't turned on for your Anthropic account. An admin can enable it in the Console under Settings, then Capabilities.",
  spend_limit_reached:
    'Your Anthropic account has reached its spend limit. Raise the limit in the Console, or wait until it resets.',
  unknown: 'Something went wrong.',
  invalid_payload: 'Something went wrong. Please try again.',
  forbidden: 'Something went wrong. Please try again.',
  not_writable: "PositioningHQ can't write to that folder. Choose another.",
  no_workspace: 'Choose a workspace folder first.',
  research_running: 'Research is running in this workspace. Stop it before changing folders.',
  read_only: 'This wiki was made by a newer version of PositioningHQ. Update the app to edit it.',
  needs_migration:
    'This workspace uses the old PositioningHQ format. Convert it to the new wiki format first.',
  other_wiki:
    'This is an llm-wiki about something else. Choose an empty folder or a PositioningHQ wiki.',
  no_hub: "Your llm-wiki hub couldn't be read.",
  source_in_use: "Articles in your wiki cite this file, so it can't be removed.",
  no_key: 'Reconnect your AI to continue.',
  not_allowed: "That link can't be opened from PositioningHQ.",
  internal: 'Something went wrong. Please try again.'
}

/** Safe display text for an error. `detail` is a provider error type, never a key. */
export function errorMessage(code: ErrorCode, detail?: string): string {
  const base = ERROR_COPY[code]
  return code === 'unknown' && detail ? `${base} (${detail})` : base
}

export function isRetryable(code: ErrorCode): boolean {
  return (
    code === 'rate_limited' || code === 'overloaded' || code === 'network' || code === 'unknown'
  )
}

/**
 * Links the app opens in the default browser. Change URLs here only.
 * PLACEHOLDERS: replace both with the real sign-up form and community invite before release.
 */
export const links = {
  /** Hosted sign-up form. The email is appended as `?email=`. */
  signupFormUrl: 'https://parallel79.com/positioninghq/updates',
  communityUrl: 'https://parallel79.com/positioninghq/community',
  parallel79: 'https://parallel79.com',
  /** Expert help request form (REQUIREMENTS-v4 9). Always https. */
  helpRequestUrl: 'https://positioninghq.com/expert-help',
  /** The PDF footer and cover link (REQUIREMENTS-v4 8). */
  pdfSiteUrl: 'https://positioninghq.com/?utm_source=phq-desktop&utm_medium=pdf',
  anthropicConsole: 'https://console.anthropic.com/'
} as const

const FIXED_HOSTS = [
  'console.anthropic.com',
  'docs.anthropic.com',
  'docs.claude.com',
  'parallel79.com',
  'positioninghq.com',
  'github.com'
]

const hostOf = (url: string): string => new URL(url).hostname.toLowerCase()

/** External link allowlist: the fixed hosts plus the hosts of the sign-up and community links above. */
export const ALLOWED_HOSTS: readonly string[] = [
  ...new Set([...FIXED_HOSTS, hostOf(links.signupFormUrl), hostOf(links.communityUrl)])
]

export function isAllowedExternalUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false
  const host = url.hostname.toLowerCase()
  return ALLOWED_HOSTS.some((h) => host === h || host === `www.${h}`)
}

export function signupUrl(email: string): string {
  const url = new URL(links.signupFormUrl)
  const trimmed = email.trim()
  if (trimmed) url.searchParams.set('email', trimmed)
  return url.toString()
}

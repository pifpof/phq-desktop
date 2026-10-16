/** External links the app may open in the default browser. Anything else is refused. */
export const ALLOWED_HOSTS = [
  'console.anthropic.com',
  'docs.anthropic.com',
  'docs.claude.com',
  'parallel79.com',
  'github.com'
] as const

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

/**
 * Turns what a person types ("acme.com", "www.acme.com/", "https://acme.com/x") into a clean URL.
 * Returns null when it cannot be a website address.
 */
export function normalizeWebsite(input: string): string | null {
  let s = input.trim()
  if (!s || /\s/.test(s)) return null
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`
  let url: URL
  try {
    url = new URL(s)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (!url.hostname.includes('.') || url.hostname.endsWith('.')) return null
  return `${url.origin}${url.pathname.replace(/\/$/, '')}${url.search}`
}

export function isEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim())
}

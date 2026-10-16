// eslint-disable-next-line no-control-regex -- control characters are unsafe in file names
const UNSAFE = /[/\\:*?"<>|\u0000-\u001f]/g
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** File-name-safe version of a company name: works on macOS, Windows and Linux. Max 60 chars. */
export function safeName(name: string, fallback = 'Company'): string {
  let out = name.replace(UNSAFE, '-').replace(/\s+/g, ' ').trim()
  out = out.slice(0, 60).trim()
  // Windows does not allow trailing dots or spaces.
  out = out.replace(/[. ]+$/, '').replace(/^\.+/, '')
  if (!out) return fallback
  return RESERVED.test(out) ? `${out}_` : out
}

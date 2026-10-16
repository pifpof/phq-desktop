import { BrowserWindow, session } from 'electron'

const PARTITION = 'crawler'
const TIMEOUT_MS = 15_000
const SETTLE_MS = 1500

let hardened = false
function hardenSession(): void {
  if (hardened) return
  hardened = true
  // In-memory partition (no "persist:" prefix): nothing is kept, and no cookies come from the app.
  const ses = session.fromPartition(PARTITION)
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  ses.setPermissionCheckHandler(() => false)
  ses.on('will-download', (event) => event.preventDefault())
}

let chain: Promise<unknown> = Promise.resolve()

/**
 * Renders a JavaScript-heavy page in a hidden, sandboxed window and returns its HTML.
 * Separate session, no preload, no Node, downloads blocked, permissions denied. One at a time,
 * closed after each page, 15 second limit.
 */
export function renderPage(url: string): Promise<string | null> {
  const run = chain.then(() => renderOne(url))
  chain = run.catch(() => undefined)
  return run
}

async function renderOne(url: string): Promise<string | null> {
  hardenSession()
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      partition: PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      javascript: true,
      images: false
    }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS))
  const work = (async (): Promise<string | null> => {
    await win.loadURL(url)
    await new Promise((r) => setTimeout(r, SETTLE_MS))
    return (await win.webContents.executeJavaScript('document.documentElement.outerHTML')) as string
  })().catch(() => null)
  try {
    return await Promise.race([work, timeout])
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

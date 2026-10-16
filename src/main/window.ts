import { app, BrowserWindow, screen, session } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { openAllowlisted } from './ipc/shell'
import { windowChromeOptions } from './platform'
import type { Settings, SettingsStore } from './services/settings'

const rendererIndex = join(__dirname, '../renderer/index.html')

function devUrl(): string | undefined {
  return app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL']
}

/** True only for the app's own renderer content. */
export function isAppUrl(url: string): boolean {
  const dev = devUrl()
  if (dev) return url === dev || url.startsWith(dev.endsWith('/') ? dev : `${dev}/`)
  return url.startsWith(pathToFileURL(rendererIndex).href)
}

type Bounds = NonNullable<Settings['windowBounds']>

function usableBounds(b: Bounds | null): Bounds | null {
  if (!b) return null
  if (b.x === undefined || b.y === undefined) return { width: b.width, height: b.height }
  const { x, y } = b
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea
    return x < a.x + a.width && x + b.width > a.x && y < a.y + a.height && y + b.height > a.y
  })
  return visible ? b : { width: b.width, height: b.height }
}

export function lockDownSession(): void {
  // The app never needs camera, location, notifications or similar.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false)
  )
}

export function createWindow(store: SettingsStore): BrowserWindow {
  const saved = usableBounds(store.get().windowBounds)
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    ...saved,
    minWidth: 820,
    minHeight: 600,
    show: false,
    backgroundColor: '#ffffff',
    ...windowChromeOptions(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())

  let timer: NodeJS.Timeout | undefined
  const saveBounds = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return
      store.update({ windowBounds: win.getBounds() })
    }, 500)
  }
  win.on('resize', saveBounds)
  win.on('move', saveBounds)

  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    openAllowlisted(url)
    return { action: 'deny' }
  })

  const dev = devUrl()
  if (dev) void win.loadURL(dev)
  else void win.loadFile(rendererIndex)
  return win
}

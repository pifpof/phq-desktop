import { safeStorage, type BrowserWindowConstructorOptions } from 'electron'

/** All process.platform branching lives in this folder. */
export const isMac = process.platform === 'darwin'
export const isWindows = process.platform === 'win32'
export const isLinux = process.platform === 'linux'

export function windowChromeOptions(): BrowserWindowConstructorOptions {
  return isMac ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 18 } } : {}
}

export function revealLabel(): string {
  if (isMac) return 'Show in Finder'
  if (isWindows) return 'Show in Explorer'
  return 'Show in file manager'
}

/** True when the OS can store the key encrypted. On Linux, `basic_text` means no keyring. */
export function isSecureStorageAvailable(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  if (isLinux && safeStorage.getSelectedStorageBackend() === 'basic_text') return false
  return true
}

/** macOS apps stay alive with no windows. */
export const quitWhenAllWindowsClosed = !isMac

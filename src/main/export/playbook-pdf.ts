import { app, BrowserWindow, dialog } from 'electron'
import { writeFile } from 'fs/promises'
import { isAbsolute, join, relative } from 'path'
import type { PdfOptions } from '@shared/playbook'
import { appUrl, isAppUrl } from '../window'

/**
 * Export PDF (REQUIREMENTS-v4 8): a hidden window loads the print view of the playbook, and
 * Electron prints it to PDF. Nothing leaves the machine. The view signals when its fonts and
 * content are ready, so the PDF never catches a half-drawn page.
 */

const READY_TIMEOUT_MS = 30_000

/** Print views waiting to say they are ready, by web contents ID. */
const waiting = new Map<number, () => void>()

/** Called by the print view (IPC print:ready). */
export function printReady(webContentsId: number): void {
  waiting.get(webContentsId)?.()
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Footer on every page: page numbers and the PositioningHQ link (decided 2026-10-19). */
export function footerTemplate(siteUrl: string): string {
  return `<div style="width:100%;font-family:'Inter Variable',Inter,system-ui,sans-serif;font-size:8px;color:#5a5d66;padding:0 0.6in;display:flex;justify-content:space-between;">
<span>Generated with PositioningHQ · <a href="${esc(siteUrl)}" style="color:#2e7a7f;text-decoration:none;">positioninghq.com</a></span>
<span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
</div>`
}

/** A safe file name: letters, numbers and dashes. */
export function pdfName(company: string, version: number): string {
  const c = company.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'Company'
  return `PositioningHQ-Playbook-${c}-v${version}.pdf`
}

export async function exportPlaybookPdf(o: {
  parent: BrowserWindow | null
  workspace: string
  company: string
  version: number
  options: PdfOptions
  siteUrl: string
}): Promise<{ path: string } | null> {
  const saveOptions = {
    title: 'Export the playbook as PDF',
    defaultPath: join(app.getPath('documents'), pdfName(o.company, o.version)),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  }
  const result = o.parent
    ? await dialog.showSaveDialog(o.parent, saveOptions)
    : await dialog.showSaveDialog(saveOptions)
  if (result.canceled || !result.filePath) return null
  // Never inside the wiki: spec-listed files only (CLAUDE.md rule 17).
  const rel = relative(o.workspace, result.filePath)
  if (!rel.startsWith('..') && !isAbsolute(rel)) throw new Error('not inside the wiki')

  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault()
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  try {
    const id = win.webContents.id
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('print view timed out')), READY_TIMEOUT_MS)
      waiting.set(id, () => {
        clearTimeout(timer)
        resolve()
      })
    })
    await win.loadURL(`${appUrl()}#print=${encodeURIComponent(JSON.stringify(o.options))}`)
    await ready
    const pdf = await win.webContents.printToPDF({
      pageSize: o.options.pageSize,
      printBackground: true,
      preferCSSPageSize: false,
      margins: { top: 0.6, bottom: 0.7, left: 0.6, right: 0.6 },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: footerTemplate(o.siteUrl)
    })
    await writeFile(result.filePath, pdf)
    return { path: result.filePath }
  } finally {
    waiting.delete(win.webContents.id)
    win.destroy()
  }
}

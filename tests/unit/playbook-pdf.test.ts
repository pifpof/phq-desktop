import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, BrowserWindow: class {}, dialog: {} }))
vi.mock('../../src/main/window', () => ({ appUrl: () => 'file:///x', isAppUrl: () => true }))

const { footerTemplate, pdfName } = await import('../../src/main/export/playbook-pdf')

describe('PDF file name and footer', () => {
  it('names the file after the company and version, safely', () => {
    expect(pdfName('Parallel79', 3)).toBe('PositioningHQ-Playbook-Parallel79-v3.pdf')
    expect(pdfName('Acme / Rockets: "Inc"', 2)).toBe(
      'PositioningHQ-Playbook-Acme-Rockets-Inc-v2.pdf'
    )
    expect(pdfName('***', 1)).toBe('PositioningHQ-Playbook-Company-v1.pdf')
  })

  it('links positioninghq.com and numbers the pages', () => {
    const f = footerTemplate('https://positioninghq.com/?utm_source=phq-desktop&utm_medium=pdf')
    expect(f).toContain(
      'href="https://positioninghq.com/?utm_source=phq-desktop&amp;utm_medium=pdf"'
    )
    expect(f).toContain('class="pageNumber"')
    expect(f).toContain('Generated with PositioningHQ')
  })
})

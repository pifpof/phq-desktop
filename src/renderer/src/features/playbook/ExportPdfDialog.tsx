import { useState } from 'react'
import { defaultPageSize, type PdfOptions, type PlaybookView } from '@shared/playbook'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { api, ApiError, unwrap } from '@/lib/api'

export function ExportPdfDialog({ view, onClose }: { view: PlaybookView; onClose: () => void }) {
  const [pageSize, setPageSize] = useState<PdfOptions['pageSize']>(() =>
    defaultPageSize(navigator.language)
  )
  const [includeGaps, setIncludeGaps] = useState(true)
  const [includePrivate, setIncludePrivate] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const save = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const r = await unwrap(
        api.exportPdf({ path: view.path, pageSize, includeGaps, includePrivate })
      )
      if (r) setSaved(r.path)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the PDF. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[480px]">
        <DialogTitle>Export PDF</DialogTitle>
        <DialogDescription className="mt-1.5">
          Version {view.version} of your playbook, with a cover, the overview and all seven
          sections. The PDF is made on this computer.
        </DialogDescription>
        {saved ? (
          <>
            <p className="mt-5 text-sm break-all">Saved to {saved}</p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => void api.revealPdf()}>
                Show file
              </Button>
              <Button onClick={onClose}>Done</Button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-5 space-y-4 text-sm">
              <label className="flex items-center justify-between gap-4">
                <span className="font-medium">Paper size</span>
                <span className="w-[140px]">
                  <Select
                    value={pageSize}
                    onValueChange={(v) => setPageSize(v as PdfOptions['pageSize'])}
                  >
                    <SelectTrigger aria-label="Paper size" className="h-8 text-sm" />
                    <SelectContent>
                      <SelectItem value="A4">A4</SelectItem>
                      <SelectItem value="Letter">Letter</SelectItem>
                    </SelectContent>
                  </Select>
                </span>
              </label>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="accent-primary mt-1"
                  checked={includeGaps}
                  onChange={(e) => setIncludeGaps(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Include gaps</span>
                  <span className="text-muted-foreground block">
                    The gap to close in each section, and the biggest gap.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="accent-primary mt-1"
                  checked={includePrivate}
                  onChange={(e) => setIncludePrivate(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Include private material</span>
                  {view.private && (
                    <span className="text-muted-foreground block">
                      This playbook includes content from your own files. Turn this off before
                      sharing outside your company.
                    </span>
                  )}
                </span>
              </label>
            </div>
            {error && (
              <p role="alert" className="text-destructive mt-4 text-sm">
                {error}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={busy} onClick={() => void save()}>
                {busy ? 'Making the PDF...' : 'Save PDF'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

import { useEffect, useState } from 'react'
import type { ArticleSummary } from '@shared/wiki-views'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Markdown } from '@/components/Markdown'
import { api, ApiError, unwrap } from '@/lib/api'

interface Props {
  open: boolean
  onOpenChange(open: boolean): void
  /** Prefilled "what was decided", such as a chat reply. */
  decided?: string
  /** Articles ticked to start with, such as the playbook section's article. */
  affects?: string[]
  onRecorded?(path: string): void
}

/**
 * Record a positioning decision (REQUIREMENTS-v2 3.5, spec 6.4). The founder sees the article
 * before it is written; research then never contradicts it.
 */
export function RecordDecisionDialog({
  open,
  onOpenChange,
  decided = '',
  affects = [],
  onRecorded
}: Props) {
  const [title, setTitle] = useState('')
  const [what, setWhat] = useState(decided)
  const [why, setWhy] = useState('')
  const [picked, setPicked] = useState<string[]>(affects)
  const [articles, setArticles] = useState<ArticleSummary[]>([])
  const [preview, setPreview] = useState<string | null>(null)
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Fresh form each time it opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void unwrap(api.listArticles())
      .then((a) => {
        if (cancelled) return
        setArticles(
          a.filter((x) => !x.slug.startsWith('decision-') && x.slug !== 'company-profile')
        )
        setTitle('')
        setWhat(decided.slice(0, 4000))
        setWhy('')
        setPicked(affects)
        setPreview(null)
        setError(null)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the dialog opens
  }, [open])

  const input = { title: title.trim(), decided: what.trim(), why: why.trim(), affects: picked }
  const valid = input.title.length >= 3 && input.decided.length >= 3

  const showPreview = async (): Promise<void> => {
    setError(null)
    try {
      const p = await unwrap(api.previewDecision(input))
      setPreviewPath(p.path)
      setPreview(p.text.replace(/^---\n[\s\S]*?\n---\n\n?/, ''))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not preview. Please try again.')
    }
  }

  const record = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const r = await unwrap(api.recordDecision(input))
      onOpenChange(false)
      onRecorded?.(r.path)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record the decision.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-[620px] overflow-y-auto">
        <DialogTitle>Record a decision</DialogTitle>
        <DialogDescription className="mt-2">
          Decisions are saved in your wiki. Research reads them and never contradicts them.
        </DialogDescription>
        {preview === null ? (
          <div className="mt-5 space-y-4">
            <div>
              <Label htmlFor="decision-title">Short name</Label>
              <Input
                id="decision-title"
                className="mt-1.5"
                placeholder="Lead with forecast accuracy, not time saved"
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="decision-what">What was decided</Label>
              <Textarea
                id="decision-what"
                className="mt-1.5 min-h-[90px]"
                value={what}
                maxLength={4000}
                onChange={(e) => setWhat(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="decision-why">Why (optional)</Label>
              <Textarea
                id="decision-why"
                className="mt-1.5 min-h-[70px]"
                value={why}
                maxLength={4000}
                onChange={(e) => setWhy(e.target.value)}
              />
            </div>
            {articles.length > 0 && (
              <fieldset>
                <legend className="text-sm font-semibold">What it affects</legend>
                <div className="mt-2 grid max-h-[160px] grid-cols-2 gap-x-4 gap-y-1 overflow-y-auto">
                  {articles.map((a) => (
                    <label key={a.slug} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="accent-primary size-4"
                        checked={picked.includes(a.slug)}
                        onChange={(e) =>
                          setPicked((p) =>
                            e.target.checked
                              ? [...p, a.slug].slice(0, 12)
                              : p.filter((x) => x !== a.slug)
                          )
                        }
                      />
                      <span className="truncate">{a.title}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        ) : (
          <article className="bg-muted mt-5 rounded-xl border p-5 text-sm">
            {/* Links show as links; they open once the decision is recorded. */}
            <Markdown docPath={previewPath ?? undefined} onWikiLink={() => undefined}>
              {preview}
            </Markdown>
          </article>
        )}
        {error && (
          <p className="text-destructive mt-3 text-sm" role="alert">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          {preview === null ? (
            <>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button disabled={!valid} onClick={() => void showPreview()}>
                Preview
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setPreview(null)}>
                Edit
              </Button>
              <Button disabled={busy} onClick={() => void record()}>
                Record decision
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

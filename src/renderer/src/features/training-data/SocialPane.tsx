import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { parseSocialTable, type SocialRow } from '@shared/social'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, unwrap } from '@/lib/api'
import { DocHeader, FileActions } from '@/features/documents/DocParts'
import { docDate, useDoc } from '@/features/documents/useDoc'

const PATH = 'memory/research/social-taglines.md'

function Row({ row, onSaved }: { row: SocialRow; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = async (): Promise<void> => {
    try {
      await unwrap(api.setSocialTagline(row.network, text))
      setEditing(false)
      onSaved()
    } catch {
      setError('Could not save. Is the file still there?')
    }
  }
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold">{row.network}</p>
          {/^https?:/.test(row.url) && (
            <p className="text-muted-foreground truncate text-[13px]">{row.url}</p>
          )}
          <p className={row.found ? 'mt-1' : 'text-muted-foreground mt-1'}>
            {row.found ? `"${row.tagline}"` : 'Not found'}
          </p>
          {row.found && row.source && (
            <p className="text-muted-foreground text-[13px]">{row.source}</p>
          )}
        </div>
        {!row.found && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Paste it
          </Button>
        )}
      </div>
      {editing && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) void save()
          }}
        >
          <Input
            autoFocus
            aria-label={`${row.network} tagline or bio`}
            placeholder="Paste the headline, tagline or bio"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit" disabled={!text.trim()}>
            Save
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      )}
      {error && <p className="text-destructive mt-2 text-[13px]">{error}</p>}
    </li>
  )
}

/** The taglines table, with "Paste it" for profiles research could not read. */
export function SocialPane({ onRerun }: { onRerun: () => void }) {
  const { doc, reload } = useDoc(PATH)
  if (doc === undefined) return null
  const rows = doc ? parseSocialTable(doc.body) : []
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DocHeader
        title="Social taglines"
        subtitle={doc ? `Last updated ${docDate(doc)}` : 'Not written yet'}
      >
        <Button variant="ghost" size="sm" onClick={onRerun}>
          <RotateCcw strokeWidth={1.8} />
          Re-run
        </Button>
        {doc && <FileActions path={PATH} />}
      </DocHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[680px] px-6 py-6">
          {rows.length ? (
            <>
              <p className="text-muted-foreground text-sm">
                Social networks often block automated reading. Paste a missing tagline and it is
                saved in your workspace.
              </p>
              <ul className="mt-4 divide-y">
                {rows.map((r) => (
                  <Row key={r.network} row={r} onSaved={reload} />
                ))}
              </ul>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              {doc
                ? 'No profiles in this file yet.'
                : 'Research has not collected your social taglines yet.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

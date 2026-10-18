import { useState } from 'react'
import { Check, PencilLine, RefreshCw, X } from 'lucide-react'
import type { Change } from '@shared/changes'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api, ApiError, unwrap } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useChanges } from '@/store/changes'
import { formatDay } from '@/features/wiki/format'
import { MakeChangeDialog } from './MakeChangeDialog'

const STATUS: Record<Change['status'], { label: string; className: string }> = {
  pending: { label: 'Waiting', className: 'border-primary-light bg-accent text-primary' },
  applied: { label: 'Applied', className: 'border-primary-light bg-accent text-primary' },
  withdrawn: { label: 'Withdrawn', className: 'border-border bg-secondary text-muted-foreground' },
  replaced: { label: 'Replaced', className: 'border-border bg-secondary text-muted-foreground' }
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="text-[17px]">{title}</h3>
      <div className="mt-1.5 text-[15px] leading-7">{children}</div>
    </section>
  )
}

const PageLink = ({ slug, title }: { slug: string; title: string }) => (
  <button
    type="button"
    className="text-primary hover:text-primary-hover text-left underline underline-offset-2"
    onClick={() => void openPage(slug)}
  >
    {title}
  </button>
)

async function openPage(slug: string): Promise<void> {
  const page = await unwrap(api.changePage(slug)).catch(() => null)
  if (page) useApp.getState().openWikiFile(page.path)
}

/** One change in the reader (REQUIREMENTS-v3.1 3.6), with actions for its status. */
export function ChangeDetail({ path }: { path: string }) {
  const change = useChanges((s) => s.changes.find((c) => c.path === path))
  const [dialog, setDialog] = useState<'edit' | 'related' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!change)
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
        This change is no longer in the wiki.
      </div>
    )
  const c = change
  const status = STATUS[c.status]
  const withdraw = async (): Promise<void> => {
    setError(null)
    try {
      await unwrap(api.withdrawChange(c.id))
      await useChanges.getState().load()
      setConfirming(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not withdraw it. Please try again.')
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={status.className}>{status.label}</Badge>
          <span className="text-muted-foreground text-[13px]">
            {c.status === 'pending' ? 'Asked for' : status.label} on{' '}
            {formatDay(c.status === 'pending' ? c.created : c.statusDate)}
            {c.legacy && ' (recorded as a decision)'}
          </span>
        </div>
        <h2
          className={cn(
            'mt-2 text-[22px]',
            c.status !== 'pending' && c.status !== 'applied' && 'text-muted-foreground line-through'
          )}
        >
          {c.name}
        </h2>
        {c.page && (
          <p className="text-muted-foreground mt-1 text-sm">
            On <PageLink slug={c.page} title={c.pageTitle} />
            {c.section ? `, ${c.section}` : ', the whole page'}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {c.status === 'pending' ? (
            <>
              <Button size="sm" onClick={() => useApp.getState().openRegenerate(c.page)}>
                <RefreshCw strokeWidth={1.8} />
                Review and regenerate
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDialog('edit')}>
                <PencilLine strokeWidth={1.8} />
                Edit
              </Button>
              {!confirming ? (
                <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
                  <X strokeWidth={1.8} />
                  Withdraw
                </Button>
              ) : (
                <span className="flex items-center gap-2 text-sm">
                  Withdraw this change?
                  <Button variant="outline" size="sm" onClick={() => void withdraw()}>
                    Yes, withdraw
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                    Keep it
                  </Button>
                </span>
              )}
            </>
          ) : (
            c.page && (
              <Button variant="outline" size="sm" onClick={() => setDialog('related')}>
                <PencilLine strokeWidth={1.8} />
                Make a related change
              </Button>
            )
          )}
        </div>
        {error && (
          <p role="alert" className="text-destructive mt-2 text-sm">
            {error}
          </p>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <article className="mx-auto max-w-[760px] px-6 pb-10">
          <Block title="What to change">
            {c.pageTitle || 'No page'}, {c.section ?? 'the whole page'}
            {c.quote && (
              <blockquote className="border-primary-light text-muted-foreground mt-2 border-l-2 pl-3 italic">
                {c.quote}
              </blockquote>
            )}
          </Block>
          <Block title="Why">
            <p className="whitespace-pre-wrap">{c.why || 'No reason was given.'}</p>
          </Block>
          <Block title={c.legacy ? 'What was decided' : 'Change it to'}>
            <p className="whitespace-pre-wrap">{c.changeTo}</p>
          </Block>
          {c.basedOn.length > 0 && (
            <Block title="Based on">
              <ul className="space-y-1">
                {c.basedOn.map((b) => (
                  <li key={b.path}>
                    <button
                      type="button"
                      className="text-primary hover:text-primary-hover text-left underline underline-offset-2"
                      onClick={() => useApp.getState().openWikiFile(b.path)}
                    >
                      {b.title}
                    </button>
                  </li>
                ))}
              </ul>
            </Block>
          )}
          {c.affects.length > 0 && (
            <Block title="Also affects">
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {c.affects.map((a) => (
                  <li key={a.slug}>
                    <PageLink slug={a.slug} title={a.title} />
                  </li>
                ))}
              </ul>
            </Block>
          )}
          {c.status === 'applied' && !c.legacy && (
            <p className="text-muted-foreground mt-8 flex items-center gap-1.5 text-sm">
              <Check className="text-primary size-4" strokeWidth={2} />
              Every later regeneration keeps to this change.
            </p>
          )}
        </article>
      </div>
      {dialog && (
        <MakeChangeDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          pages={[c.page]}
          section={c.section}
          edit={dialog === 'edit' ? c : undefined}
        />
      )}
    </div>
  )
}

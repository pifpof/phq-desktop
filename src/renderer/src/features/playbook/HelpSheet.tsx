import { useState } from 'react'
import { Check, Copy, ExternalLink, LifeBuoy, X } from 'lucide-react'
import { helpDetails, helpRequestLink, type HelpItem } from '@shared/help'
import type { PlaybookSection } from '@shared/playbook'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { useApp } from '@/store/app'
import { useHelp } from '@/store/help'

/**
 * Get expert help and Add to my plan (REQUIREMENTS-v4 9). The gaps go to the hosted form in the
 * browser, prefilled; the app itself sends nothing.
 */

export const helpItemFor = (s: PlaybookSection): Omit<HelpItem, 'addedAt'> | null =>
  s.gap
    ? {
        id: `${s.id}:${s.gap.problem.slice(0, 60)}`,
        step: s.id,
        section: s.title,
        problem: s.gap.problem,
        nextStep: s.gap.nextStep,
        private: s.meta.private
      }
    : null

/** The two buttons in a gap box. */
export function GapActions({ section }: { section: PlaybookSection }) {
  const item = helpItemFor(section)
  const inPlan = useHelp((s) => !!item && s.plan.items.some((i) => i.id === item.id))
  if (!item) return null
  return (
    <>
      <Button size="sm" onClick={() => void useHelp.getState().add(item, { openSheet: true })}>
        <LifeBuoy strokeWidth={1.8} />
        Get expert help with this
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={inPlan}
        onClick={() => void useHelp.getState().add(item)}
      >
        {inPlan ? <Check strokeWidth={2} /> : null}
        {inPlan ? 'In your plan' : 'Add to my plan'}
      </Button>
    </>
  )
}

/** The header chip: "Help plan 2". */
export function HelpChip() {
  const count = useHelp((s) => s.plan.items.length)
  if (!count) return null
  return (
    <button
      type="button"
      onClick={() => useHelp.getState().setOpen(true)}
      className="border-primary-light bg-accent text-primary focus-visible:ring-ring/50 h-8 rounded-full border px-3 text-[13px] font-semibold outline-none hover:bg-white focus-visible:ring-[3px]"
    >
      Help plan {count}
    </button>
  )
}

export function HelpSheet({ company }: { company: string }) {
  const { plan, open, selected } = useHelp()
  const name = useApp((s) => s.profile?.user.name ?? '')
  const [copied, setCopied] = useState(false)
  const chosen = plan.items.filter((i) => selected.has(i.id))
  const link = helpRequestLink({ company, name, email: '', items: chosen })

  const ask = async (): Promise<void> => {
    await api.openExternal(link.url)
    await api.markHelpRequested()
    await useHelp.getState().load()
  }
  const copy = (): void => {
    void navigator.clipboard.writeText(helpDetails(chosen)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => useHelp.getState().setOpen(o)}>
      <DialogContent className="max-w-[560px] gap-0 p-0">
        <div className="border-b px-6 pt-6 pb-4">
          <DialogTitle>Help plan</DialogTitle>
          <DialogDescription className="mt-1.5">
            The gaps you want help with. Ask for help opens a short form on positioninghq.com in
            your browser, filled in with your company, your name and these gaps. Nothing is sent
            until you submit it there.
          </DialogDescription>
        </div>
        <div className="max-h-[50vh] overflow-y-auto px-6 py-4">
          {plan.items.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing here yet. Choose Add to my plan on a gap to close.
            </p>
          ) : (
            <ul className="space-y-3">
              {plan.items.map((i) => (
                <li key={i.id} className="flex items-start gap-3 rounded-xl border px-4 py-3">
                  <input
                    type="checkbox"
                    className="accent-primary mt-1"
                    checked={selected.has(i.id)}
                    onChange={() => useHelp.getState().toggle(i.id)}
                    aria-label={`Include ${i.section}`}
                  />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-semibold">{i.section}</p>
                    <p className="mt-1">{i.problem}</p>
                    {i.nextStep && (
                      <p className="text-muted-foreground mt-1">Next step: {i.nextStep}</p>
                    )}
                    {i.private && (
                      <p className="text-muted-foreground mt-1 text-[13px]">
                        From your own files, so only the section name goes in the form.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${i.section}`}
                    onClick={() => void useHelp.getState().remove(i.id)}
                    className="text-muted-foreground hover:text-foreground rounded-[8px] p-1"
                  >
                    <X className="size-4" strokeWidth={1.8} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {link.short && chosen.length > 0 && (
            <p className="text-muted-foreground mt-4 text-sm">
              There is too much to fill in the form, so it gets the section names only. Copy the
              details and paste them into the form.
            </p>
          )}
          {plan.helpRequested.length > 0 && (
            <p className="text-muted-foreground mt-4 text-[13px]">
              You last asked for help on{' '}
              {new Date(plan.helpRequested.at(-1)!).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
              })}
              .
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-3 border-t px-6 py-4">
          {link.short && (
            <Button variant="outline" disabled={!chosen.length} onClick={copy}>
              {copied ? <Check strokeWidth={2} /> : <Copy strokeWidth={1.8} />}
              {copied ? 'Copied' : 'Copy details'}
            </Button>
          )}
          <Button disabled={!chosen.length} onClick={() => void ask()}>
            Ask for help with these
            <ExternalLink strokeWidth={1.8} />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

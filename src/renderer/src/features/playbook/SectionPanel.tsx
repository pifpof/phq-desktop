import { useState } from 'react'
import { Check, Copy, MessageSquare, PencilLine } from 'lucide-react'
import type { PlaybookSection, PlaybookView } from '@shared/playbook'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { useChat } from '@/store/chat'
import { formatDay } from '@/features/wiki/format'
import { MakeChangeDialog } from '@/features/changes/MakeChangeDialog'

/**
 * The right panel (REQUIREMENTS-v4 6.2): This section (confidence, sources, last changed, changes
 * waiting, Open in Wiki, Make a change) and Use it (copy the section, ask Chat about it).
 */

const CONFIDENCE = { high: 'High', medium: 'Medium', low: 'Low' } as const

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}

const link =
  'text-primary hover:text-primary-hover font-medium underline-offset-2 hover:underline focus-visible:underline outline-none'

export function SectionPanel({ view, section }: { view: PlaybookView; section: PlaybookSection }) {
  const m = section.meta
  const [changing, setChanging] = useState(false)
  const [copied, setCopied] = useState(false)
  const open = useApp.getState()
  const articleTitle = section.id === 'advantages' ? 'Distinct Advantages' : section.title

  const copy = (): void => {
    void navigator.clipboard
      .writeText(section.markdown)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => undefined)
  }

  return (
    <aside
      aria-label="About this section"
      className="flex w-full shrink-0 flex-col gap-4 min-[1100px]:sticky min-[1100px]:top-0 min-[1100px]:w-[260px]"
    >
      <section className="rounded-xl border bg-white px-4 py-3">
        <h3 className="eyebrow text-[12px]">This section</h3>
        <dl className="mt-1.5 divide-y">
          <Row label="Confidence">
            {m.confidence ? (
              <span className={cn(m.confidence === 'low' && 'text-warning')}>
                {CONFIDENCE[m.confidence]}
              </span>
            ) : (
              <span className="text-muted-foreground">Not set</span>
            )}
          </Row>
          <Row label="Sources">
            {m.sources.length ? (
              <button
                type="button"
                className={link}
                title="Show these sources in the wiki"
                onClick={() =>
                  useApp.setState({
                    homeView: 'wiki',
                    wikiTarget: {
                      tab: 'sources',
                      path: '',
                      sources: { label: articleTitle, paths: m.sources }
                    }
                  })
                }
              >
                {m.sources.length}
              </button>
            ) : (
              '0'
            )}
          </Row>
          <Row label="Last changed">{m.lastChanged ? formatDay(m.lastChanged) : 'Unknown'}</Row>
          {m.waiting > 0 && (
            <Row label="Changes waiting">
              <button
                type="button"
                className={link}
                onClick={() => {
                  const slug = m.pages[0]
                  if (!slug) return
                  useApp.setState({
                    homeView: 'wiki',
                    wikiTarget: { tab: 'changes', path: '', page: { slug, title: articleTitle } }
                  })
                }}
              >
                {m.waiting} waiting
              </button>
            </Row>
          )}
        </dl>
        <div className="mt-3 flex flex-col items-start gap-2">
          {m.article && (
            <button
              type="button"
              className={cn(link, 'text-sm')}
              onClick={() => open.openWikiFile(m.article!)}
            >
              Open in Wiki
            </button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={!view.current || !m.pages.length}
            title={view.current ? undefined : 'Switch to the current version to make a change'}
            onClick={() => setChanging(true)}
          >
            <PencilLine strokeWidth={1.8} />
            Make a change
          </Button>
        </div>
      </section>

      <section className="rounded-xl border bg-white px-4 py-3">
        <h3 className="eyebrow text-[12px]">Use it</h3>
        <div className="mt-2 flex flex-col items-start gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2"
            disabled={!section.markdown}
            onClick={copy}
          >
            {copied ? <Check strokeWidth={2} /> : <Copy strokeWidth={1.8} />}
            {copied ? 'Copied' : 'Copy this section'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2"
            disabled={!m.articles.length}
            onClick={() => {
              useChat.getState().startAbout(section.title, m.articles)
              open.setHomeView('chat')
            }}
          >
            <MessageSquare strokeWidth={1.8} />
            Ask Chat about it
          </Button>
        </div>
      </section>

      {changing && (
        <MakeChangeDialog open onOpenChange={(o) => !o && setChanging(false)} pages={m.pages} />
      )}
    </aside>
  )
}

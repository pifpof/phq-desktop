import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ChevronDown, CircleAlert, Copy } from 'lucide-react'
import type { Card, PlaybookSection as Section, PlaybookView, Statement } from '@shared/playbook'
import { Markdown } from '@/components/Markdown'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { SectionPanel } from './SectionPanel'
import type { StepKey } from './StepTabs'

/**
 * One playbook section (REQUIREMENTS-v4 6.1): step and reading time, title, key takeaways, lede,
 * body (cards for drivers, moats and competitors; the statement as a table), the gap to close,
 * then Back and Next. The right panel sits beside it, or below under 1100px.
 */

const NUMBERED = new Set(['value', 'advantages'])

function useCopied(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false)
  const copy = (text: string): void => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => undefined)
  }
  return [copied, copy]
}

function Takeaways({ items }: { items: string[] }) {
  return (
    <section aria-label="Key takeaways" className="bg-accent mt-6 rounded-xl px-5 py-4">
      <h3 className="eyebrow text-[12px]">Key takeaways</h3>
      <ol className="mt-2 space-y-1.5">
        {items.map((t, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-6">
            <span className="text-primary font-serif font-bold">{i + 1}.</span>
            <span>{t}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function ExpandableCard({
  card,
  index,
  numbered,
  open,
  onToggle
}: {
  card: Card
  index: number
  numbered: boolean
  open: boolean
  onToggle: () => void
}) {
  const ref = useRef<HTMLLIElement>(null)
  const bodyId = `card-${card.id}`
  return (
    <li
      ref={ref}
      id={card.slug ? `driver-${card.slug}` : undefined}
      className="rounded-xl border bg-white"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
        className="focus-visible:ring-ring/50 flex w-full items-start gap-4 rounded-xl px-5 py-4 text-left outline-none focus-visible:ring-[3px]"
      >
        {numbered && (
          <span className="text-primary-light w-9 shrink-0 font-serif text-[26px] leading-none font-bold">
            {String(index + 1).padStart(2, '0')}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{card.title}</span>
          {card.line && (
            <span
              className={cn(
                'text-muted-foreground mt-0.5 block text-[14px]',
                !open && 'line-clamp-2'
              )}
            >
              {card.line}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            'text-muted-foreground mt-1 size-4 shrink-0 motion-safe:transition-transform',
            open && 'rotate-180'
          )}
          strokeWidth={2}
        />
      </button>
      {open && (
        <div id={bodyId} className="border-t px-5 py-4 text-[15px]">
          <Markdown>{card.body}</Markdown>
        </div>
      )}
    </li>
  )
}

function Cards({ section, focusCard }: { section: Section; focusCard?: string }) {
  const first = section.id === 'value' ? section.cards[0]?.id : undefined
  const focused = section.cards.find((c) => c.slug && c.slug === focusCard)?.id
  const [open, setOpen] = useState<Set<string>>(
    () => new Set([focused ?? first].filter((x): x is string => !!x))
  )
  useEffect(() => {
    if (!focusCard) return
    document.getElementById(`driver-${focusCard}`)?.scrollIntoView({ block: 'start' })
  }, [focusCard])
  if (!section.cards.length) return null
  return (
    <ul className="mt-6 space-y-3">
      {section.cards.map((c, i) => (
        <ExpandableCard
          key={c.id}
          card={c}
          index={i}
          numbered={NUMBERED.has(section.id)}
          open={open.has(c.id)}
          onToggle={() =>
            setOpen((cur) => {
              const next = new Set(cur)
              if (next.has(c.id)) next.delete(c.id)
              else next.add(c.id)
              return next
            })
          }
        />
      ))}
    </ul>
  )
}

function Variation({ v }: { v: Statement['variations'][number] }) {
  const [copied, copy] = useCopied()
  return (
    <li className="rounded-xl border bg-white px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-semibold">{v.title}</h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => copy(v.body)}
          aria-label={`Copy ${v.title}`}
        >
          {copied ? <Check strokeWidth={2} /> : <Copy strokeWidth={1.8} />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <div className="mt-2 text-[15px]">
        <Markdown>{v.body}</Markdown>
      </div>
    </li>
  )
}

function StatementView({ statement }: { statement: Statement }) {
  return (
    <>
      {statement.fields.length > 0 && (
        <dl className="mt-6 grid grid-cols-[minmax(120px,200px)_1fr] overflow-hidden rounded-xl border text-[15px]">
          {statement.fields.map(([k, v], i) => (
            <div key={i} className="contents">
              <dt className={cn('bg-secondary px-4 py-3 font-semibold', i > 0 && 'border-t')}>
                {k}
              </dt>
              <dd className={cn('px-4 py-3', i > 0 && 'border-t')}>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {statement.variations.length > 0 && (
        <>
          <h3 className="mt-8 font-serif text-[20px] font-bold">Message variations</h3>
          <ul className="mt-3 space-y-3">
            {statement.variations.map((v, i) => (
              <Variation key={i} v={v} />
            ))}
          </ul>
        </>
      )}
    </>
  )
}

export function GapBox({
  section,
  view,
  focus,
  actions
}: {
  section: Section
  view: PlaybookView
  focus?: boolean
  actions?: React.ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (focus) ref.current?.scrollIntoView({ block: 'center' })
  }, [focus])
  const gap = section.gap
  if (!gap) return null
  const chip = section.meta.scoreChip
  return (
    <section
      ref={ref}
      id={`gap-${section.id}`}
      aria-labelledby={`gap-title-${section.id}`}
      className={cn(
        'bg-warning-bg border-warning-border mt-8 rounded-xl border px-5 py-4',
        focus && 'ring-warning/30 ring-[3px]'
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          id={`gap-title-${section.id}`}
          className="text-warning flex items-center gap-1.5 font-sans text-[12px] font-semibold tracking-[0.08em] uppercase"
        >
          <CircleAlert className="size-3.5" strokeWidth={2.4} />
          Gap to close
        </h3>
        {chip && view.current && (
          <button
            type="button"
            onClick={() => useApp.getState().setHomeView('messaging')}
            className="text-warning border-warning-border rounded-full border bg-white/40 px-2.5 py-0.5 text-[12px] font-medium hover:bg-white/60"
          >
            Messaging score: {chip.dimension} {chip.score} of {chip.max}
          </button>
        )}
      </div>
      <p className="mt-2 text-[15px]">
        <span className="font-semibold">Problem: </span>
        {gap.problem}
      </p>
      <p className="mt-1.5 text-[15px]">
        <span className="font-semibold">Next step: </span>
        {gap.nextStep}
      </p>
      {actions && <div className="mt-4 flex flex-wrap gap-3">{actions}</div>}
    </section>
  )
}

export function PlaybookSection({
  view,
  section,
  focus,
  onGo,
  onGenerate,
  gapActions
}: {
  view: PlaybookView
  section: Section
  focus: { card?: string; gap?: boolean } | null
  onGo: (step: StepKey) => void
  onGenerate: () => void
  gapActions?: (section: Section) => React.ReactNode
}) {
  const i = view.sections.findIndex((s) => s.id === section.id)
  const prev = i > 0 ? view.sections[i - 1] : null
  const next = view.sections[i + 1] ?? null
  return (
    <div className="flex flex-col gap-8 min-[1100px]:flex-row min-[1100px]:items-start">
      <article className="max-w-[760px] min-w-0 flex-1">
        <p className="eyebrow text-[12px]">
          Step {section.n} of {view.sections.length}
          {!section.missing && ` · about ${section.minutes} min read`}
        </p>
        <h2 className="mt-2 font-serif text-[32px] leading-tight font-bold">{section.title}</h2>
        {section.missing ? (
          <div className="mt-6 rounded-xl border border-dashed px-5 py-6">
            <p className="text-muted-foreground text-sm">
              {view.preview ? 'Still writing.' : 'Not generated yet.'}
            </p>
            {view.current && !view.preview && (
              <Button variant="outline" size="sm" className="mt-3" onClick={onGenerate}>
                Generate
              </Button>
            )}
          </div>
        ) : (
          <>
            {section.takeaways && <Takeaways items={section.takeaways} />}
            {section.lede && (
              <p className="text-muted-foreground mt-6 text-[17px] leading-7">{section.lede}</p>
            )}
            {section.body && (
              <div className="mt-6 text-[15px]">
                <Markdown>{section.body}</Markdown>
              </div>
            )}
            {section.statement && <StatementView statement={section.statement} />}
            {section.after && (
              <div className="mt-6 text-[15px]">
                <Markdown>{section.after}</Markdown>
              </div>
            )}
            <Cards key={focus?.card ?? 'cards'} section={section} focusCard={focus?.card} />
            <GapBox
              section={section}
              view={view}
              focus={focus?.gap}
              actions={gapActions?.(section)}
            />
          </>
        )}
        <nav
          aria-label="Steps"
          className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t pt-6"
        >
          <Button variant="outline" onClick={() => onGo(prev ? prev.id : 'overview')}>
            <ArrowLeft strokeWidth={2} />
            Back
          </Button>
          <Button onClick={() => onGo(next ? next.id : 'overview')}>
            {next ? `Next: ${next.title}` : 'Back to overview'}
            <ArrowRight strokeWidth={2} />
          </Button>
        </nav>
      </article>
      <SectionPanel view={view} section={section} />
    </div>
  )
}

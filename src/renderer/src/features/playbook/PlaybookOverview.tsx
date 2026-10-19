import { ArrowRight, CircleAlert } from 'lucide-react'
import type { PlaybookView, StepId } from '@shared/playbook'
import { Button } from '@/components/ui/button'

/**
 * At a glance (REQUIREMENTS-v4 5): a one-screen summary from front matter, with no model call.
 * Missing pieces say so; the overview never invents text.
 */

function Missing({ onGenerate, disabled }: { onGenerate: () => void; disabled: boolean }) {
  return (
    <p className="text-muted-foreground text-sm">
      Not generated yet.{' '}
      {!disabled && (
        <button
          type="button"
          onClick={onGenerate}
          className="text-primary hover:text-primary-hover font-medium underline underline-offset-2"
        >
          Generate
        </button>
      )}
    </p>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <h3 className="eyebrow text-[12px]">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}

export function PlaybookOverview({
  view,
  onGo,
  onGenerate,
  canGenerate
}: {
  view: PlaybookView
  onGo: (step: StepId, opts?: { card?: string; gap?: boolean }) => void
  onGenerate: () => void
  canGenerate: boolean
}) {
  const o = view.overview
  const missing = <Missing onGenerate={onGenerate} disabled={!canGenerate} />
  const gapSection = o.biggestGap
    ? view.sections.find((s) => s.id === o.biggestGap!.step)
    : undefined
  return (
    <div className="max-w-[760px]">
      <p className="eyebrow text-[12px]">At a glance</p>
      <h2 className="mt-2 font-serif text-[32px] leading-tight font-bold">{view.company}</h2>

      <section
        aria-label="Positioning statement"
        className="bg-accent border-primary-light/30 mt-6 rounded-2xl border px-6 py-5"
      >
        <h3 className="eyebrow text-[12px]">Positioning statement</h3>
        {o.statement ? (
          <p
            className="mt-2 line-clamp-4 font-serif text-[22px] leading-snug font-bold"
            title={o.statement}
          >
            {o.statement}
          </p>
        ) : (
          <div className="mt-2">{missing}</div>
        )}
      </section>

      <section aria-label="Value drivers" className="mt-6">
        <h3 className="eyebrow text-[12px]">Value drivers</h3>
        {o.drivers.length ? (
          <ul className="mt-2 grid gap-3 sm:grid-cols-3">
            {o.drivers.map((d, i) => (
              <li key={d.slug}>
                <button
                  type="button"
                  onClick={() => onGo('value', { card: d.slug })}
                  className="hover:border-primary-light focus-visible:ring-ring/50 flex h-full w-full flex-col rounded-xl border bg-white px-4 py-3 text-left outline-none focus-visible:ring-[3px]"
                >
                  <span className="text-primary-light font-serif text-[28px] leading-none font-bold">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="mt-2 font-semibold">{d.title}</span>
                  {d.line && (
                    <span
                      className="text-muted-foreground mt-1 line-clamp-2 text-[13px]"
                      title={d.line}
                    >
                      {d.line}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-2">{missing}</div>
        )}
      </section>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <Block title="Who it's for">
          {o.whoFor ? (
            <p className="line-clamp-3 text-[15px]" title={o.whoFor}>
              {o.whoFor}
            </p>
          ) : (
            missing
          )}
        </Block>
        <Block title="Up against">
          {o.upAgainst ? (
            <p className="line-clamp-3 text-[15px]" title={o.upAgainst}>
              {o.upAgainst}
            </p>
          ) : (
            missing
          )}
        </Block>
      </div>

      {o.biggestGap && gapSection && (
        <section
          aria-label="Biggest gap"
          className="bg-warning-bg border-warning-border mt-6 rounded-xl border px-5 py-4"
        >
          <h3 className="text-warning flex font-sans items-center gap-1.5 text-[12px] font-semibold tracking-[0.08em] uppercase">
            <CircleAlert className="size-3.5" strokeWidth={2.4} />
            Biggest gap: {gapSection.title}
          </h3>
          <p className="mt-1.5 text-[15px]">{o.biggestGap.problem}</p>
          <button
            type="button"
            onClick={() => onGo(o.biggestGap!.step, { gap: true })}
            className="text-primary hover:text-primary-hover mt-2 inline-flex items-center gap-1 text-sm font-medium"
          >
            See how to close it
            <ArrowRight className="size-3.5" strokeWidth={2} />
          </button>
        </section>
      )}

      <Button className="mt-8" onClick={() => onGo('market')}>
        Start with the market
        <ArrowRight strokeWidth={2} />
      </Button>
    </div>
  )
}

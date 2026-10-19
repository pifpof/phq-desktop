import { useEffect, useState } from 'react'
import { links } from '@shared/links'
import {
  type PdfOptions,
  type PlaybookSection,
  type PlaybookView,
  type StepId
} from '@shared/playbook'
import { Markdown } from '@/components/Markdown'
import { api, unwrap } from '@/lib/api'
import { formatDay } from '@/features/wiki/format'

/**
 * The PDF print view (REQUIREMENTS-v4 8): cover, At a glance, contents, then every section with
 * takeaways and gap boxes, cards printed open, a page break before each section. Loaded by a
 * hidden window in main, which prints it once this view says it is ready.
 */

const SITE = 'positioninghq.com'

function Omitted() {
  return <p className="text-muted-foreground mt-4 text-[11pt] italic">Private section omitted.</p>
}

function Section({ s, o }: { s: PlaybookSection; o: PdfOptions }) {
  const hidden = !o.includePrivate && s.meta.private
  return (
    <section className="print-section break-before-page" id={`s-${s.id}`}>
      <p className="eyebrow text-[9pt]">Section {s.n} of 7</p>
      <h2 className="mt-1 font-serif text-[24pt] leading-tight font-bold">{s.title}</h2>
      {hidden ? (
        <Omitted />
      ) : s.missing ? (
        <p className="text-muted-foreground mt-4 text-[11pt]">Not generated yet.</p>
      ) : (
        <div className="text-[10.5pt] leading-relaxed">
          {s.takeaways && (
            <div className="bg-accent mt-4 break-inside-avoid rounded-xl px-5 py-3">
              <p className="eyebrow text-[8.5pt]">Key takeaways</p>
              <ol className="mt-1.5 list-decimal space-y-1 pl-5">
                {s.takeaways.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ol>
            </div>
          )}
          {s.lede && <p className="text-muted-foreground mt-4 text-[12pt]">{s.lede}</p>}
          {s.body && (
            <div className="mt-3">
              <Markdown>{s.body}</Markdown>
            </div>
          )}
          {s.statement && (
            <>
              {s.statement.fields.length > 0 && (
                <table className="mt-4 w-full border-collapse text-[10pt]">
                  <tbody>
                    {s.statement.fields.map(([k, v], i) => (
                      <tr key={i} className="break-inside-avoid border-b">
                        <th className="bg-secondary w-[30%] px-3 py-2 text-left align-top font-semibold">
                          {k}
                        </th>
                        <td className="px-3 py-2 align-top">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {s.statement.variations.map((v, i) => (
                <div key={i} className="mt-4 break-inside-avoid rounded-xl border px-4 py-3">
                  <p className="font-semibold">{v.title}</p>
                  <div className="mt-1">
                    <Markdown>{v.body}</Markdown>
                  </div>
                </div>
              ))}
            </>
          )}
          {s.after && (
            <div className="mt-3">
              <Markdown>{s.after}</Markdown>
            </div>
          )}
          {s.cards.map((c, i) => (
            <div key={c.id} className="mt-4 rounded-xl border px-4 py-3">
              <p className="font-semibold">
                {s.id === 'value' || s.id === 'advantages' ? (
                  <span className="text-primary mr-2 font-serif">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                ) : null}
                {c.title}
              </p>
              {c.line && <p className="text-muted-foreground mt-0.5">{c.line}</p>}
              <div className="mt-2">
                <Markdown>{c.body}</Markdown>
              </div>
            </div>
          ))}
          {o.includeGaps && s.gap && (
            <div className="bg-warning-bg border-warning-border mt-5 break-inside-avoid rounded-xl border px-5 py-3">
              <p className="text-warning text-[8.5pt] font-semibold tracking-[0.08em] uppercase">
                Gap to close
              </p>
              <p className="mt-1">
                <strong>Problem: </strong>
                {s.gap.problem}
              </p>
              <p className="mt-1">
                <strong>Next step: </strong>
                {s.gap.nextStep}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export function PlaybookPrint({ options }: { options: PdfOptions }) {
  const [view, setView] = useState<PlaybookView | null>(null)
  useEffect(() => {
    // The app shell keeps the page to one screen; a printout needs the whole document.
    document.documentElement.classList.add('printing')
    void unwrap(api.playbookView(options.path))
      .catch(() => null)
      .then(setView)
  }, [options.path])
  useEffect(() => {
    if (!view) return
    // Fonts first, then two frames so layout settles, then tell main to print.
    void document.fonts.ready.then(() =>
      requestAnimationFrame(() => requestAnimationFrame(() => void api.printReady()))
    )
  }, [view])
  if (!view) return null

  const privateStep = (id: StepId): boolean =>
    !options.includePrivate && !!view.sections.find((s) => s.id === id)?.meta.private
  const o = view.overview
  const gapStep = o.biggestGap && !privateStep(o.biggestGap.step) ? o.biggestGap : null
  const gapTitle = gapStep ? view.sections.find((s) => s.id === gapStep.step)?.title : null

  return (
    <div className="print-root text-foreground bg-white font-sans">
      <section className="flex min-h-[9in] flex-col justify-between">
        <div>
          <p className="eyebrow text-[10pt]">Positioning Playbook</p>
          <h1 className="mt-4 font-serif text-[40pt] leading-tight font-bold">{view.company}</h1>
          <p className="text-muted-foreground mt-3 text-[12pt]">
            Version {view.version} · {formatDay(view.date)} · Draft
          </p>
        </div>
        <p className="text-muted-foreground text-[10pt]">
          Generated with PositioningHQ ·{' '}
          <a href={links.pdfSiteUrl} className="text-primary no-underline">
            {SITE}
          </a>
        </p>
      </section>

      <section className="break-before-page">
        <p className="eyebrow text-[9pt]">At a glance</p>
        <div className="bg-accent mt-3 rounded-2xl px-6 py-4">
          <p className="eyebrow text-[8.5pt]">Positioning statement</p>
          <p className="mt-1 font-serif text-[13pt] leading-snug font-bold">
            {privateStep('positioning')
              ? 'Private section omitted.'
              : (o.statement ?? 'Not generated yet.')}
          </p>
        </div>
        {privateStep('value') && (
          <p className="text-muted-foreground mt-4 text-[10.5pt] italic">
            Value drivers: private section omitted.
          </p>
        )}
        {!privateStep('value') && o.drivers.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            {o.drivers.map((d, i) => (
              <div key={d.slug} className="rounded-xl border px-3 py-2 text-[10pt]">
                <p className="text-primary-light font-serif text-[18pt] leading-none font-bold">
                  {String(i + 1).padStart(2, '0')}
                </p>
                <p className="mt-1 font-semibold">{d.title}</p>
                <p className="text-muted-foreground mt-0.5">{d.line}</p>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 grid grid-cols-2 gap-4 text-[10.5pt]">
          <div>
            <p className="eyebrow text-[8.5pt]">Who it&apos;s for</p>
            <p className="mt-1">
              {privateStep('customers')
                ? 'Private section omitted.'
                : (o.whoFor ?? 'Not generated yet.')}
            </p>
          </div>
          <div>
            <p className="eyebrow text-[8.5pt]">Up against</p>
            <p className="mt-1">
              {privateStep('competitors')
                ? 'Private section omitted.'
                : (o.upAgainst ?? 'Not generated yet.')}
            </p>
          </div>
        </div>
        {options.includeGaps && gapStep && (
          <div className="bg-warning-bg border-warning-border mt-4 rounded-xl border px-5 py-3 text-[10.5pt]">
            <p className="text-warning text-[8.5pt] font-semibold tracking-[0.08em] uppercase">
              Biggest gap: {gapTitle}
            </p>
            <p className="mt-1">{gapStep.problem}</p>
          </div>
        )}

        <h2 className="break-before-page font-serif text-[20pt] font-bold">Contents</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-6 text-[11pt]">
          {view.sections.map((s) => (
            <li key={s.id}>
              <a href={`#s-${s.id}`} className="text-foreground no-underline">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </section>

      {view.sections.map((s) => (
        <Section key={s.id} s={s} o={options} />
      ))}
    </div>
  )
}

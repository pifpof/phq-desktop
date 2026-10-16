import { memo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { isAllowedExternalUrl } from '@shared/links'
import { openExternal } from '@/lib/api'

const components: Components = {
  h1: (p) => <h1 className="mt-6 mb-2 text-[22px] leading-tight first:mt-0" {...strip(p)} />,
  h2: (p) => <h2 className="mt-5 mb-2 text-xl leading-tight first:mt-0" {...strip(p)} />,
  h3: (p) => <h3 className="mt-4 mb-1.5 text-[17px] leading-snug first:mt-0" {...strip(p)} />,
  p: (p) => <p className="my-3 first:mt-0 last:mb-0" {...strip(p)} />,
  ul: (p) => <ul className="my-3 list-disc space-y-1 pl-6" {...strip(p)} />,
  ol: (p) => <ol className="my-3 list-decimal space-y-1 pl-6" {...strip(p)} />,
  blockquote: (p) => (
    <blockquote
      className="border-primary-light text-muted-foreground my-3 border-l-2 pl-4"
      {...strip(p)}
    />
  ),
  hr: () => <hr className="my-5" />,
  a: ({ href, children }) => {
    // Links never navigate inside the app. Only allowlisted https links open, in the browser.
    if (href && isAllowedExternalUrl(href)) {
      return (
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault()
            openExternal(href)
          }}
          className="text-primary hover:text-primary-hover underline underline-offset-2"
        >
          {children}
        </a>
      )
    }
    return (
      <span>
        {children}
        {href ? <span className="text-muted-foreground"> ({href})</span> : null}
      </span>
    )
  },
  pre: (p) => (
    <pre
      className="bg-secondary my-3 overflow-x-auto rounded-[10px] p-4 font-mono text-[13px] leading-relaxed"
      {...strip(p)}
    />
  ),
  code: ({ className, children, ...rest }) => (
    <code
      className={
        className
          ? `${className} font-mono`
          : 'bg-secondary rounded-md px-1.5 py-0.5 font-mono text-[0.9em]'
      }
      {...strip(rest)}
    >
      {children}
    </code>
  ),
  table: (p) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...strip(p)} />
    </div>
  ),
  th: (p) => <th className="bg-muted border px-3 py-2 text-left font-semibold" {...strip(p)} />,
  td: (p) => <td className="border px-3 py-2 align-top" {...strip(p)} />
}

/** react-markdown passes `node`, which must not reach the DOM. */
function strip<T extends { node?: unknown }>(props: T): Omit<T, 'node'> {
  const { node: _node, ...rest } = props
  void _node
  return rest
}

export const Markdown = memo(function Markdown({ children }: { children: string }) {
  // No rehype-raw: raw HTML in model output is shown as text, never rendered.
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  )
})

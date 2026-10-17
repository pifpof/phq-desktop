import { Children, isValidElement, memo, useMemo, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { anchor } from '@shared/anchor'
import { isAllowedExternalUrl } from '@shared/links'
import { openExternal } from '@/lib/api'

/** Plain text of rendered children, for heading anchors. */
function textOf(children: ReactNode): string {
  return Children.toArray(children)
    .map((c) =>
      typeof c === 'string' || typeof c === 'number'
        ? String(c)
        : isValidElement<{ children?: ReactNode }>(c)
          ? textOf(c.props.children)
          : ''
    )
    .join('')
}

/** Resolves a relative link against the wiki path of the document it is in. */
export function resolveWikiPath(from: string, href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('/')) return null
  let target = href.replace(/^<|>$/g, '').split('#')[0]
  try {
    target = decodeURI(target)
  } catch {
    /* as written */
  }
  if (!target.endsWith('.md')) return null
  const parts = from.split('/').slice(0, -1)
  for (const seg of target.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (!parts.length) return null
      parts.pop()
    } else parts.push(seg)
  }
  return parts.join('/')
}

/**
 * Two-form links (`[[slug|Title]] ([Title](path.md))`, spec 6.6) are shown once, as their
 * markdown half. A bare wikilink becomes its title.
 */
export const showWikiLinks = (md: string): string =>
  md
    .replace(/\[\[[^\]|]+(?:\|[^\]]*)?\]\]\s*\((\[[^\]]*\]\((?:<[^>\n]+>|[^)\n]+)\))\)/g, '$1')
    .replace(/\[\[[^\]|]+\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')

function makeComponents(
  sources: string[] | undefined,
  onSource: ((url: string) => void) | undefined,
  docPath?: string,
  onWikiLink?: (path: string) => void
): Components {
  return {
    h1: (p) => (
      <h1
        id={anchor(textOf(p.children))}
        className="mt-6 mb-2 scroll-mt-4 text-[22px] leading-tight first:mt-0"
        {...strip(p)}
      />
    ),
    h2: (p) => (
      <h2
        id={anchor(textOf(p.children))}
        className="mt-5 mb-2 scroll-mt-4 text-xl leading-tight first:mt-0"
        {...strip(p)}
      />
    ),
    h3: (p) => (
      <h3
        id={anchor(textOf(p.children))}
        className="mt-4 mb-1.5 scroll-mt-4 text-[17px] leading-snug first:mt-0"
        {...strip(p)}
      />
    ),
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
      // Links within the document (a table of contents) scroll to the heading.
      if (href?.startsWith('#')) {
        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault()
              document
                .getElementById(decodeURIComponent(href.slice(1)))
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            className="text-primary hover:text-primary-hover underline underline-offset-2"
          >
            {children}
          </a>
        )
      }
      // A link to another file in the wiki opens it in the app.
      const wiki = href && docPath && onWikiLink ? resolveWikiPath(docPath, href) : null
      if (wiki) {
        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault()
              onWikiLink!(wiki)
            }}
            className="text-primary hover:text-primary-hover underline underline-offset-2"
          >
            {children}
          </a>
        )
      }
      // Links never navigate inside the app. Allowlisted https links open in the browser, and so do a
      // research document's own sources (after the person agrees once).
      const isSource = !!href && !!sources?.includes(href) && !!onSource
      if (href && (isAllowedExternalUrl(href) || isSource)) {
        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault()
              if (isSource && !isAllowedExternalUrl(href)) onSource!(href)
              else openExternal(href)
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
}

/** react-markdown passes `node`, which must not reach the DOM. */
function strip<T extends { node?: unknown }>(props: T): Omit<T, 'node'> {
  const { node: _node, ...rest } = props
  void _node
  return rest
}

interface MarkdownProps {
  children: string
  /** URLs this document lists as its sources. They may open, through `onSource`. */
  sources?: string[]
  onSource?: (url: string) => void
  /** Wiki path of this document, so its relative links can open other wiki files. */
  docPath?: string
  onWikiLink?: (path: string) => void
}

export const Markdown = memo(function Markdown({
  children,
  sources,
  onSource,
  docPath,
  onWikiLink
}: MarkdownProps) {
  const components = useMemo(
    () => makeComponents(sources, onSource, docPath, onWikiLink),
    [sources, onSource, docPath, onWikiLink]
  )
  // No rehype-raw: raw HTML in model output is shown as text, never rendered.
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {showWikiLinks(children)}
    </ReactMarkdown>
  )
})

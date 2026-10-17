/** A well-formed messaging analysis, as the model is asked to write it. */
export const GOOD_ANALYSIS = `\`\`\`json
{
  "scores": [
    { "dimension": "Clarity", "score": 3, "evidence": "Homepage H1: \\"Human intelligence in the age of AI\\"" },
    { "dimension": "Differentiation", "score": 2, "evidence": "\\"Hands-on advice\\" matches a competitor" },
    { "dimension": "customer focus", "score": 3, "evidence": "Mostly about what we do" },
    { "dimension": "Proof", "score": 4, "evidence": "\\"$1B exit\\" on the homepage" },
    { "dimension": "Consistency", "score": 2, "evidence": "LinkedIn says something else" }
  ]
}
\`\`\`

# Messaging Analysis

## Verdict
Three sentences.

## Top 5 fixes
1. **Problem:** a`

const SOCIAL_TABLE =
  '| Network | URL | Tagline or bio | Source | Status |\n|---|---|---|---|---|\n| LinkedIn | https://linkedin.com/company/acme | "Rockets for coyotes" | Search snippet | Found |\n| X | Not found | Not found | | Not found |'

/**
 * What a well-behaved model passes to write_articles, built from the prompt: every slug it may
 * write (patterns filled in), citing the documents it was given (or a page it "read"), linking
 * to an article that exists, and patching the articles it may add to.
 */
export function fakeArticleOutput(prompt: string, web: boolean): unknown {
  const block = /You may write these articles[^\n]*\n((?: {2}- .*\n?)*)/.exec(prompt)?.[1] ?? ''
  const specs = [...block.matchAll(/^ {2}- ([a-z0-9<>-]+) \((concept|topic|reference)\)/gm)].map(
    (m) => ({
      slug: m[1],
      category: m[2]
    })
  )
  const docs = [...prompt.matchAll(/<document path="([^"]+)">/g)].map((m) => m[1])
  const sources = web
    ? [{ ref: 'https://source.example/b', quote: 'A quote from page B.' }]
    : docs
        .filter((d) => d.startsWith('raw/') || d.startsWith('wiki/'))
        .slice(0, 3)
        .map((ref) => ({ ref, quote: 'Quoted.' }))
  const existing = [...prompt.matchAll(/^- ([a-z0-9-]+): /gm)].map((m) => m[1])
  const slugs = specs.flatMap((s) =>
    s.slug.endsWith('<x>')
      ? (s.slug.startsWith('moat-') ? ['alpha', 'beta'] : ['one', 'two', 'three']).map((x) => ({
          ...s,
          slug: s.slug.replace('<x>', x)
        }))
      : [s]
  )
  const articles = slugs.map((s) => ({
    slug: s.slug,
    category: s.category,
    title: s.slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    summary: `About ${s.slug} — in one line.`,
    aliases: [`${s.slug} alias`],
    tags: ['Positioning', s.slug.split('-')[0]],
    confidence: 'high',
    abstract: `The point of ${s.slug}, in one paragraph — with a dash.`,
    body:
      s.slug === 'social-taglines'
        ? `## Profiles\n\n${SOCIAL_TABLE}`
        : `## Details\n\nWritten for ${s.slug}. See [[${existing[0] ?? 'company-profile'}]] and [[not-a-real-article]].\n\n\`\`\`\ncode — stays\n\`\`\`\n\n## Sources\n\n- model-written, dropped`,
    ...(s.slug.startsWith('competitor-') ? { category_term: 'rocket suppliers' } : {}),
    sources,
    see_also: existing.length ? [{ slug: existing[0], note: 'related' }] : []
  }))
  const patchList = /You may add sections to these existing articles with "patches": (.*)\./.exec(
    prompt
  )?.[1]
  const patches = (patchList ? patchList.split(', ') : []).map((slug) => ({
    slug,
    sections: '## Sales Tactics\n\nPatched in.',
    sources
  }))
  return { articles, patches }
}

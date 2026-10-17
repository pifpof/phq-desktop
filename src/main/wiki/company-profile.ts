import { GOALS, ProfileSchema, ROLES, emptyProfile, type Profile } from '@shared/profile'
import type { ArticleFrontMatter } from '@shared/wiki-types'
import { renderArticle } from './article'
import { parseDoc, stringField } from './frontmatter'

/**
 * wiki/references/company-profile.md (spec 6.3): the facts the founder supplied, written from
 * profile.json and `compiled-from: conversation`. When the app opens a wiki it has no state for,
 * it reads the profile back from this article (REQUIREMENTS-v2 2.1), so the labels below are a
 * format: change them only together with `profileFromArticle`.
 */

export const COMPANY_PROFILE_PATH = 'wiki/references/company-profile.md'

const NOT_PROVIDED = 'Not provided'
const line = (label: string, value: string): string =>
  `- **${label}:** ${value.replace(/\s+/g, ' ').trim() || NOT_PROVIDED}`

const roleOf = (p: Profile): string =>
  p.user.role === 'Other' && p.user.roleOther ? p.user.roleOther : p.user.role

export function companyProfileArticle(
  p: Profile,
  dates: { created: string; updated: string }
): string {
  const company = p.company.name || 'Company'
  const goals = p.goals.map((id) => GOALS.find((g) => g.id === id)?.label ?? id)
  const what = p.company.description
    ? ` ${company} sells ${p.company.description.replace(/\.$/, '')}.`
    : ''
  const frontMatter: ArticleFrontMatter = {
    title: 'Company Profile',
    category: 'reference',
    created: dates.created,
    updated: dates.updated,
    tags: ['company', 'profile'],
    aliases: [`${company} profile`, 'company facts'],
    confidence: 'high',
    volatility: 'cold',
    verified: dates.updated,
    'compiled-from': 'conversation',
    summary: `Facts ${company} supplied during onboarding: company, product, website, competitors, role and goals.`
  }
  const sections = [
    '## Company',
    '',
    line('Name', p.company.name),
    line('Website', p.company.website),
    line('Product', p.company.productName),
    line('What you sell', p.company.description),
    '',
    '## Named competitors',
    '',
    ...(p.company.competitors.length
      ? p.company.competitors.map((c) => `- ${c.replace(/\s+/g, ' ').trim()}`)
      : [`- ${NOT_PROVIDED}`]),
    '',
    '## About the founder',
    '',
    line('Name', p.user.name),
    line('Role', roleOf(p)),
    line('Company size', p.user.companySize),
    '',
    '## Goals',
    '',
    ...(goals.length ? goals.map((g) => `- ${g}`) : [`- ${NOT_PROVIDED}`])
  ].join('\n')
  return renderArticle({
    path: COMPANY_PROFILE_PATH,
    frontMatter,
    abstract: `Facts supplied by ${company} during onboarding, treated as ground truth by every research task.${what}`,
    sections,
    seeAlso: [],
    sources: []
  })
}

function section(body: string, heading: string): string {
  const m = new RegExp(`^## ${heading}\\s*$`, 'm').exec(body)
  if (!m) return ''
  const rest = body.slice(m.index + m[0].length)
  const next = /^## /m.exec(rest)
  return next ? rest.slice(0, next.index) : rest
}

function field(text: string, label: string): string {
  // "- **Name:** Acme" (the app) or "- Name: Acme" (a wiki written by hand or another tool).
  const m = new RegExp(`^- (?:\\*\\*)?${label}:(?:\\*\\*)?[ \\t]*(.*)$`, 'mi').exec(text)
  const v = m?.[1]?.trim() ?? ''
  return v === NOT_PROVIDED ? '' : v
}

const bullets = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => /^- (.*)$/.exec(l.trim())?.[1]?.trim() ?? '')
    // A name written as a link ("[[competitor-x|X]] ([X](...))") is read as its title.
    .map((v) =>
      v
        .replace(/\[\[[^\]|]+\|([^\]]*)\]\]\s*\(\[[^\]]*\]\([^)]*\)\)/g, '$1')
        .replace(/\[\[(?:[^\]|]+\|)?([^\]]*)\]\]/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .trim()
    )
    .filter((v) => v && v !== NOT_PROVIDED && !v.startsWith('**') && !/^[A-Z][a-z ]+:\s/.test(v))

/**
 * Rebuilds a profile from the article. Tolerates hand edits: unknown goals and missing fields are
 * dropped, never guessed. Returns null when the file isn't a readable profile article.
 */
export function profileFromArticle(text: string): Profile | null {
  const doc = parseDoc(text)
  if (!doc) return null
  const company = section(doc.body, 'Company')
  const founder = section(doc.body, 'About the founder')
  const p = emptyProfile()
  p.company.name = field(company, 'Name').slice(0, 200)
  if (!p.company.name) return null
  p.company.website = field(company, 'Website').slice(0, 500)
  p.company.productName = field(company, 'Product').slice(0, 200)
  p.company.description = field(company, 'What you sell').slice(0, 1000)
  p.company.competitors = bullets(section(doc.body, 'Named competitors'))
    .slice(0, 5)
    .map((c) => c.slice(0, 200))
  p.user.name = field(founder, 'Name').slice(0, 200)
  const role = field(founder, 'Role')
  if ((ROLES as readonly string[]).includes(role)) p.user.role = role
  else if (role) {
    p.user.role = 'Other'
    p.user.roleOther = role.slice(0, 200)
  }
  p.user.companySize = field(founder, 'Company size').slice(0, 50)
  const labels = bullets(section(doc.body, 'Goals')).map((g) => g.toLowerCase())
  p.goals = GOALS.filter((g) => labels.includes(g.label.toLowerCase())).map((g) => g.id)
  // The article exists, so onboarding happened somewhere: go straight to Home.
  p.onboarding = { step: 'start', complete: true }
  const parsed = ProfileSchema.safeParse(p)
  return parsed.success ? parsed.data : null
}

export const createdOf = (text: string): string => stringField(parseDoc(text)?.data.created)

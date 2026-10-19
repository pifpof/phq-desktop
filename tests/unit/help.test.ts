import { describe, expect, it } from 'vitest'
import { helpDetails, helpRequestLink, MAX_HELP_URL, type HelpItem } from '../../src/shared/help'
import { isAllowedExternalUrl, links } from '../../src/shared/links'

const SECRET = 'CONFIDENTIAL-PRICING-4412'
const item = (id: string, more: Partial<HelpItem> = {}): HelpItem => ({
  id,
  step: 'proof',
  section: 'Customer Proof Points',
  problem: 'No named customer backs the claims.',
  nextStep: 'Ask one customer for a quote.',
  private: false,
  addedAt: '2026-10-19T00:00:00Z',
  ...more
})

describe('expert help request link (REQUIREMENTS-v4 9)', () => {
  it('puts attribution in the query and everything personal in the fragment', () => {
    const { url, short } = helpRequestLink({
      company: 'Acme',
      name: 'Sam Lee',
      email: 'sam@acme.example',
      items: [item('a')]
    })
    const u = new URL(url)
    expect(short).toBe(false)
    expect(u.origin + u.pathname).toBe(links.helpRequestUrl)
    expect([...u.searchParams.keys()].sort()).toEqual(['utm_medium', 'utm_source'])
    expect(u.searchParams.get('utm_source')).toBe('phq-desktop')
    const f = new URLSearchParams(u.hash.slice(1))
    expect(f.get('company')).toBe('Acme')
    expect(f.get('name')).toBe('Sam Lee')
    expect(f.get('email')).toBe('sam@acme.example')
    expect(f.get('sections')).toBe('Customer Proof Points')
    expect(f.get('gaps')).toBe('Customer Proof Points: No named customer backs the claims.')
    expect(f.get('v')).toBe('1')
    // The next step is advice for the founder, not sent.
    expect(url).not.toContain('quote')
    expect(isAllowedExternalUrl(url)).toBe(true)
  })

  it('never includes text from a private section, in the link or the copied details', () => {
    const priv = item('p', {
      section: 'Target Customers',
      problem: `Only ${SECRET} backs it.`,
      nextStep: SECRET,
      private: true
    })
    const { url } = helpRequestLink({
      company: 'Acme',
      name: '',
      email: '',
      items: [priv, item('a')]
    })
    expect(decodeURIComponent(url)).not.toContain(SECRET)
    expect(new URLSearchParams(new URL(url).hash.slice(1)).get('sections')).toBe(
      'Target Customers; Customer Proof Points'
    )
    expect(helpDetails([priv])).not.toContain(SECRET)
  })

  it('falls back to section names when the link would be too long', () => {
    const long = Array.from({ length: 12 }, (_, i) =>
      item(`x${i}`, { section: `Section ${i}`, problem: 'A long problem statement. '.repeat(12) })
    )
    const { url, short } = helpRequestLink({ company: 'Acme', name: 'Sam', email: '', items: long })
    expect(short).toBe(true)
    expect(url.length).toBeLessThanOrEqual(MAX_HELP_URL)
    expect(new URLSearchParams(new URL(url).hash.slice(1)).get('gaps')).toBe(
      'Details: paste from the app'
    )
  })

  it('allows positioninghq.com over https only', () => {
    expect(isAllowedExternalUrl('https://positioninghq.com/expert-help')).toBe(true)
    expect(isAllowedExternalUrl('http://positioninghq.com/expert-help')).toBe(false)
    expect(isAllowedExternalUrl('https://evil-positioninghq.com/')).toBe(false)
  })
})

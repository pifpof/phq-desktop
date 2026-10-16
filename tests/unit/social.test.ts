import { describe, expect, it } from 'vitest'
import { checkSocialTable, parseSocialTable, setTagline } from '../../src/shared/social'

const table = `# Social Taglines

| Network | URL | Tagline or bio | Source | Status |
|---|---|---|---|---|
| LinkedIn | https://www.linkedin.com/company/acme | "Rockets that arrive" | Search snippet | Found |
| X | https://x.com/acme | Not found | | Not found |
| Instagram | Not found | Not found | | Not found |

## Notes
- X blocked reading.`

describe('social taglines table', () => {
  it('reads every row, found and not found', () => {
    expect(parseSocialTable(table)).toEqual([
      {
        network: 'LinkedIn',
        url: 'https://www.linkedin.com/company/acme',
        tagline: 'Rockets that arrive',
        source: 'Search snippet',
        found: true
      },
      { network: 'X', url: 'https://x.com/acme', tagline: 'Not found', source: '', found: false },
      { network: 'Instagram', url: 'Not found', tagline: 'Not found', source: '', found: false }
    ])
    expect(checkSocialTable(table)).toBeNull()
  })

  it('finds the table among others and tolerates column order', () => {
    const md =
      '| a | b |\n|---|---|\n| 1 | 2 |\n\n| Status | Network | URL |\n|---|---|---|\n| Found | LinkedIn | https://l.example |'
    expect(parseSocialTable(md)).toEqual([
      { network: 'LinkedIn', url: 'https://l.example', tagline: '', source: '', found: true }
    ])
  })

  it('explains what is wrong when the table is missing or empty', () => {
    expect(checkSocialTable('LinkedIn: Rockets that arrive')).toContain('The table is missing')
    expect(checkSocialTable('| Network | URL | Status |\n|---|---|---|')).toContain('no rows')
  })
})

describe('setTagline', () => {
  it('fills a not-found row and leaves everything else alone', () => {
    const out = setTagline(table, 'x', 'Rockets | that "arrive"\non time')!
    const rows = parseSocialTable(out)
    expect(rows[1]).toEqual({
      network: 'X',
      url: 'https://x.com/acme',
      tagline: "Rockets / that 'arrive' on time",
      source: 'Pasted by you',
      found: true
    })
    expect(rows[0]).toEqual(parseSocialTable(table)[0])
    expect(out).toContain('## Notes')
    expect(checkSocialTable(out)).toBeNull()
  })
  it('returns null for an unknown network or a missing table', () => {
    expect(setTagline(table, 'Myspace', 'x')).toBeNull()
    expect(setTagline('no table', 'X', 'x')).toBeNull()
  })
})

describe('pipes inside a tagline', () => {
  const header = '| Network | URL | Tagline or bio | Source | Status |\n|---|---|---|---|---|\n'
  it('reads a bio with a stray pipe (as a real model wrote it) without shifting the columns', () => {
    const md =
      header +
      '| X | https://x.com/acme | "B2B SaaS growth expert | I have skied at both ends of the Earth" | Search snippet | Found |'
    expect(parseSocialTable(md)[0]).toEqual({
      network: 'X',
      url: 'https://x.com/acme',
      tagline: 'B2B SaaS growth expert | I have skied at both ends of the Earth',
      source: 'Search snippet',
      found: true
    })
  })
  it('reads escaped pipes, and keeps them escaped when another row is pasted', () => {
    const md =
      header +
      '| X | https://x.com/acme | "A \\| B" | Search snippet | Found |\n| LinkedIn | Not found | Not found | | Not found |'
    expect(parseSocialTable(md)[0].tagline).toBe('A | B')
    const out = setTagline(md, 'LinkedIn', 'Left | right')!
    expect(parseSocialTable(out)[1]).toMatchObject({ tagline: 'Left / right', found: true })
    expect(parseSocialTable(out)[0].tagline).toBe('A | B')
  })
})

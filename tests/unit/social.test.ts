import { describe, expect, it } from 'vitest'
import { checkSocialTable, parseSocialTable } from '../../src/shared/social'

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

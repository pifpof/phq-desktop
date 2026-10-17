---
title: Social Profiles
task: find-social-profiles
run_id: 20261016-145921-290b
model: claude-sonnet-5-5
created: '2026-10-16T21:59:53.353Z'
status: draft
inputs:
  - memory/research/website/index.md
sources:
  - 'https://acme-advisory.example/'
  - 'https://twitter.com/samrivera'
  - 'https://x.com/samrivera?lang=en'
  - >-
    https://medium.com/@samrivera/your-crm-is-missing-a-churn-reason-77c515db2bdd
---
# Social Profiles

| Network | URL | Confidence | How found |
|---|---|---|---|
| LinkedIn | https://www.linkedin.com/company/111557338/ | High | Linked from the website |
| X | https://x.com/samrivera | Medium | Search |
| Instagram | Not found | Not found | Search |
| Facebook | Not found | Not found | Search |
| YouTube | Not found | Not found | Search |

## Notes

- **LinkedIn (company):** This is the only social link in the website crawl. Confidence is High because the website links to it.
- **LinkedIn (founder, extra):** The site's structured data lists https://www.linkedin.com/in/samrivera/ in its sameAs field. This is Sam Rivera's personal profile, not the company page.
- **X:** This is the founder's personal account (@samrivera), not a company account. The profile lists acme-advisory.example and a Vancouver, BC location. The X page snippets show an older bio ("B2B SaaS growth expert") and posts that mostly pre-date the current AI positioning. The website does not link to it. It is Medium confidence because the website link in the bio ties it to the founder, but it is not a Acme Advisory brand account.
- **Instagram:** No Acme Advisory profile found. The search returned only unrelated results.
- **Facebook:** No Acme Advisory page found. The search returned unrelated pages such as Parallel Lifestyle, Parallel Web Solutions and Parallel Real Estate.
- **YouTube:** No Acme Advisory channel found. The search returned unrelated channels, such as the Parallel TCG game channel.
- **Other networks the website links to:** None found in the crawl.
- **Medium (not in table, not linked from the website):** Sam Rivera's Medium author bio says he runs Acme Advisory, an advisory practice for B2B SaaS companies. The profile is https://medium.com/@samrivera. It is a founder profile, not a company one.
- **Crawl limit:** The crawl listed links from 9 pages, and only LinkedIn appeared. Footer or icon links that the crawler missed are possible. I did not check this.

## Sources

- [Acme Advisory, AI Strategy, Transformation & Governance](https://acme-advisory.example/)
- [Sam (@samrivera) on X](https://twitter.com/samrivera)
- [Sam (@samrivera) / X](https://x.com/samrivera?lang=en)
- [Your CRM Is Missing a Churn Reason](https://medium.com/@samrivera/your-crm-is-missing-a-churn-reason-77c515db2bdd)

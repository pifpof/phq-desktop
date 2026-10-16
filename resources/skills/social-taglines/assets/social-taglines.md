### Social taglines

For each profile in the social profiles list, record its headline, tagline or bio, word for word.

Output as:
```markdown
# Social Taglines

| Network | URL | Tagline or bio | Source | Status |
|---|---|---|---|---|
| LinkedIn | https://www.linkedin.com/company/example | "Exact headline text" | Search snippet | Found |
| X | https://x.com/example | Not found | | Not found |

## Notes
- What could not be read and why, in one line each.
```

Rules for the table:
- Keep the columns exactly as above, in this order.
- **Tagline or bio** is the exact text in quotes, or "Not found". Write any "|" in the text as "\|" so the table stays intact.
- **Source** is "Search snippet", "Profile page" or "Website".
- **Status** is exactly "Found" or "Not found". A profile that blocks reading is "Not found", never an error.
- Include every network from the profiles list, including those not found, so the person can fill them in later.

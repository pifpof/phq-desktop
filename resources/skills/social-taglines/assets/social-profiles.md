### Social profiles

List the company's social profiles. Use the links from the company's own website first, then search for the rest.

Output as:
```markdown
# Social Profiles

| Network | URL | Confidence | How found |
|---|---|---|---|
| LinkedIn | https://www.linkedin.com/company/example | High | Linked from the website |
```

Rules for the table:
- One row for each of LinkedIn, X, Instagram, Facebook and YouTube, plus any other network the website links to.
- **Confidence** is exactly one of: High, Medium, Low. High means the website links to it, or the profile name and website match.
- When no profile can be found for a network, write "Not found" in URL and Confidence.
- **How found** is "Linked from the website" or "Search".

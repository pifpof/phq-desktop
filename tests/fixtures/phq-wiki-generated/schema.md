---
title: "Acme Rockets Topic Guide"
schema_state: advisory
created: 2026-10-19
updated: 2026-10-19
summary: "PositioningHQ topic guide: entity types, relationship verbs and source conventions for a positioning wiki."
---

# Acme Rockets Topic Guide

> Human-owned topic guide. Tools may propose changes in `output/schema-proposal-*.md` but never rewrite this file.

## State

- `schema_state`: `advisory`

## Entity Types

| Type | Meaning | Where |
|------|---------|-------|
| `company` | The company this wiki is about | `topics/company-overview`, `references/company-profile` |
| `product` | A product or package | `topics/product-overview` |
| `segment` | A market or customer segment | `topics/market-segment`, `topics/customer-segment` |
| `persona` | A buyer or user role | inside `topics/ideal-customer-profile` |
| `competitor` | A named alternative vendor | `references/competitor-*` |
| `alternative` | A non-vendor alternative (status quo, spreadsheets, hiring) | inside `topics/ideal-customer-profile`, `topics/market-overview` |
| `value-driver` | An outcome the ideal customer will pay for | `concepts/value-driver-*` |
| `moat` | A hard-to-copy advantage | `concepts/moat-*` |
| `proof-point` | Evidence for a claim | `references/proof-points` |
| `message` | A statement the company makes publicly | `topics/current-messaging`, `references/social-taglines` |
| `decision` | A founder positioning decision | `references/decision-*` |
| `source` | Evidence | `raw/` |

## Relationship Verbs

- llm-wiki's verbs: `cites`, `supports`, `contradicts`, `supersedes`, `depends-on`, `implements`, `relates-to`
- `targets`: a value driver targets a persona
- `competes-with`: the company and a competitor
- `differentiates-from`: a moat and a competitor or alternative
- `proves`: a proof point and a claim

## Source Conventions

- Raw sources are never edited after ingest.
- `private` sources never leave the user's control except to their chosen AI provider.
- Competitor brand names are allowed in `wiki/`. The assembled playbook uses category terms instead.
- Decision articles override anything that contradicts them.

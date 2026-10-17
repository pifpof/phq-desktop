---
title: "Acme Topic Guide"
schema_state: advisory
created: 2026-10-17
updated: 2026-10-17
summary: "PositioningHQ topic guide: entity types, relationship verbs and source conventions for a positioning wiki."
---

# Acme Topic Guide

> Human-owned topic guide. Tools may propose changes in `output/schema-proposal-*.md` but never rewrite this file.

## State

- `schema_state`: `advisory`

## Entity Types

| Type | Meaning | Where |
|------|---------|-------|
| `company` | The company this wiki is about | `topics/company-overview`, `references/company-profile` |
| `competitor` | A named alternative vendor | `references/competitor-*` |
| `source` | Evidence | `raw/` |

## Relationship Verbs

- `cites`, `supports`, `contradicts`, `supersedes`, `depends-on`, `implements`, `relates-to`
- `targets`, `competes-with`, `differentiates-from`, `proves`

## Source Conventions

- Raw is never edited.
- `private` sources never leave the user's control except to their chosen AI provider.
- Competitor brand names are allowed in `wiki/`; the assembled playbook uses category terms.

import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { ALLOWED_HOSTS, isAllowedExternalUrl, links, signupUrl } from '../../src/shared/links'
import { isEmail, normalizeWebsite } from '../../src/shared/url'
import { addInputs, listInputs, removeInput } from '../../src/main/workspace/inputs'
import { createLayout } from '../../src/main/workspace/layout'
import { INPUT_LIMITS } from '../../src/shared/workspace'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'phq-onb-'))

describe('normalizeWebsite', () => {
  it('adds https and trims', () => {
    expect(normalizeWebsite('acme.com')).toBe('https://acme.com')
    expect(normalizeWebsite('  www.acme.com/ ')).toBe('https://www.acme.com')
    expect(normalizeWebsite('https://acme.com/about/')).toBe('https://acme.com/about')
    expect(normalizeWebsite('http://acme.com')).toBe('http://acme.com')
  })
  it('rejects things that are not websites', () => {
    for (const bad of [
      '',
      '   ',
      'acme',
      'not a site',
      'ftp://acme.com',
      'javascript:alert(1)',
      'localhost',
      'https://'
    ]) {
      expect(normalizeWebsite(bad), bad).toBeNull()
    }
  })
})

describe('isEmail', () => {
  it('accepts plain addresses only', () => {
    expect(isEmail('a@b.co')).toBe(true)
    expect(isEmail('a@b')).toBe(false)
    expect(isEmail('a b@c.com')).toBe(false)
  })
})

describe('sign-up and community links', () => {
  it('prefills the email and URL-encodes it', () => {
    const url = new URL(signupUrl(' a+b@acme.com '))
    expect(url.searchParams.get('email')).toBe('a+b@acme.com')
    expect(signupUrl('')).toBe(links.signupFormUrl)
  })
  it('both links are on the external allowlist', () => {
    expect(isAllowedExternalUrl(links.signupFormUrl)).toBe(true)
    expect(isAllowedExternalUrl(signupUrl('a@b.co'))).toBe(true)
    expect(isAllowedExternalUrl(links.communityUrl)).toBe(true)
    expect(ALLOWED_HOSTS).toContain('console.anthropic.com')
  })
})

describe('addInputs', () => {
  it('copies files, never moves them, and suffixes duplicates', async () => {
    const root = tmp()
    const src = tmp()
    await createLayout(root)
    writeFileSync(join(src, 'deck.pdf'), 'one')
    writeFileSync(join(src, 'notes.xyz'), 'two')
    const a = await addInputs(root, 'sales collateral', [
      join(src, 'deck.pdf'),
      join(src, 'notes.xyz')
    ])
    expect(a.added.map((f) => [f.name, f.readable])).toEqual([
      ['deck.pdf', true],
      ['notes.xyz', false]
    ])
    const b = await addInputs(root, 'sales collateral', [join(src, 'deck.pdf')])
    expect(b.added[0].name).toBe('deck-2.pdf')
    expect(readFileSync(join(src, 'deck.pdf'), 'utf8')).toBe('one')
    expect((await listInputs(root))['sales collateral'].map((f) => f.name)).toEqual([
      'deck-2.pdf',
      'deck.pdf',
      'notes.xyz'
    ])
  })

  it('refuses folders, missing files and oversized files', async () => {
    const root = tmp()
    const src = tmp()
    await createLayout(root)
    mkdirSync(join(src, 'folder'))
    const big = join(src, 'big.pdf')
    writeFileSync(big, '')
    const { truncateSync } = await import('fs')
    truncateSync(big, INPUT_LIMITS.maxFileBytes + 1)
    const r = await addInputs(root, 'roadmap', [join(src, 'folder'), join(src, 'missing.pdf'), big])
    expect(r.added).toEqual([])
    expect(r.refused.map((x) => x.reason)).toEqual([
      'Folders are not supported. Add the files inside it.',
      "Couldn't read this file.",
      'Over 25 MB.'
    ])
  })

  it('stops at the total file limit across categories', async () => {
    const root = tmp()
    const src = tmp()
    await createLayout(root)
    const paths = Array.from({ length: INPUT_LIMITS.maxFiles + 2 }, (_, i) => {
      const p = join(src, `f${i}.txt`)
      writeFileSync(p, 'x')
      return p
    })
    const r = await addInputs(root, 'help-docs', paths)
    expect(r.added).toHaveLength(INPUT_LIMITS.maxFiles)
    expect(r.refused).toHaveLength(2)
    expect(r.refused[0].reason).toContain('Limit of 50')
    const more = await addInputs(root, 'roadmap', [paths[0]])
    expect(more.added).toEqual([])
  })

  it('removes only the copy, and refuses path tricks', async () => {
    const root = tmp()
    const src = tmp()
    await createLayout(root)
    writeFileSync(join(src, 'a.md'), 'x')
    await addInputs(root, 'roadmap', [join(src, 'a.md')])
    expect(await removeInput(root, 'roadmap', '../../memory/company-profile.md')).toBe(false)
    expect(await removeInput(root, 'roadmap', 'a.md')).toBe(true)
    expect((await listInputs(root)).roadmap).toEqual([])
    expect(statSync(join(src, 'a.md')).isFile()).toBe(true)
  })
})

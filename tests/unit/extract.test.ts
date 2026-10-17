import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { MAX_TOKENS_PER_FILE } from '../../src/main/ingest/extract'
import {
  addInputs,
  ingestInbox,
  readRecords,
  removeInput
} from '../../src/main/ingest/files-to-raw'
import { userFileDocuments } from '../../src/main/research/executor'
import { confirmWorkspace } from '../../src/main/services/workspace'
import { checkWiki } from '../../src/main/wiki/conformance'
import { scanWiki } from '../../src/main/wiki/scan'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'phq-extract-'))

async function docx(text: string): Promise<Buffer> {
  const z = new JSZip()
  z.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  )
  z.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  )
  z.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`
  )
  return z.generateAsync({ type: 'nodebuffer' })
}

async function pptx(slides: string[][]): Promise<Buffer> {
  const z = new JSZip()
  slides.forEach((paras, i) => {
    z.file(
      `ppt/slides/slide${i + 1}.xml`,
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>${paras.map((t) => `<p:sp><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp>`).join('')}</p:spTree></p:cSld></p:sld>`
    )
  })
  return z.generateAsync({ type: 'nodebuffer' })
}

function pdf(text: string): Buffer {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${`BT /F1 18 Tf 20 100 Td (${text}) Tj ET`.length} >>\nstream\nBT /F1 18 Tf 20 100 Td (${text}) Tj ET\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(out)
}

/** A new wiki, plus a folder of the person's own files to add from. */
async function setup(
  files: Record<string, Buffer | string>
): Promise<{ root: string; src: string }> {
  const root = tmp()
  await confirmWorkspace(root, '0.2.0')
  const src = tmp()
  for (const [name, data] of Object.entries(files)) writeFileSync(join(src, name), data)
  return { root, src }
}

const raw = async (root: string) => (await scanWiki(root)).filter((f) => f.kind === 'raw')

describe('file ingest', () => {
  it('extracts every supported type into raw/, tagged private and by category, original kept', async () => {
    const { root, src } = await setup({
      'deck.pptx': await pptx([['Welcome to Acme', 'Rockets &amp; more'], ['Pricing slide']]),
      'one-pager.docx': await docx('Docx says hello'),
      'quote.pdf': pdf('Hello from PDF'),
      'plan.md': '# Plan\n\nShip it',
      'faq.txt': 'Q and A',
      'wins.csv': 'deal,reason\n1,price'
    })
    await addInputs(
      root,
      'sales collateral',
      [join(src, 'deck.pptx'), join(src, 'one-pager.docx')],
      '2026-10-17'
    )
    await addInputs(root, 'customer references', [join(src, 'quote.pdf')], '2026-10-17')
    await addInputs(root, 'roadmap', [join(src, 'plan.md')], '2026-10-17')
    await addInputs(root, 'help-docs', [join(src, 'faq.txt')], '2026-10-17')
    await addInputs(root, 'competitive-intel', [join(src, 'wins.csv')], '2026-10-17')
    const files = await raw(root)
    expect(files.map((f) => f.rel).sort()).toEqual([
      'raw/data/2026-10-17-wins.md',
      'raw/papers/2026-10-17-deck.md',
      'raw/papers/2026-10-17-faq.md',
      'raw/papers/2026-10-17-one-pager.md',
      'raw/papers/2026-10-17-plan.md',
      'raw/papers/2026-10-17-quote.md'
    ])
    const deck = files.find((f) => f.name === '2026-10-17-deck')!
    expect(deck.body).toContain('## Slide 1')
    expect(deck.body).toContain('Rockets & more')
    expect(deck.data).toMatchObject({
      title: 'deck',
      source: 'inbox/.processed/deck.pptx',
      type: 'papers',
      ingested: '2026-10-17',
      tags: ['private', 'sales-collateral']
    })
    // The summary names the file but quotes none of its content (indexes list summaries).
    expect(String(deck.data?.summary)).not.toContain('Welcome')
    expect(files.find((f) => f.name === '2026-10-17-wins')?.body).toContain('deal,reason')
    expect(readdirSync(join(root, 'inbox')).filter((n) => !n.startsWith('.'))).toEqual([])
    expect(readdirSync(join(root, 'inbox/.processed')).sort()).toEqual([
      'deck.pptx',
      'faq.txt',
      'one-pager.docx',
      'plan.md',
      'quote.pdf',
      'wins.csv'
    ])
    expect(readFileSync(join(src, 'plan.md'), 'utf8')).toBe('# Plan\n\nShip it')
    expect(await readFile(join(root, 'log.md'), 'utf8')).toContain(
      'ingest | deck.pptx (raw/papers/2026-10-17-deck.md)'
    )
    const report = await checkWiki(root, '2026-10-17')
    expect(report.findings.filter((f) => f.severity !== 'suggestion')).toEqual([])
  })

  it('keeps the whole text in raw/ and cuts it only when building a prompt', async () => {
    const { root, src } = await setup({ 'big.txt': 'x'.repeat(MAX_TOKENS_PER_FILE * 4 + 5000) })
    await addInputs(root, 'help-docs', [join(src, 'big.txt')])
    const [f] = await raw(root)
    expect(f.body.length).toBeGreaterThan(MAX_TOKENS_PER_FILE * 4)
    const [doc] = await userFileDocuments(root, ['help-docs'])
    expect(doc.path).toBe(f.rel)
    expect(doc.content).toContain('[Truncated:')
    expect(doc.content.length).toBeLessThan(MAX_TOKENS_PER_FILE * 4 + 500)
  })

  it('gives a task only the categories it asks for, plus files added without one', async () => {
    const { root, src } = await setup({
      'a.txt': 'ROADMAP TEXT',
      'b.txt': 'STRATEGY TEXT',
      'c.txt': 'LOOSE TEXT'
    })
    await addInputs(root, 'roadmap', [join(src, 'a.txt')])
    await addInputs(root, 'company strategy', [join(src, 'b.txt')])
    // Dropped straight into inbox/ in Finder: ingested by the research step, with no category.
    writeFileSync(join(root, 'inbox', 'c.txt'), 'LOOSE TEXT')
    await ingestInbox(root)
    const text = (await userFileDocuments(root, ['roadmap'])).map((d) => d.content).join('\n')
    expect(text).toContain('ROADMAP TEXT')
    expect(text).toContain('LOOSE TEXT')
    expect(text).not.toContain('STRATEGY TEXT')
  })

  it('leaves unreadable files in inbox/ with no raw file, and never leaks content', async () => {
    const { root, src } = await setup({
      'notes.xyz': 'secret-content-123',
      'blank.txt': '   \n ',
      'broken.pdf': 'not really a pdf SECRET-PDF-BYTES',
      'broken.docx': 'not a zip SECRET-DOCX-BYTES'
    })
    const r = await addInputs(
      root,
      'roadmap',
      ['notes.xyz', 'blank.txt', 'broken.pdf', 'broken.docx'].map((n) => join(src, n))
    )
    expect(r.added.map((f) => [f.name, f.readable])).toEqual([
      ['notes.xyz', false],
      ['blank.txt', false],
      ['broken.pdf', false],
      ['broken.docx', false]
    ])
    expect(await raw(root)).toEqual([])
    expect(
      readdirSync(join(root, 'inbox'))
        .filter((n) => !n.startsWith('.'))
        .sort()
    ).toEqual(['blank.txt', 'broken.docx', 'broken.pdf', 'notes.xyz'])
    const records = await readRecords(root)
    expect(records.map((x) => x.status)).toEqual(['not-read', 'empty', 'failed', 'failed'])
    expect(JSON.stringify(records)).not.toMatch(/SECRET/)
    // The inbox may hold anything: still lint clean.
    expect((await checkWiki(root)).ok).toBe(true)
  })

  it('refuses to remove a file an article cites', async () => {
    const { root, src } = await setup({ 'a.txt': 'x' })
    await addInputs(root, 'roadmap', [join(src, 'a.txt')], '2026-10-17')
    const [f] = await raw(root)
    writeFileSync(
      join(root, 'wiki/topics/market-overview.md'),
      `---\ntitle: "M"\ncategory: topic\nsources:\n  - ${f.rel}\ncreated: 2026-10-17\nupdated: 2026-10-17\ntags: [private]\nsummary: "M"\n---\n`
    )
    expect(await removeInput(root, 'roadmap', 'a.txt')).toBe(false)
  })
})

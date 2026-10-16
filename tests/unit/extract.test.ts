import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import JSZip from 'jszip'
import matter from 'gray-matter'
import { describe, expect, it } from 'vitest'
import { extractInputs, MAX_TOKENS_PER_FILE } from '../../src/main/ingest/extract'
import { createLayout } from '../../src/main/workspace/layout'

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

async function setup(files: Record<string, Buffer | string>): Promise<string> {
  const root = tmp()
  await createLayout(root)
  for (const [rel, data] of Object.entries(files)) {
    mkdirSync(join(root, 'inputs', rel, '..'), { recursive: true })
    writeFileSync(join(root, 'inputs', rel), data)
  }
  return root
}

describe('extractInputs', () => {
  it('extracts every supported type and writes front matter pointing at the original', async () => {
    const root = await setup({
      'sales collateral/deck.pptx': await pptx([
        ['Welcome to Acme', 'Rockets &amp; more'],
        ['Pricing slide']
      ]),
      'sales collateral/one-pager.docx': await docx('Docx says hello'),
      'customer references/quote.pdf': pdf('Hello from PDF'),
      'roadmap/plan.md': '# Plan\n\nShip it',
      'help-docs/faq.txt': 'Q and A',
      'competitive-intel/wins.csv': 'deal,reason\n1,price'
    })
    const results = await extractInputs(root, 'run-1')
    expect(results.map((r) => `${r.file}:${r.status}`).sort()).toEqual([
      'deck.pptx:ok',
      'faq.txt:ok',
      'one-pager.docx:ok',
      'plan.md:ok',
      'quote.pdf:ok',
      'wins.csv:ok'
    ])
    const read = (rel: string) => matter(readFileSync(join(root, rel), 'utf8'))
    const pp = read('memory/research/inputs-extracted/sales collateral/deck.pptx.md')
    expect(pp.content).toContain('## Slide 1')
    expect(pp.content).toContain('Rockets & more')
    expect(pp.content).toContain('Pricing slide')
    expect(pp.data).toMatchObject({
      task: 'extract-input-files',
      run_id: 'run-1',
      source_file: 'inputs/sales collateral/deck.pptx',
      category: 'sales collateral',
      truncated: false
    })
    expect(
      read('memory/research/inputs-extracted/sales collateral/one-pager.docx.md').content
    ).toContain('Docx says hello')
    expect(
      read('memory/research/inputs-extracted/customer references/quote.pdf.md').content
    ).toContain('Hello from PDF')
    expect(read('memory/research/inputs-extracted/roadmap/plan.md.md').content).toContain('Ship it')
    expect(
      read('memory/research/inputs-extracted/competitive-intel/wins.csv.md').content
    ).toContain('deal,reason')
  })

  it('truncates at the token budget and says so', async () => {
    const root = await setup({ 'help-docs/big.txt': 'x'.repeat(MAX_TOKENS_PER_FILE * 4 + 5000) })
    const [r] = await extractInputs(root)
    expect(r).toMatchObject({ status: 'ok', truncated: true })
    const doc = matter(readFileSync(join(root, r.output!), 'utf8'))
    expect(doc.data.truncated).toBe(true)
    expect(doc.content).toContain('[Truncated:')
    expect(doc.content.length).toBeLessThan(MAX_TOKENS_PER_FILE * 4 + 500)
  })

  it('marks unsupported types not-read, empty files empty, and corrupt files failed without leaking content', async () => {
    const root = await setup({
      'roadmap/notes.xyz': 'secret-content-123',
      'roadmap/blank.txt': '   \n ',
      'roadmap/broken.pdf': 'not really a pdf SECRET-PDF-BYTES',
      'roadmap/broken.docx': 'not a zip SECRET-DOCX-BYTES'
    })
    const byFile = Object.fromEntries((await extractInputs(root)).map((r) => [r.file, r]))
    expect(byFile['notes.xyz'].status).toBe('not-read')
    expect(byFile['blank.txt'].status).toBe('empty')
    expect(byFile['broken.pdf'].status).toBe('failed')
    expect(byFile['broken.docx'].status).toBe('failed')
    expect(JSON.stringify(byFile)).not.toMatch(/SECRET/)
  })

  it('survives a workspace with no inputs', async () => {
    const root = tmp()
    expect(await extractInputs(root)).toEqual([])
  })
})

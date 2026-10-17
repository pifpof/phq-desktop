import { readFile } from 'fs/promises'
import { extname } from 'path'
import JSZip from 'jszip'
import mammoth from 'mammoth'
import { extractText, getDocumentProxy } from 'unpdf'

/** Per-file budget. Tokens are estimated as characters divided by 4. */
export const MAX_TOKENS_PER_FILE = 30_000

const decodeXml = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')

async function pptxText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf)
  const slides = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]))
  const out: string[] = []
  for (const [i, name] of slides.entries()) {
    const xml = await zip.files[name].async('string')
    const paragraphs = [...xml.matchAll(/<a:p[ >][\s\S]*?<\/a:p>/g)]
      .map((p) =>
        [...p[0].matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((t) => decodeXml(t[1])).join('')
      )
      .filter((t) => t.trim())
    if (paragraphs.length) out.push(`## Slide ${i + 1}\n\n${paragraphs.join('\n')}`)
  }
  return out.join('\n\n')
}

async function pdfText(buf: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buf))
  const { text } = await extractText(pdf, { mergePages: true })
  return text
}

/** Plain text of a supported file. Throws on unreadable or encrypted files. */
export async function extractText_(path: string): Promise<string> {
  const ext = extname(path).slice(1).toLowerCase()
  const buf = await readFile(path)
  switch (ext) {
    case 'pdf':
      return pdfText(buf)
    case 'docx':
      return (await mammoth.extractRawText({ buffer: buf })).value
    case 'pptx':
      return pptxText(buf)
    case 'csv':
      return '```csv\n' + buf.toString('utf8').trim() + '\n```'
    case 'md':
    case 'txt':
      return buf.toString('utf8')
    default:
      throw new Error('Unsupported type')
  }
}

export const cleanText = (s: string): string =>
  s
    .replaceAll('\u0000', '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

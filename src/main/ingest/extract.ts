import { mkdir, readFile, readdir, writeFile } from 'fs/promises'
import { extname, join } from 'path'
import matter from 'gray-matter'
import JSZip from 'jszip'
import mammoth from 'mammoth'
import { extractText, getDocumentProxy } from 'unpdf'
import { INPUT_CATEGORIES, READABLE_EXTENSIONS, type InputCategory } from '@shared/workspace'

/** Per-file budget. Tokens are estimated as characters divided by 4. */
export const MAX_TOKENS_PER_FILE = 30_000
const MAX_CHARS = MAX_TOKENS_PER_FILE * 4

export interface ExtractResult {
  category: InputCategory
  file: string
  status: 'ok' | 'empty' | 'failed' | 'not-read'
  output: string | null
  chars: number
  truncated: boolean
  error?: string
}

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

const clean = (s: string): string =>
  s
    .replaceAll('\u0000', '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

/** T2: text extraction. Writes memory/research/inputs-extracted/<category>/<file>.md. */
export async function extractInputs(root: string, runId = 'manual'): Promise<ExtractResult[]> {
  const results: ExtractResult[] = []
  for (const category of INPUT_CATEGORIES) {
    let names: string[]
    try {
      names = (await readdir(join(root, 'inputs', category), { withFileTypes: true }))
        .filter((e) => e.isFile() && !e.name.startsWith('.'))
        .map((e) => e.name)
        .sort()
    } catch {
      continue
    }
    for (const file of names) {
      const ext = extname(file).slice(1).toLowerCase()
      if (!(READABLE_EXTENSIONS as readonly string[]).includes(ext)) {
        results.push({
          category,
          file,
          status: 'not-read',
          output: null,
          chars: 0,
          truncated: false
        })
        continue
      }
      try {
        const text = clean(await extractText_(join(root, 'inputs', category, file)))
        if (!text || text === '```csv\n\n```') {
          results.push({
            category,
            file,
            status: 'empty',
            output: null,
            chars: 0,
            truncated: false,
            error: 'No readable text. It may be a scanned document.'
          })
          continue
        }
        const truncated = text.length > MAX_CHARS
        const body = truncated
          ? `${text.slice(0, MAX_CHARS)}\n\n[Truncated: only the first ${MAX_TOKENS_PER_FILE.toLocaleString('en-US')} tokens of ${Math.round(text.length / 4).toLocaleString('en-US')} are included.]`
          : text
        const rel = join('memory', 'research', 'inputs-extracted', category, `${file}.md`)
        await mkdir(join(root, 'memory', 'research', 'inputs-extracted', category), {
          recursive: true
        })
        await writeFile(
          join(root, rel),
          matter.stringify(body + '\n', {
            title: file,
            task: 'extract-input-files',
            run_id: runId,
            created: new Date().toISOString(),
            status: 'draft',
            source_file: `inputs/${category}/${file}`,
            category,
            truncated,
            estimated_tokens: Math.round(Math.min(text.length, MAX_CHARS) / 4)
          })
        )
        results.push({
          category,
          file,
          status: 'ok',
          output: rel.split('\\').join('/'),
          chars: text.length,
          truncated
        })
      } catch (err) {
        // Never include file content in the error.
        results.push({
          category,
          file,
          status: 'failed',
          output: null,
          chars: 0,
          truncated: false,
          error: err instanceof Error ? err.message.slice(0, 200) : 'Could not read this file.'
        })
      }
    }
  }
  await writeIndex(root, results, runId)
  return results
}

const STATUS_TEXT: Record<ExtractResult['status'], string> = {
  ok: 'read',
  empty: 'no readable text',
  failed: 'could not be read',
  'not-read': 'not read (unsupported type)'
}

/** index.md lists every file and whether it was read. It is also what marks this task as complete. */
async function writeIndex(root: string, results: ExtractResult[], runId: string): Promise<void> {
  const dir = join(root, 'memory', 'research', 'inputs-extracted')
  await mkdir(dir, { recursive: true })
  const rows = results.map(
    (r) =>
      `| ${r.category} | ${r.file} | ${STATUS_TEXT[r.status]}${r.truncated ? ' (shortened)' : ''} |`
  )
  const body = results.length
    ? ['# Files', '', '| Category | File | Status |', '|---|---|---|', ...rows].join('\n')
    : '# Files\n\nNo files were added.'
  await writeFile(
    join(dir, 'index.md'),
    matter.stringify(body + '\n', {
      title: 'Your files',
      task: 'extract-input-files',
      run_id: runId,
      created: new Date().toISOString(),
      status: 'draft',
      files: results.length,
      read: results.filter((r) => r.status === 'ok').length
    })
  )
}

import { readdir, readFile, stat } from 'fs/promises'
import { basename } from 'path'
import matter from 'gray-matter'
import type { RunView, StepState } from '@shared/research'
import { stringField, stringList } from '../wiki/frontmatter'
import { resolveInside } from '../workspace/paths'
import type { TaskContext, TaskDef } from './types'

/**
 * Each research step's status from disk, across runs (REQUIREMENTS-v4.4 4A.2). Done is the existing
 * output check; skipped and failed come from the newest run that ended the step. No model call.
 */

/** What each step produces, in one plain line (REQUIREMENTS-v4.4 4A.2, open item 4). */
export const STEP_DESCRIPTIONS: Record<string, string> = {
  'crawl-website': 'Reads up to 30 pages of your website. Free, runs on this computer.',
  'extract-input-files': 'Reads the files you added. Free, runs on this computer.',
  'find-social-profiles': 'Finds your LinkedIn, X and other profiles.',
  'research-02-product': 'What you sell and how it works, from the web.',
  'research-03-market-segment': 'The market you sell into and its size.',
  'research-04-customer-segment': 'Who buys from companies like yours.',
  'research-05-strengths': 'What the web says you do well.',
  'research-06-weaknesses': 'Where the web sees gaps or complaints.',
  'research-07-recent-developments': 'News, launches and funding from the last year.',
  'competitor-discovery': 'Finds the competitors buyers compare you with.',
  'website-positioning': 'How your website positions you today, with your own words quoted.',
  'research-01-overview': 'A one-page overview of your company.',
  'social-taglines': 'The taglines and bios on your social profiles.',
  'competitor-profiles':
    'A profile of each competitor: what they sell, to whom, and where they win.',
  'proof-gathering': 'Public reviews, testimonials and mentions of you.',
  'research-08-competitive': 'How you compare with your competitors.',
  'research-09-synthesis': 'Pulls the research together into one view of your market.',
  'playbook-01-market': 'Playbook section: the market, why now, and where you fit.',
  'playbook-02-icp': 'Playbook section: your ideal customer and what triggers a purchase.',
  'playbook-03-value': 'Playbook section: the value drivers buyers care about.',
  'playbook-04-moat': 'Playbook section: what makes you hard to copy.',
  'playbook-05-statement': 'Playbook section: your positioning statement and message variations.',
  'playbook-06-competitive': 'Playbook section: how to win against each kind of competitor.',
  'playbook-07-proof': 'Playbook section: the proof that backs your claims.',
  'playbook-assemble': 'Puts the seven sections together as a new playbook version. Free.',
  'messaging-analysis': 'Scores your current messaging and lists the fixes that matter most.'
}

export interface StepStateDeps {
  tasks: TaskDef[]
  /** Root the task output paths resolve against (drafts in app state). */
  draftsRoot: string
  wikiRoot: string
  ctx: TaskContext
  runs: RunView[]
  /** Is this task's output on disk and complete (the engine's resume check)? */
  verify(task: TaskDef): Promise<boolean>
  cost(task: TaskDef): { low: number; high: number }
}

/** A step writes wiki articles (itself or, for competitor profiles, its children). */
export const writesArticles = (t: TaskDef): boolean => t.writes?.kind === 'articles' || !!t.fanOut

async function receipt(
  root: string,
  rel: string
): Promise<{ at: string | null; written: string[] } | null> {
  const full = resolveInside(root, rel)
  if (!full) return null
  try {
    const s = await stat(full)
    if (s.isDirectory()) {
      // A group's receipts: one per child.
      const names = (await readdir(full)).filter((n) => n.endsWith('.md')).sort()
      const written: string[] = []
      for (const n of names) written.push(...((await receipt(root, `${rel}/${n}`))?.written ?? []))
      return { at: s.mtime.toISOString(), written }
    }
    const fm = matter(await readFile(full, 'utf8')).data
    const created = stringField(fm.created)
    return {
      at: created && !Number.isNaN(Date.parse(created)) ? created : s.mtime.toISOString(),
      written: stringList(fm.written)
    }
  } catch {
    return null
  }
}

/** The newest run that ended this step (done, skipped other than by stopping, or failed). */
function lastEnded(runs: RunView[], id: string): RunView['tasks'][number] | null {
  for (const run of [...runs].sort((a, b) => b.startedAt - a.startedAt)) {
    const t = run.tasks.find((x) => x.id === id)
    if (!t) continue
    if (t.status === 'done' || t.status === 'failed') return t
    if (t.status === 'skipped' && !t.note?.includes('stopped')) return t
  }
  return null
}

const iso = (ms: number | null): string | null => (ms ? new Date(ms).toISOString() : null)

export async function stepStates(d: StepStateDeps): Promise<StepState[]> {
  const top = d.tasks.filter((t) => !t.onDemand)
  const ids = new Set(top.map((t) => t.id))
  const out: StepState[] = []
  for (const t of top) {
    const done = await d.verify(t)
    const r = done ? await receipt(d.draftsRoot, t.output(d.ctx)) : null
    const last = done ? null : lastEnded(d.runs, t.id)
    const status = done
      ? 'done'
      : last?.status === 'skipped'
        ? 'skipped'
        : last?.status === 'failed'
          ? 'failed'
          : 'not-run'
    const written = r?.written ?? []
    const open = written.find((w) => w.startsWith('wiki/') || w.startsWith('output/')) ?? null
    const articles = writesArticles(t)
    const page = written.find((w) => w.startsWith('wiki/'))
    out.push({
      id: t.id,
      title: t.title,
      description: STEP_DESCRIPTIONS[t.id] ?? '',
      stage: t.stage,
      status,
      at: done ? (r?.at ?? null) : iso(last?.endedAt ?? null),
      note: done ? null : (last?.error?.message ?? last?.note ?? null),
      dependsOn: t.dependsOn.filter((x) => ids.has(x)),
      open,
      regenerate: done && articles && page ? basename(page, '.md') : null,
      rerunnable: done && !articles,
      costUsd: d.cost(t)
    })
  }
  return out
}

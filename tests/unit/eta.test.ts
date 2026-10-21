import { describe, expect, it } from 'vitest'
import type { RunView, TaskView } from '../../src/shared/research'
import { minutesLeft, smooth, stageLine, timeLeftText } from '../../src/renderer/src/lib/eta'

const MIN = 60_000
const task = (
  id: string,
  status: TaskView['status'],
  mins = 0,
  o: Partial<TaskView> = {}
): TaskView => ({
  id,
  title: id,
  stage: 1,
  status,
  parent: null,
  local: false,
  web: false,
  attempts: 0,
  startedAt: status === 'waiting' ? null : 0,
  endedAt: status === 'done' ? mins * MIN : null,
  costUsd: 0,
  error: null,
  note: null,
  output: null,
  ...o
})
const run = (tasks: TaskView[], concurrency = 3): RunView => ({
  id: 'r',
  status: 'running',
  pause: null,
  model: 'm',
  concurrency,
  budgetCapUsd: 5,
  spentUsd: 0,
  skipWeb: false,
  startedAt: 0,
  endedAt: null,
  tasks,
  scope: null,
  kind: 'full',
  playbookReadyAt: null,
  doneSeenAt: null
})

describe('time left (REQUIREMENTS-v4.4 4.2)', () => {
  const done = [task('a', 'done', 1), task('b', 'done', 2), task('c', 'done', 3)]

  it('says nothing before 3 tasks are done', () => {
    expect(minutesLeft(run([...done.slice(0, 2), task('d', 'waiting')]), new Map())).toBeNull()
  })

  it('a chain runs one after another; independent tasks share the concurrency', () => {
    const deps = new Map([
      ['e', ['d']],
      ['f', ['e']]
    ])
    // median 2 min; chain d -> e -> f is 3 long
    const chain = run([...done, task('d', 'waiting'), task('e', 'waiting'), task('f', 'waiting')])
    expect(minutesLeft(chain, deps)).toBe(6)
    // six independent tasks over 3 at a time
    const wide = run([...done, ...'ghijkl'.split('').map((id) => task(id, 'waiting'))])
    expect(minutesLeft(wide, new Map())).toBe(4)
    // a running task counts half; local tasks take no time
    const mixed = run([...done, task('m', 'running'), task('n', 'waiting', 0, { local: true })], 1)
    expect(minutesLeft(mixed, new Map())).toBe(1)
  })

  it('never jumps up by more than 2 minutes, and reads in plain words', () => {
    expect(smooth(5, 12)).toBe(7)
    expect(smooth(5, 3)).toBe(3)
    expect(smooth(null, 9)).toBe(9)
    expect(timeLeftText(0.4)).toBe('Almost done')
    expect(timeLeftText(1.2)).toBe('About 1 minute left')
    expect(timeLeftText(6.4)).toBe('About 6 minutes left')
    expect(timeLeftText(null)).toBeNull()
  })

  it('names the stage from the running task', () => {
    const titles = new Map([['playbook-03-value', 'Value Drivers']])
    const at = (id: string, stage = 1) =>
      stageLine(run([task(id, 'running', 0, { stage })]), titles)
    expect(at('crawl-website')).toBe('Reading your website')
    expect(at('competitor-discovery')).toBe('Researching competitors')
    expect(at('research-05-strengths')).toBe('Researching your market')
    expect(at('playbook-03-value', 4)).toBe('Writing value drivers')
    expect(at('playbook-assemble', 4)).toBe('Putting your playbook together')
    expect(at('messaging-analysis', 5)).toBe('Checking your messaging')
    expect(stageLine(run([task('a', 'done', 1)]), titles)).toBeNull()
  })
})

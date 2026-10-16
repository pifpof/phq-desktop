import { describe, expect, it } from 'vitest'
import { checkScorecard, parseScorecard } from '../../src/shared/scorecard'
import { replaceEmDashes } from '../../src/main/research/postprocess'
import { GOOD_ANALYSIS } from './fixtures'

describe('scorecard', () => {
  it('reads five scores in order, normalising dimension names', () => {
    const scores = parseScorecard(GOOD_ANALYSIS)!
    expect(scores.map((s) => [s.dimension, s.score])).toEqual([
      ['Clarity', 3],
      ['Differentiation', 2],
      ['Customer focus', 3],
      ['Proof', 4],
      ['Consistency', 2]
    ])
    expect(scores[0].evidence).toBe('Homepage H1: "Human intelligence in the age of AI"')
    expect(checkScorecard(GOOD_ANALYSIS)).toBeNull()
  })

  it('explains each kind of problem, for the retry', () => {
    expect(checkScorecard('# Messaging Analysis')).toContain('must start with a ```json block')
    expect(checkScorecard('```json\n{ nope }\n```')).toContain('not valid JSON')
    expect(checkScorecard(GOOD_ANALYSIS.replace('"score": 4', '"score": 7'))).toContain(
      'whole-number score from 1 to 5'
    )
    expect(checkScorecard(GOOD_ANALYSIS.replace('"score": 4', '"score": 3.5'))).toContain(
      'whole-number'
    )
    expect(
      checkScorecard(GOOD_ANALYSIS.replace('"dimension": "Proof"', '"dimension": "Trust"'))
    ).toBe(
      'Entry 4 must be "Proof". The order is: Clarity, Differentiation, Customer focus, Proof, Consistency.'
    )
    expect(
      checkScorecard(GOOD_ANALYSIS.replace(/,\s*\{ "dimension": "Consistency"[^}]*\}/, ''))
    ).toContain('exactly five entries')
    expect(parseScorecard('nothing')).toBeNull()
  })

  it('cleans em dashes inside the JSON evidence and keeps it valid', () => {
    const md = GOOD_ANALYSIS.replace('Mostly about what we do', 'We do X — and Y')
    const cleaned = replaceEmDashes(md)
    expect(cleaned).not.toContain('—')
    expect(parseScorecard(cleaned)![2].evidence).toBe('We do X, and Y')
  })
})

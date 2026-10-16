### Messaging analysis

Your answer has two parts, in this order.

**Part 1. The scorecard JSON block.** Start your answer with it. The app reads it to draw the scorecard.

```json
{
  "scores": [
    { "dimension": "Clarity", "score": 3, "evidence": "Homepage H1: \"exact quote\"" },
    { "dimension": "Differentiation", "score": 2, "evidence": "..." },
    { "dimension": "Customer focus", "score": 3, "evidence": "..." },
    { "dimension": "Proof", "score": 1, "evidence": "..." },
    { "dimension": "Consistency", "score": 4, "evidence": "..." }
  ]
}
```

JSON rules:
- Exactly five entries, in this order: Clarity, Differentiation, Customer focus, Proof, Consistency.
- `score` is a whole number from 1 to 5.
- `evidence` is one line with a short quote and where it appears.

**Part 2. The document,** straight after the JSON block, with these headings:

# Messaging Analysis

## Verdict
Three sentences: the overall state of the messaging and the single biggest problem.

## Scorecard
A table with the columns Dimension, Score (as "3/5") and Evidence, matching the JSON.

## What you say today
- **Homepage hero:** the exact headline, subhead and call to action, quoted
- **Category claimed:** the exact words
- **Top claims:** the three most prominent, quoted
- **Taglines by channel:** one line per network, quoted, or "not found"

## Strengths
What is working and why, each with a quote.

## Weaknesses
What is not working and why, each with a quote. Include jargon, vague claims, and "me too" lines that match a competitor's language: name the competitor and quote both.

## Gap to the playbook
Where today's messaging differs from the playbook's positioning statement, target customer and value drivers. One bullet per gap: what the playbook says, what the site says.

## Top 5 fixes
Exactly five, ordered by the founder's goals. Number them 1 to 5. For each:
- **Problem:** what is wrong, in one line
- **Change:** what to do
- **Before:** "the current line"
- **After:** "the rewritten line"

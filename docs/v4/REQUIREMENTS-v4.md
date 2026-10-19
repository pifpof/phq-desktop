# PositioningHQ Desktop: v4 Requirements

**Version:** v4 (Positioning Playbook page redesign)
**Date:** 2026-10-19
**Owner:** Shahed Khalili, Parallel79°
**Builds on:** v3.1 (Make a change, regenerate preview). If v3.1 isn't merged, the "Make a change" button falls back to the v2 flow.
**Design reference:** Claude Design canvas "Playbook Tabs Concepts" (artboards B and C). Combination chosen by Shahed on 2026-10-19.
**Companion docs:** `IMPLEMENTATION_PLAN-v4.md`, `WIKI-FORMAT-SPEC.md` (additive change, section 7), `CLAUDE.md`

---

## 1. Why

From the 2026-10-19 beta test with Keith Cerny (Admire), on the current playbook page:

- "It's a lot to take in… I'm only halfway down the scroll." One long document with a left table of contents.
- "Put tabs… make them horizontal… then it doesn't feel like such a long scroll."
- "Have it where you can dump it out to PDF."
- "Very heavy on the words… give the brain a break."
- A visible bug: the value driver heading appears twice.
- His business idea: wherever the analysis shows a gap, show how to close it, as the moment for a services call to action.

## 2. What we're building (Shahed's decision)

| Element | Taken from |
|---|---|
| Step tabs: Overview plus the seven sections as numbered pills, with a progress bar | Concept B |
| **At a glance** overview as the first tab | Concept B |
| Section layout: title, reading time, **Key takeaways** box, body, Back and Next | B layout + C takeaways |
| **Gap to close** box with "Get expert help" and "Add to my plan" | Concept C |
| Right panel **This section** (confidence, sources, last changed, Open in Wiki, Make a change) and **Use it** (copy, ask Chat) | Concept C |

Plus: Export PDF, value driver and competitor detail as expandable cards (to cut the scroll), and the duplicate-heading fix.

### 2.1 Out of scope

- Redesigning the Wiki or Messaging Analysis pages (the Messaging Analysis scorecard improvements Keith asked for are a separate change).
- A priced, self-assembled services proposal ("that's a $7,800 engagement"). v4 collects the founder's chosen gaps and sends them as a request; pricing comes later once partners and packages exist.
- Editing text inside this page.

---

## 3. Page structure

```
┌ Header ───────────────────────────────────────────────────────────────┐
│ Positioning Playbook                         [Version 3 ▾] [Export PDF] [···] [Regenerate] │
│ Parallel79 · Version 3 · 18 Oct 2026 · Draft                          │
│ (★ Overview) (1 Market) (2 Customers•) (3 Value) … (7 Proof•)          │
│ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬░░░░░░░░░░░░░░░░░░  progress                    │
└───────────────────────────────────────────────────────────────────────┘
┌ Content (max 760px) ───────────────────────┐ ┌ Right panel (260px) ──┐
│ STEP 3 OF 7 · ABOUT 4 MIN READ             │ │ THIS SECTION          │
│ Value Drivers                              │ │ Confidence   Medium   │
│ ┌ KEY TAKEAWAYS ─────────────────────────┐ │ │ Sources      12       │
│ │ 1. …  2. …  3. …                       │ │ │ Last changed 18 Oct   │
│ └────────────────────────────────────────┘ │ │ Open in Wiki          │
│ Lede paragraph                             │ │ [Make a change]       │
│ Body / expandable cards                    │ ├───────────────────────┤
│ ┌ GAP TO CLOSE (when present) ───────────┐ │ │ USE IT                │
│ │ problem · next step                    │ │ │ Copy this section     │
│ │ [Get expert help] [Add to my plan]     │ │ │ Ask Chat about it     │
│ └────────────────────────────────────────┘ │ └───────────────────────┘
│ [Back]                       [Next: …]     │
└────────────────────────────────────────────┘
```

The left table of contents and the per-section "Source / Change" links from v2 are removed; the right panel replaces them.

At widths under 1100px the right panel moves below the content (stacked, same order). Under 820px (the app minimum) the step pills scroll horizontally.

---

## 4. Header

- Title "Positioning Playbook" (DejaVu Serif 700, 26px), metadata line (company · version · date · status) in muted 13px.
- **Version select** (dropdown of `output/positioning-playbook-v*.md`, newest first, "Current" label on the latest). Viewing an older version shows a banner: "You're viewing version 2. [View current]". Regenerate and Make a change are disabled on old versions.
- **Export PDF** (outline button, section 8).
- **More** menu (icon button `···`, `aria-label="More actions"`): Copy as markdown, Open in editor, Show in Finder, Reassemble.
- **Regenerate** (primary): opens the v3.1 regenerate preview for the playbook.

### 4.1 Step tabs (Concept B layout)

- A row of pills: **Overview** (star icon) then **1 Market, 2 Customers, 3 Value, 4 Advantages, 5 Positioning, 6 Competitors, 7 Proof**. Short labels come from `article-map.ts` (`stepLabel`); full titles appear in the section.
- Each pill: a 26px numbered dot plus label. States:
  - **Current:** teal-light 1px border, `#f0f7f8` fill, teal text 600, filled teal dot.
  - **Visited:** filled teal dot, ink text 500, no border.
  - **Not visited:** white dot with `#e4e4e1` border, muted number.
  - **Has a gap:** a small amber dot (`--warning`) after the label, with `aria-label="Has a gap to close"`.
- Visited state is remembered per workspace and version (app state). A new version resets it.
- Under the pills, a 4px progress bar (track `#e4e4e1`, fill teal) at `current step / 7`.
- ARIA tab pattern: `role="tablist"`, each pill `role="tab"` with `aria-selected` and `aria-controls`; Left and Right arrow keys move between tabs; Home and End jump.
- Deep links: other parts of the app (Wiki "Open in playbook", Chat citations, Messaging Analysis fixes) open the page on a given step: `playbook?step=value`.
- The last viewed step is remembered per workspace; opening the page returns there (Overview the first time).

---

## 5. Overview tab: At a glance (Concept B)

A one-screen summary built **without a model call**, from front matter and fixed article sections:

| Block | Content | Source |
|---|---|---|
| Eyebrow | "At a glance" | static |
| **Positioning statement** card (large serif text) | The one-sentence statement | `positioning-statement` article: its `summary`, or the first message variation if present |
| **Three value driver** cards | Serif numeral 01 to 03 (teal-light), driver title, one line | each `value-driver-*` article: title (prefix stripped) and `summary` |
| **Who it's for** | One or two lines | `ideal-customer-profile` `summary` |
| **Up against** | Competitor categories, or up to four names | `competitive-landscape` `summary` |
| **Biggest gap** (amber label) | One line, plus "See how to close it" linking to that section's gap box | Section 6.3 rule |
| Primary button | "Start with the market" | goes to step 1 |

- Missing data shows a muted placeholder ("Not generated yet") with "Generate" opening the regenerate preview; the overview never invents text.
- Clicking a value driver card goes to step 3 with that driver expanded.

---

## 6. Section tabs

### 6.1 Layout

1. **Eyebrow:** "Step N of 7 · about M min read" (M = words in the section / 200, rounded up, minimum 1).
2. **Title** (serif, 32px).
3. **Key takeaways** box: `#f0f7f8` fill, 12px radius, eyebrow "Key takeaways", an ordered list of exactly three short lines. Hidden if the section has none (older wikis; see 7.3).
4. **Lede:** the section's first paragraph, 17 to 18px muted.
5. **Body:** the rest of the section, with these renderings:
   - **Value Drivers:** one expandable card per driver. Collapsed: numeral, title, one line. Expanded: the seven parts (challenge, status quo, cost of inaction, advantage, future state, proof, discovery prompts). First card expanded by default.
   - **Distinct Advantages:** one expandable card per moat, same pattern.
   - **Competitive Intelligence:** landscape overview first, then one expandable card per competitor (name, category term, win story when collapsed).
   - **Positioning Statement:** the six-field statement as a two-column definition table, then the three message variations as cards with a "Copy" button each.
   - Other sections: rendered markdown, with tables kept.
6. **Gap to close** box (when the section has a gap, section 6.3).
7. **Back** (secondary) and **Next: <next section title>** (primary) buttons. On step 7, Next reads "Back to overview".

Content column max 760px, left-aligned (Keith: "people read from left to right").

### 6.2 Right panel: This section and Use it (Concept C)

**This section** card:

| Row | Value |
|---|---|
| Confidence | High, Medium or Low (from the source article; Low in amber) |
| Sources | Count of raw sources across the section's source articles; clicking opens the Wiki Sources tab filtered to them |
| Last changed | The newest `updated` among the section's source articles |
| Changes waiting | Only when v3.1 pending changes exist for its articles: "2 waiting", linking to the Changes tab |

Then **Open in Wiki** (link to the source article; for multi-article sections, the parent article: Value Drivers, Moats, Competitive Landscape) and **Make a change** (outline button; opens the v3.1 dialog preselected to this section's article).

**Use it** card:

- **Copy this section** (markdown of the section only, to the clipboard; toast "Copied").
- **Ask Chat about it** (opens Chat in workspace mode with the section's article loaded and an empty composer with the placeholder "Ask about Value Drivers…").

### 6.3 Gap to close (Concept C)

A section shows a gap box when its source article has a **Gap to close** section (7.1). The box:

- Amber-tinted (`--warning-bg`, 1px `#e4c9a3` border), eyebrow "Gap to close" in `--warning`.
- **Problem** (one or two sentences) and **Next step** (one concrete action that moves it up one level).
- If the section maps to a Messaging Analysis scorecard dimension (`article-map.ts` `scoreDimension`: Proof → Proof, Customers → Customer focus, Positioning → Differentiation), show a chip "Messaging score: Proof 1 of 5" linking to the analysis. No other numeric scores are shown or invented.
- Buttons: **Get expert help with this** (primary) and **Add to my plan** (outline). Section 9.

**Biggest gap** (overview) rule: if a Messaging Analysis exists, the section mapped to its lowest-scoring dimension that has a gap; else the first gap in this priority order: Proof, Positioning, Customers, Value, Advantages, Competitors, Market.

---

## 7. Data: takeaways and gaps

### 7.1 Article format addition (additive; `WIKI-FORMAT-SPEC.md`)

The six playbook section articles that exist in the spec (`market-overview`, `ideal-customer-profile`, `value-drivers`, `positioning-statement`, `competitive-landscape`, `proof-points`) may carry two optional body sections, placed right after the abstract line:

```markdown
## Key takeaways

1. <one line, at most 12 words>
2. <one line>
3. <one line>

## Gap to close

**Problem:** <one or two sentences grounded in this article's sources>
**Next step:** <one concrete action that would move this up one level>
```

- Exactly three takeaways when present. No gap section when the evidence shows no clear weakness.
- Note on Distinct Advantages: there is no parent moats article in the spec; its takeaways and gap live in the playbook output only (7.2), generated with the moat articles' task.

### 7.2 Playbook output

Assembly (deterministic, no model) copies each section's **Key takeaways** and **Gap to close** into the assembled `output/positioning-playbook-v<N>-<date>.md` under each section's H2, using the same headings, so old versions render correctly and the markdown still reads well for any LLM. The page renders from the output file (so the version selector works) plus live metadata from the source articles for the right panel.

### 7.3 Generating them

- The playbook section tasks (v2 T13 to T19) gain two structured-output fields: `takeaways: [string, string, string]` and `gap?: { problem, nextStep }`. Prompt rules: takeaways must be supported by the article body; a gap only where sources show a weakness (low confidence, missing proof, an over-broad ICP, unclear differentiation); never invent scores or figures. These are app prompt additions in the prompt builder, not edits to vendored skill-pack files.
- **Existing wikis** (no takeaways yet): the page shows a slim banner above the tabs: "Add key takeaways and gaps to this playbook. Uses your AI provider, about $0.10." The action runs one small no-web task over the seven section articles (structured output, takeaways and gaps only, body untouched) through the v3.1 regenerate preview and review. Until then, takeaways boxes and gap boxes are hidden and the overview's Biggest gap block is hidden.
- Private sources: takeaways and gaps can cite private material, so they follow the same `private` tag rules; the Export PDF and Copy actions respect the private warning (section 8).

### 7.4 The duplicate heading bug

The assembled playbook currently repeats "Value Driver" headings (article H1 plus the section template heading). Assembly must drop an article's H1 when it equals or prefixes the section's own heading, and strip the "Value Driver:" and "Moat:" prefixes inside cards. Add a golden-file test.

---

## 8. Export PDF

- **Export PDF** renders a print layout and saves via the system save dialog (default name `PositioningHQ-Playbook-<Company>-v<N>.pdf`).
- Print layout: cover (company, "Positioning Playbook", version, date), the At a glance overview, a table of contents, then all seven sections in order with takeaways and gap boxes; value driver, moat and competitor cards printed expanded; page breaks before each section; footer with page numbers and "Generated with PositioningHQ · positioninghq.com", where positioninghq.com is a live link (decided 2026-10-19) to `https://positioninghq.com/?utm_source=phq-desktop&utm_medium=pdf`. The cover also carries the link.
- Brand typography and colours (DejaVu Serif headings, Inter body, teal accents), A4 or Letter by system locale, with a choice in the save step.
- Options in a small dialog before saving: **Include gaps** (on), **Include private material** (on, with the note "This playbook includes content from your own files. Turn this off before sharing outside your company." when any section is `private`; turning it off omits private-tagged sections' bodies and shows "Private section omitted").
- Implementation: a hidden window loads the print view and uses Electron's print-to-PDF; nothing leaves the machine.

---

## 9. Get expert help and Add to my plan

The free tool's job is leads (v0 business model). The gap box is where a founder is most aware they need help.

- **Add to my plan** adds the gap to a **Help plan** stored in app state (not the wiki). A header chip appears: "Help plan 2". Clicking it opens a side sheet listing chosen gaps (section, problem, next step) with Remove, and a primary **Ask for help with these**.
- **Get expert help with this** opens the same sheet with this gap added and preselected.
- **Ask for help with these** opens the hosted request form in the browser, prefilled with: company name, the user's name and email if given in onboarding, and the selected gaps (section and problem only, never private body text). The app itself sends nothing (same rule as the v1 updates sign-up). The form URL lives in `src/shared/links.ts` as `helpRequestUrl = "https://positioninghq.com/expert-help"` (decided 2026-10-19; always https) and `positioninghq.com` must be on the external-link allowlist. The link format is defined in `EXPERT-HELP-PAGE-REQUIREMENTS.md` section 2: non-personal attribution in the query string (`utm_source=phq-desktop`, `utm_medium=app`), and personal details and gaps in the URL **fragment** (`#company=…&name=…&email=…&sections=…&gaps=…&v=…`), so they never reach server logs or analytics. Keep the whole URL under 2,000 characters.
- If the prefilled text would exceed the form's URL limit, include the section names only and add "Details: paste from the app" plus a **Copy details** button in the sheet.
- Log nothing to the wiki; record `helpRequested` with a timestamp in app state for the founder's own reference.

---

## 10. Accessibility and visual

- All controls are real buttons and links; focus rings per the design system; tab pattern per 4.1.
- Amber (`--warning #a15c07` on white, 4.5:1 or better) for gap labels; never colour alone (gap dots have labels, gap boxes have a heading).
- Cards and boxes follow existing radii (cards 12px, boxes 12px, overview statement card 16px).
- Reduced motion: no animated progress bar.
- No em dashes in UI strings or generated takeaways and gaps.

---

## 11. Acceptance criteria

1. The left table of contents is gone; the page shows the header, step pills with progress bar, content column and right panel as in section 3.
2. Step pills show current, visited, not visited and gap states; arrow keys switch tabs; the last viewed step is remembered.
3. The Overview shows the statement, three value driver cards, who it's for, up against and biggest gap, all from front matter with no model call; missing pieces show "Not generated yet".
4. Each section shows step count and reading time, a three-item Key takeaways box (when present), lede, body, and Back and Next.
5. Value drivers, moats and competitors render as expandable cards; the first value driver is expanded by default.
6. The right panel shows confidence, sources (opens filtered Sources tab), last changed, Open in Wiki and Make a change; Use it copies the section and opens Chat with the section loaded.
7. Sections with a gap show the gap box; mapped sections show the messaging score chip; Biggest gap follows the 6.3 rule.
8. Add to my plan and Get expert help build a Help plan; Ask for help opens the prefilled form in the browser and sends nothing from the app; no private body text is included.
9. A new research run produces takeaways for all seven sections and gaps only where justified; an existing wiki can add them via the banner, through the regenerate preview and review.
10. Takeaways and gaps appear in the assembled markdown output under each section; older versions without them still render.
11. The value driver heading appears once.
12. Export PDF produces a branded PDF with cover, overview, contents and all sections, expanded cards, page numbers; the private-material option works.
13. The wiki still passes `llm-wiki lint --fail-on warning` after generation and backfill.
14. No em dashes in new UI strings or generated takeaways and gaps. CI green.

---

## 12. Open items (owner: Shahed)

| # | Item | Needed before |
|---|---|---|
| 1 | ~~Help request URL~~ Decided: `https://positioninghq.com/expert-help`. Still needed: that page live, with a form that reads the `company`, `name`, `email`, `sections` and `gaps` query parameters | Phase 5 |
| 2 | Confirm the scorecard mapping (Proof, Customer focus, Differentiation) for the gap chip | Phase 3 |
| 3 | ~~PDF footer link~~ Decided: link to positioninghq.com on the cover and in the footer | Done |

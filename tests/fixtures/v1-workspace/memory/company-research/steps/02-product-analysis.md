---
title: Product Analysis
task: research-02-product
run_id: 20261016-145921-290b
model: claude-sonnet-5-5
created: '2026-10-16T21:59:56.713Z'
status: draft
inputs: []
sources:
  - 'https://acme-advisory.example/'
  - 'https://acme-advisory.example/10x-ai-operating-system/'
  - 'https://product.example/'
  - 'https://www.linkedin.com/in/samrivera/'
  - 'https://github.com/topics/ai-chief-of-staff'
  - 'https://www.producthunt.com/categories/ai-chief-of-staff'
---
# Product Analysis

**Scope note:** The company profile does not say what Acme Advisory sells. This analysis is built from the public website and linked pages. Pricing, customer counts and usage data are not available. Only the 10x Employee product page was read in full. The other product pages were not reviewed, so their descriptions come from the home page.

## Offerings

**Company shape:** Acme Advisory is a solo advisory practice led by Sam Rivera that also ships productized tools and workshops. The site navigation splits the business into Advisory, Products and Workshops. The home page describes this as "advisory, products and workshops for product, growth and AI."

**1. Advisory (three lines)**
- **Product:** Product management discipline for SaaS startup founders. It covers a clear strategy, an outcome-tied roadmap and evidence that customers will pay before building.
- **Growth:** Product-led growth and go-to-market strategy for revenue leaders. It covers positioning buyers understand, a product that sells itself where it can, a sales team equipped where it can't, and win/loss analysis.
- **AI:** AI transformation for small and medium businesses.

**2. Products ("tools built from real engagements")**

| Product | What it is | Price signal |
|---|---|---|
| 10x Employee | An AI operating system that amplifies every employee. | Free do-it-yourself playbook and plugin, or white-glove service at custom pricing. |
| Private AI | AI that runs inside your office, so client data stays there. | Not available |
| AI Chief of Staff | Marked Free. It knows your priorities, projects and people, and opens every session with a brief. | Free |
| AI Use Policy Generator | Marked Free. Answer a few questions to get a one-page AI use policy, approved tools list, vendor checklist and team rollout. | Free |
| Sales Enablement Automation | Turns your positioning into a playbook, battlecards and call plans reps will use. | Not available on the home page |

**3. Workshops**
- **AI Accelerator:** Two days for CEOs and founders. Attendees leave with a practical AI roadmap built with peers and two guides. It runs by application, with dates to be announced.
- **Executive AI Fluency:** Three hands-on sessions for leadership teams. Each leader builds an AI chief of staff and second brain.

**4. PositioningHQ (related offering)**
- PositioningHQ is described as a Acme Advisory offering.
- It is run as a workshop. Its page is titled "The Positioning Playbook Workshop for Revenue Teams" and the headline is about winning more deals with Claude and a positioning playbook.
- One listing shows a Maven cohort format.
- The home page links "Sales Enablement Automation" to the `/positioninghq/` path, so the two appear to be the same offering. This is an inference.

**5. Newsletter:** A newsletter sits at inhouse.build. Content and cadence were not reviewed.

## Key Features

**10x Employee (the only product page reviewed in full)**
- **Company "Brain":** Business knowledge lives in plain files the customer owns, as markdown in GitHub, split into everyone, department, private and shared skills.
- **Per-hire AI agent:** Every new hire gets an agent that already knows the business. The pitch is "useful in week two, not month four."
- **Daily brief and update:** A brief lists meetings with context, open promises and an agenda. The daily team update is drafted from short answers.
- **Sourced answers:** Answers show the approved source. If nobody wrote it down, the agent says so and names who to ask.
- **Human-approved learning:** Agents can suggest additions to the Brain, and a person approves them.
- **Access guardrails:** Each agent sees only what its person can see, and nothing leaves the company without a person.
- **Delivery model:** An eight-week program: design in week 1, build in weeks 2 to 5, train in weeks 6 to 7, hand over in week 8.
- **Acceptance test:** The "Day-One Test": a newcomer is set up within an hour, and their agent correctly answers ten typical new-hire questions.
- **Target buyers:** Small business owners, CEOs of growing companies and startup founders.

**Other products:** Feature detail is limited to the one-line descriptions in the table above. Detailed features for Private AI and the other tools are not available.

## Tech Stack

- **Model-agnostic design (10x Employee):** Each job runs on whichever AI model does it best or cheapest, and all read the same Brain. Changing models loses nothing.
- **Illustrative model mix on the page:**
  - Grok agents on xAI's cloud for the daily brief, check-in update and meeting coordination.
  - Claude agents on Anthropic's cloud for onboarding, Ask and Teach the Brain, and the sales kit.
  - Open-weights agents on the customer's own server for meeting notes and the weekly digest, with no per-use fees.
  - The page labels this as illustrative. Models are picked with the customer in week one.
- **Storage and delivery:** Plain markdown in GitHub. The do-it-yourself option is delivered as a playbook and a plugin.
- **Integrations:** The onboarding skill connects email, calendar, the Brain and a private password vault.
- **PositioningHQ:** Built around Claude. The methodology draws on April Dunford's positioning principles and Jobs to Be Done, with an AI layer added.
- **Site tooling:** Google Tag Manager is present. Booking runs through cal.com.
- **Not available:** The website's own framework and hosting, plus any proprietary code beyond the plugin and playbook.

## Evolution

Dates are not published. The evidence below is a snapshot comparison, not a dated timeline.

- **Earlier positioning (search snippet of the same domain):**
  - "AI consulting practice helping executives and their organizations lead AI transformation."
  - Three disciplines: AI transformation and change leadership, AI sales enablement and automation, and AI compliance and ISO 42001.
  - The headline was "Define Your North."
  - The "3 practice disciplines" were listed as AI Sales Enablement, AI Governance and AI Chief of Staff.
- **Current positioning (fetched page):**
  - The page title is "Human Intelligence for AI-Enabled Product & Revenue Leaders."
  - The framing is the "build trap": AI has lowered the cost of building and raised the risk of building the wrong thing.
  - The structure moved from a governance-led consultancy to advisory plus products plus workshops.
  - ISO 42001 is not mentioned in the fetched page text. ISO 42001 certification appeared on the earlier version.
- **Shifts observed:**
  - The audience widened from executives to product founders, revenue leaders and SMB owners.
  - Reusable products appeared ("tools built from real engagements"), with several marked Free.
  - Workshops were added.
  - The founder's own writing points to the market thesis. A May 2026 LinkedIn post says mid-market executives are cancelling SaaS subscriptions and building AI capabilities in-house.
- **Founder background used as proof:** 25 years building business software companies, VP of Product at Galvanize through a $1B exit, and Chief Product & Technology Officer at Boast AI. The home page says 25 years. Older and other pages say 20 years, and this inconsistency is worth fixing. The company profile gives the founder as Sam.
- **Not available:** Launch dates, version history and retired offerings.

## UVP

**Stated value proposition:** "Hands-on advice from someone who has run the function." The company helps build "solutions that sell and stick."

**What appears distinctive (analyst view):**
1. **Operator-led, solo practice.** Advice comes from a former product executive who "still builds AI agents himself."
2. **Tools born from client work, often free.** This lowers the barrier to trying the practice and doubles as lead generation.
3. **Owned, model-agnostic architecture.** The customer owns the plain-file Brain, and models can be swapped without lock-in. This is the strongest technical differentiator on the pages reviewed.
4. **Privacy and governance as design principles.** Examples are Private AI, access-scoped agents, human approval and an audit trail.
5. **Positioning and sales enablement depth.** This comes from PositioningHQ and the "Growth" advisory line. It is the area closest to the founder's goals for this wiki.

**Gaps and risks to resolve in the positioning work:**
- **Too many offers.** The site lists three advisory lines, five products and two workshops, all run by one person. There is no single clear "what we sell" in the profile either.
- **Inconsistent audience and claims.** Audiences include founders, revenue leaders, SMBs and executives. Founder tenure is stated as both 25 and 20 years.
- **No proof points.** The pages reviewed show no named customers, results or pricing, and none of the 10x Employee FAQ answers are visible.
- **Crowded category.** Open-source AI chief-of-staff projects and product directories already exist. GitHub lists public AI chief-of-staff repositories built on Claude Code and Obsidian. Product Hunt has an AI Chief of Staff category. A free chief-of-staff tool is unlikely to differentiate on its own.

**Assumptions:** The current website text is treated as the company's own description of its offerings. No named competitors were provided, so none are analysed here.

## Sources

- [Acme Advisory | Human Intelligence for AI-Enabled Product & Revenue Leaders](https://acme-advisory.example/)
- [10x Employee | Acme Advisory](https://acme-advisory.example/10x-ai-operating-system/)
- [PositioningHQ, The Positioning Playbook Workshop for Revenue Teams](https://product.example/)
- [Sam Rivera - Acme Advisory](https://www.linkedin.com/in/samrivera/)
- [ai-chief-of-staff · GitHub Topics · GitHub](https://github.com/topics/ai-chief-of-staff)
- [AI Chief Of Staff - Top Picks for 2026](https://www.producthunt.com/categories/ai-chief-of-staff)

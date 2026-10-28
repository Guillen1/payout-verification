# How this was built with AI

This project was researched, designed and built by one engineer working with an AI coding agent
(Claude Code). This folder records how: what the AI did, what the human decided, how claims were checked,
and where the AI got things wrong.

The short version: **the AI researched, drafted and wrote code; the human chose the problem, set the
constraints and approved each step; nothing was accepted without a check that did not depend on the AI's
word for it.**

| Document                                                           | What it covers                                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| This page                                                          | The process end to end, phase by phase                                                     |
| [research/portfolio-scan.md](research/portfolio-scan.md)           | The 27 current portfolio companies and the workflows considered at each                    |
| [research/independent-reviews.md](research/independent-reviews.md) | Three independent agent reviews of the shortlist and how their disagreements were resolved |
| [decision.md](decision.md)                                         | The problem chosen, why, the scope and the open questions                                  |
| [build-log.md](build-log.md)                                       | One entry per milestone: what was built, decisions, verification                           |

## Timeline

| Date       | Phase                                         | Output                                                                |
| ---------- | --------------------------------------------- | --------------------------------------------------------------------- |
| 2026-10-27 | Understand the assignment, scan the portfolio | List of current companies and candidate workflows                     |
| 2026-10-27 | Shortlist and score                           | Six ideas scored on five criteria                                     |
| 2026-10-27 | Independent reviews and synthesis             | Three agent reports, one decision memo                                |
| 2026-10-28 | Design                                        | `docs/design.md`, reviewed as a system design                         |
| 2026-10-28 | Build, milestone 1                            | Domain core, CSV extraction, synthetic data with answer key, demo CLI |

## Phase 1: Understand the assignment and scan the portfolio

**The ask:** choose one current portfolio company, find an operations or finance workflow worth
automating with AI, build something production-ready, and explain how you would know it stopped working
and how it would adapt to a second company.

**What the AI did**

- Downloaded the firm's portfolio page and found that each company's status, sector, fund and
  description sat in a JSON blob inside the page. It parsed that instead of reading logos, which gave an
  exact list of the 27 companies marked Current.
- Searched trade press, press releases, company sites and job postings for each plausible candidate.
- Drafted a table of every current company with the manual workflow an AI build would meet first.

**Checks that caught errors**

- Earlier notes listed one company as current. The parsed page marks it Realized, so it was dropped.
- One target company's own site failed to load in some tools (it renders with JavaScript). Claims that
  depended on it were marked unverified until a direct fetch of its blog succeeded.

## Phase 2: Shortlist and score

The AI proposed six ideas and scored each on five questions:

1. Is the pain real and named at that company, or only inferred from the industry?
2. Can it be built credibly on synthetic data, with no access to the company?
3. Does a "how would we know it stopped working" story follow naturally?
4. Does it port to a second portfolio company?
5. Does the builder know the domain well enough to judge production-ready?

The first pick was carrier commission statement reconciliation at an insurance agency network.

## Phase 3: Independent reviews, then a synthesis

A single AI pass tends to confirm its own first answer. To counter that, three agents were run in
parallel with deliberately different briefs, and none saw the others' work:

| Agent      | Brief                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------- |
| Skeptic    | Attack the shortlist. Look for evidence the problem is already solved or not real.                                  |
| Evaluator  | Read the shortlist as the person who will judge the submission: business case, red flags, what would be convincing. |
| Researcher | Ignore the shortlist. Research all 27 companies from scratch, form an independent view, and only then compare.      |

A fourth agent then read all three reports and wrote one decision memo, resolving each disagreement and
saying where the deciding factor was evidence and where it was judgment.

**What changed because of the reviews**

- **The workflow was reframed.** The skeptic found that statement-to-system matching is already sold by
  the major agency software vendors and partly built into the agency management system itself. The
  evaluator, independently, pointed at contingent bonus (profit-sharing) programs as the largest and least
  covered money. The build became payout verification across the network, with bonus verification as a
  stage of its own.
- **The second-company example changed.** Two agents independently noted that the original example
  (healthcare remittances) uses a public standard file format, so it would not demonstrate the
  many-formats problem. It was replaced by retailer deductions at a consumer brand, which has the same
  shape as carrier statements.
- **A candidate was added.** The researcher found live job postings that describe a manual inspection
  compliance workflow at a company the shortlist had marked "no public evidence".
- **The strongest alternative was kept, not discarded.** The researcher ranked a healthcare documentation
  workflow first on evidence. It lost on buildability, not on merit, and that judgment is written down
  as such.

**Where the agents disagreed with the facts, the facts won.** The orchestrating session had already
fetched a page two agents could not load, and had confirmed vendor product releases one agent could not.
Those facts were passed to the synthesis as overrides, with their sources.

Details: [research/independent-reviews.md](research/independent-reviews.md).

## Phase 4: The human decisions

The AI recommended. The human decided:

- **The company.** Chosen because the builder has worked in insurance distribution and can judge whether
  a finance workflow there is really production-ready. The second-company tenant is how the build shows
  the approach is not specific to insurance.
- **What to ask before building.** The first message to the firm was kept generic: timeline, delivery
  format, and whether real inputs or an operator conversation were possible. It named no company until
  the research settled.
- **What not to do.** No CQRS or heavy patterns. Code a new reader can follow. Synthetic data only, with
  nothing from any employer.

## Phase 5: Design as a system design

Before any code, the AI drafted [`docs/design.md`](../design.md) in the form of an architecture review:
goals and non-goals, assumptions and what changes if each is wrong, where the model is and is not
allowed, correctness controls, monitoring with thresholds and owners, failure modes, alternatives
considered, and milestones with a cut line.

One requirement shaped the whole design: the code must be production-grade but run as a local demo. The
answer is one codebase where every external dependency (file source, policy system, model, alerts,
storage, clock) sits behind an interface, with demo and production implementations of each.

## Phase 6: Build

The build follows the milestones in the design doc. Each milestone is logged in
[build-log.md](build-log.md).

**How the work was split**

- The human set conventions (the same lint, format and naming rules as the builder's other repositories)
  and the constraint that the code must read cleanly to someone new.
- The AI wrote the code, the tests and the documentation, and ran the checks after every step.
- The human reviews each milestone before it is committed.

**Verification that does not trust the AI**

- **The test data does not grade itself.** The synthetic generator writes each carrier's file by hand and
  computes commissions with its own arithmetic, separate from the code under test. If the domain logic
  had a bug, the generator would not share it.
- **Every planted problem has an expected answer.** The generator writes an answer key, and an
  end-to-end test checks every line's finding and matched policy against it, on several random seeds.
- **Money is checked by invariant.** The code refuses to finish a statement unless agency share plus
  network share plus held money equals what the carrier paid.
- **Typecheck, lint, format and tests run in CI** on every push.

## What the AI got wrong, and how it was caught

| What happened                                                                               | How it was caught                                                                      |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Earlier notes listed a realized investment as current                                       | Parsing the portfolio page's own data                                                  |
| Two agents could not load the target company's site and called a claim unverified           | The orchestrator had fetched the page directly and passed the fact on, with its source |
| A trade-press figure was restated more broadly than the source said                         | The researcher re-read the source and corrected the scope                              |
| The package manager pulled a TypeScript major version the lint tooling does not yet support | Pinned to the previous major after checking compatibility                              |
| A type that silently widened to `string`                                                    | Lint rule `no-redundant-type-constituents`                                             |
| A six-argument helper and a string trick that built table rows                              | Reviewed for readability before the first commit and rewritten                         |
| Vendor statistics (leakage rates, hours saved) presented as fact                            | Labeled as vendor claims wherever they are used                                        |

## Rules followed throughout

- Every factual claim about a company has a source, and vendor marketing is labeled as such.
- No real customer data, carrier rates or employer code anywhere in the repository.
- The model never computes money. In the product, and in how it was built, numbers come from code that
  can be tested.

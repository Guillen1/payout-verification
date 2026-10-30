# Build log

One entry per milestone: what was built, the decisions made along the way, and how it was verified.

## Milestone 1: Domain core and CSV statements (2026-10-28)

**Built**

- Money as integer cents and rates as basis points; effective-dated rate and split rules.
- Config-driven CSV extraction, one YAML file per carrier layout, with a header check that holds a
  statement whose layout changed.
- Tie-out to the printed total, matching by policy number then by insured name and effective date,
  exactly one finding and disposition per line, detection of policies never paid, and allocation that
  conserves every cent.
- A seeded synthetic data generator with an answer key, two carrier layouts, a finance report and payout
  files from a demo CLI.

**Decisions**

- No database yet. The domain is pure functions so it can be tested in isolation; persistence arrives
  with the pipeline in milestone 2.
- A line whose premium disagrees with the book is held, not paid, because either side may be wrong.
- Ambiguous matches are reported, never picked.
- The generator renders carrier files by hand and computes commissions with its own arithmetic, so the
  pipeline is never graded against data it produced.
- TypeScript pinned to 5.9 because the lint tooling does not yet support version 7.

**AI and human**

- The human set the constraints: strict lint and format rules, no CQRS, code a new reader can follow.
- The AI wrote the code, tests and docs, running typecheck, lint and tests after each step.
- Found and fixed before the commit: a type that silently widened, a six-argument helper, and a
  hard-to-read string trick in the report.

**Verified**

| Check                         | Result                              |
| ----------------------------- | ----------------------------------- |
| Typecheck, lint, format       | Pass                                |
| Unit and end-to-end tests     | 74 pass                             |
| Every line vs. the answer key | Exact match on seeds 42, 7 and 2026 |
| Layout change on one carrier  | That carrier held, the other closes |
| Missing statement             | Reported, the other carrier closes  |

## Milestone 2: AI reading (2026-10-29)

**Order change.** The human moved the AI steps ahead of the database work, so that a submission cut
short still shows the model doing the reading the work depends on.

**Built**

- A model layer with one interface. Claude is called through structured outputs, so every answer is
  validated against a schema before code sees it. Server-side fallbacks retry a declined request on
  another model. Every call is metered for tokens, latency and estimated cost.
- Record and replay. Answers are saved under `recordings/`, keyed by the model, the instructions and
  the exact inputs, so the demo and CI run without a key, and a changed prompt never replays a stale
  answer.
- PDF statements. A third carrier sends a two-page PDF with page subtotals and "CR" credits. Claude
  transcribes it; the same code that reads a CSV then maps codes, parses values and ties out.
- Proposals for changed layouts. When a CSV's headers change, Claude proposes a new mapping. Code
  checks that the proposal reads every line and ties out to the cent; a person approves it by copying
  it into the tenant config.
- Evals, separate from tests. Tests use a stand-in model that answers from the answer key, so they
  check everything around the model deterministically. `pnpm eval` measures the real model on three
  PDF statements and three layout changes, with floors.

**Decisions**

- The model transcribes; it does not interpret. Codes are mapped and amounts parsed by code, so a PDF
  and a CSV from the same carrier are held to identical rules.
- A model failure, a refusal or a missing recording holds that one carrier. The others still close.
- A proposal is never applied automatically.
- The demo PDF is byte-identical on every run, which is what makes recordings replayable.

**AI and human**

- The human chose the order change and the "buy, build, adopt" framing.
- The AI read the current SDK reference before writing model code rather than relying on memory,
  and checked the exact SDK names in the installed package.

**Verified**

| Check                                                                 | Result                                              |
| --------------------------------------------------------------------- | --------------------------------------------------- |
| Typecheck, lint, format                                               | Pass                                                |
| Unit and end-to-end tests                                             | 93 pass                                             |
| Every line on all three statements vs. the answer key, stand-in model | Exact match on seeds 42, 7 and 2026                 |
| A misread PDF amount                                                  | Statement held, does not tie out                    |
| No model available                                                    | PDF carrier held, the CSV carriers close            |
| Changed layout                                                        | Held, with a verified proposal                      |
| Real model evals                                                      | **Not yet run: needs an API key to record answers** |

## Restructure: NestJS modules, fewer classes (2026-10-29)

**Why.** The human found the model code hard to read: five wrapper classes for two model calls.
The human also asked for a conventional NestJS layout, without CQRS.

**Changed**

- The app is a NestJS command line (`seed`, `reconcile`, `eval`) laid out by module, with `domain/`,
  `application/`, `infrastructure/`, `cli/` and `tests/` folders, abstract classes as DI tokens and
  config validated at startup.
- The five model wrappers became one Claude client with recordings built in, plus a stand-in for
  tests. Services return the model's usage with their result, so nothing has to collect it on the
  side.
- Faker replaced the hand-written random generator, name lists and policy factory.
- The money rules did not change. They moved into `reconciliation/domain/` as the same plain
  functions.

**Mistakes caught**

- The AI read "no CQRS" as "no NestJS" and argued against the framework. The human corrected it.
- A first draft of the outcome types was hard to read; it was replaced with one explicit list.
- After the move, a failing command still exited with code 0, which CI would read as a pass. Found by
  running `eval` without recordings and checking the exit code.

**Verified**

| Check                                                                        | Result                         |
| ---------------------------------------------------------------------------- | ------------------------------ |
| Typecheck, lint, format                                                      | Pass                           |
| Tests, including the real Nest module end to end with only the model swapped | 92 pass                        |
| `seed`, `reconcile` and `eval` built and run through Nest                    | Work; a failure exits non-zero |

## Model choice: Sonnet by default, Opus on retry (2026-10-29)

**Why.** The human asked whether the largest model was needed. It was not: the model transcribes
statements and proposes column mappings, and code checks every answer before it reaches money. The
AI had picked Opus by default without measuring whether the task needed it.

**Changed**

- The default model is Sonnet. A PDF reading that does not tie out is retried once on Opus; whatever
  Opus reads still has to tie out, or the statement is held.
- The run report and the eval show which model read each statement, and the eval counts retries. A
  rising retry count is an early sign of a format or model problem.
- Both models are set in `.env` (`MODEL_NAME`, `MODEL_ESCALATION_NAME`).

**Verified**

| Check                                                                           | Result  |
| ------------------------------------------------------------------------------- | ------- |
| Typecheck, lint, format                                                         | Pass    |
| Tests, including a reading that ties out only on retry, and one that never does | 95 pass |

## First recorded evals (2026-10-29)

The real models were run against the answer key for the first time: three PDF statements (one per
seed) and three layout changes.

| Model                        | Fields read correctly | Ties out | Findings correct | Proposals verified | Retries | Cost  |
| ---------------------------- | --------------------- | -------- | ---------------- | ------------------ | ------- | ----- |
| Sonnet (default)             | 627/627               | 3/3      | 78/78            | 3/3                | 0       | $0.12 |
| Opus (comparison, not saved) | 627/627               | 3/3      | 78/78            | 3/3                | n/a     | $0.25 |

Both meet every floor, and Sonnet does it at half the cost, which supports the default. The test set
is small and synthetic, so this shows the approach works rather than proving accuracy on real
carriers; real statements and overrides are what the eval set grows from.

The Sonnet answers are committed under `recordings/`. The demo now closes all three carriers without
a key, and CI runs the eval in replay mode on every push, so a prompt or schema change that breaks a
recorded answer fails the build.

## Milestone 3: Bonus verification and dispute drafts (2026-10-29)

**Built**

- Agreement to rules. Claude reads a profit-sharing agreement PDF into rules: eligible lines, minimum
  premium, loss ratio bands, cap, each with its clause number. Terms the rules cannot express come back
  as notes, printed at the top of the proposed file for the reviewer. Code converts amounts and rates
  and rejects a wrong year, unknown products and bands out of order.
- Approval tied to the document. Approved rules carry the agreement's SHA-256. A changed agreement
  stops the run and drafts new rules instead of applying old terms.
- Expected bonus by code, from the network's own production records, with a trace that cites a clause
  for every step.
- Statement check: per-agency premium against the network's records, the loss ratio recomputed from
  the carrier's own totals, and the rate checked against the band.
- The split of what was paid between the network and agencies, by largest remainder, to the cent.
- Draft dispute letters for bonuses and, now, for commission statements: underpaid lines and missing
  commissions per carrier.
- Demo data with two planted errors: an agency's premium left out, and a loss ratio exactly on a band
  boundary paid at the next band's rate. The generator does its own math, separate from the module.

**Decisions**

- Premium comes from the network's records; earned premium and losses from the carrier, because only
  the carrier has them. The report says which figures are whose.
- The model does not write dispute letters. A template filled from the results keeps every figure
  exact; the model would add risk and no information.
- What was paid is split now; a recovered underpayment is split the same way when it arrives.
- Growth tiers are left for later and named in the design; the demo agreement has none.

**AI and human**

- The human said to start the milestone.
- The AI checked the model's first draft against the PDF clause by clause, then saved it as the
  approved rules for the demo. In a real deployment that approval is a finance person's job.

**Verified**

| Check                                                           | Result                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------- |
| Typecheck, lint, format                                         | Pass                                                    |
| Tests, including the real Nest module end to end on three seeds | 133 pass                                                |
| Demo bonus run vs. the answer key                               | Expected $42,546.11, paid $14,901.95, both errors found |
| Agreement reading eval (Sonnet), three agreements               | Every rule and clause correct; about $0.035 total       |
| Eval and bonus run in replay mode with no key                   | Pass                                                    |

## Code review before submission (2026-10-29)

**How.** A structured review of the whole repository: every file read in full before a claim that
something is missing, each finding tied to a `file:line`, ranked critical, major, minor or question,
and a hard stop on tests that only restate configuration. Critical and major findings were fixed
before committing; minor ones and a question were left for the human.

**Fixed**

- A tenant-loading test asserted the values typed in the config files. It now tests what the loader
  promises: a bad value names its file and row, a format tied to the wrong carrier is refused, and an
  empty end date means no end.
- The bonus answer key used the domain's own rounding function, so a bug there would have been baked
  into the expected values. The generator now uses its own math, as the commission generator does.
- A malformed carrier CSV was reported as "model unavailable", which would send someone to chase the
  model provider. It is now "could not be read: not a valid CSV file", and only model calls are
  treated as model failures.
- A bad amount in the policy book or production report failed without its file or row. Both now
  report it like any other invalid value.

**Minor findings**, left for the human and then accepted: a dead branch in the run report, replayed
answers counted in the run's cost (a replay now reports $0 spent), a rate finding raised when the
network does not meet the minimum premium (the agreement then provides 0%, citing the minimum's
clause), and a shadowed variable name. All four fixed; 141 tests pass. One question stays open: in
replay mode, a missing retry recording hides a tie-out failure. The statement is held either way.

**Verified**

| Check                                                 | Result                                    |
| ----------------------------------------------------- | ----------------------------------------- |
| Typecheck, lint, format                               | Pass                                      |
| Tests                                                 | 139 pass                                  |
| Both input errors reproduced before and after the fix | Reported correctly after                  |
| Demo bonus and eval in replay mode                    | Unchanged: $42,546.11 expected; eval pass |

## The admin (2026-10-30)

**Why.** The human asked for something visual for the walkthrough and for reviewers: the results were
Markdown files and terminal output.

**Built**

- A JSON API in the same Nest app, with controllers in each module: periods (view, run, dispute letter),
  bonus programs (view, run, dispute letter), approvals (list, approve) and health. The services the
  commands used were moved into shared services, so the command line and the admin run the same code.
- View models that reshape results for reading, with names resolved and every total computed on the
  server. The page formats numbers and never adds them up.
- Approvals: a changed layout's verified mapping, or a bonus agreement's drafted rules, written into the
  tenant's config when a person approves, with their name and the time in `approvals.jsonl`. An
  unverified mapping cannot be approved.
- The web app in `web/`: overview, statement lines, bonus check with two charts, approvals and health.
- An end-to-end test of the whole loop through the API: run with a changed layout and unapproved bonus
  rules, approve both, run again, and both go through with the planted underpayment found.

**Decisions**

- A framework after all. The AI first proposed plain server-rendered HTML to keep the code small; the
  human pointed out that this is what reviewers see first and it has to look clean. React, Tailwind and
  shadcn/ui components: a common, well-supported stack a reviewer can read.
- A single-page app on Vite rather than Next.js: a local tool gains nothing from server rendering.
- The admin reads the results files the commands write, so nothing new has to be stored before the
  Postgres milestone. Decisions on held lines wait for that milestone, since they need real storage and
  an audit trail.
- Localhost only, no logins: the reviewer types their name. Program and carrier names in the address
  are checked against config, so a request cannot reach other files.

**Verified**

| Check                                                   | Result                        |
| ------------------------------------------------------- | ----------------------------- |
| Typecheck and lint, server and web                      | Pass                          |
| Server tests, including the approve-and-rerun API flow  | 150 pass                      |
| Web tests                                               | 5 pass                        |
| Every page rendered in a headless browser and looked at | Screenshots in `docs/images/` |

### Redesigned for the people who decide (2026-10-30)

The human asked for only powerful data, no noise: the admin is a demo for stakeholders, not an
engineering console. Changed:

- A new first screen: the money found ($28,125.62 in the demo), where it is and why in plain words,
  what is waiting for a person, and three proof points (lines checked automatically, AI accuracy
  against the answer key, cost to read a statement). Summed on the server.
- Approvals moved onto the page where the problem is, with one "approve and run again" step. The
  separate approvals page is gone; the API is unchanged.
- Removed what repeated another number or decorated: the network-share tile, the allocation bar, the
  paid-vs-expected chart, duplicate tiles, four of six tabs, token counts, the held list on the health
  page. "Health" became "AI accuracy".
- Rate disputes now give the reason only ("Underpaid: the rate in effect is 12.00%, since
  2026-09-01"); the amounts are already beside them, in the admin, the report and the letters.

### Minimal (2026-10-30)

The human still saw too much. The rule now: each screen shows one headline number and the few items
behind it; the explaining is the presenter's job. The overview is the amount found, three rows and
one line of proof. A carrier is its owed amount and the lines that need a person, each with a plain
label and an amount. A bonus is its owed amount and the two reasons, with the calculation behind
"Show the calculation". Accuracy is one number and five bars. Navigation moved to a top bar. Charts,
tables, tabs and the libraries behind them (Recharts, TanStack Table, Radix Tabs) were removed.

## Milestone 7: A second business on the same code (2026-10-30)

**Built**

- A second demo tenant, `tenants/brand-group/`: a synthetic beauty brand group with three brands and
  three retailers. Each retailer pays invoices net of the allowances in its trade terms and sends a
  remittance advice: two as CSV in different layouts, one as a printed PDF.
- The same planted problems in a retailer's clothes: a reorder allowance cut on the first of the month
  but still taken on two invoices, an invoice never paid, one paid twice, one paid on a lower amount
  than billed, one the group has no record of, blank invoice numbers, and return credits.
- The tenant's words in config (`vocabulary` in `tenant.yaml`): who pays, what they send, what each
  line is paid on, who shares in the money. The admin, the report, the dispute letters, the line
  explanations and both prompts read them.
- The generator takes a record profile (products, amounts, names), and the printed-statement renderer
  takes a layout, so the PDF is a retailer's remittance and not a copy of the carrier's.
- `pnpm demo:seed:brands` and `pnpm admin:brands`, the same admin on port 3001.

**Decisions**

- Words are config, with the agency network's as the defaults. Its prompts are byte-identical, so every
  recorded answer still replays; a replayed eval run proved it before anything else changed.
- Evals measure the model, not a tenant: both admins read the same eval results (`EVALS_DIR`), and the
  reading suite now includes the retailer PDF.
- The demo covers remittances against trade terms, not the whole deductions problem. Reason codes,
  debit memos and promotion accruals are named in the design as new rules, not built.

**AI and human**

- The human said to continue with the recommended order: second tenant first, then a thin slice of
  monitoring.
- The AI ran the new retailer PDF through Claude once per seed to record it (three calls, about $0.11).

**Verified**

| Check                                                               | Result                                       |
| ------------------------------------------------------------------- | -------------------------------------------- |
| Agency network demo data after the generator change                 | Byte-identical to before                     |
| Replayed evals before and after the prompt change                   | Pass, every recording found                  |
| End-to-end, both tenants, three seeds each, against the answer keys | Pass                                         |
| Evals, reading both kinds of PDF                                    | 6 of 6 statements read field for field, live |
| Typecheck, lint, format, server and web tests                       | Pass, 170 server and 3 web tests             |
| Both admins rendered in a headless browser and looked at            | Screenshots in `docs/images/`                |

## Milestone 6, started: a kill switch and the signals (2026-10-30)

**Built**

- A kill switch per carrier: `paused: <reason>` in `tenant.yaml`. The statement is not read, nothing
  from it is paid, no model call is made, and the admin and the report say it was paused and why.
- Each period's signals, on the admin's AI accuracy page: statements that add up to the cent, layouts
  that changed, carriers that sent nothing, carriers switched off, lines needing a person, and readings
  retried on the stronger model. Each is green or flagged, with the names behind a flag.

**Decisions**

- Only the signals that need no history. Control bands, trends and alerts need runs stored over time,
  which is the Postgres milestone; the design's signal table says which is which.
- The share of lines needing a person has a fixed 15% limit until there is history for a band.
- The switch is config, so turning a carrier off is a reviewed change with a name on it, like an
  approval.

**AI and human**

- The human said to continue with the recommended order after the second tenant.

**Verified**

| Check                                                 | Result                       |
| ----------------------------------------------------- | ---------------------------- |
| Signals for a normal month, and for each kind of flag | Unit tests pass              |
| A paused carrier is not read and the others close     | End-to-end test passes       |
| A changed layout flagged in the admin                 | Screenshot in `docs/images/` |
| Typecheck, lint, format, server and web tests         | Pass                         |

## Milestone 9: Runbook and decision records (2026-10-30)

**Built**

- `docs/runbook.md`: the monthly close step by step, and what to do for each kind of hold, each label
  on a line that needs a person, each flag on the AI accuracy page, a bonus check, a model or prompt
  change, and a new carrier or business.
- `docs/decisions/`: seven short records of the decisions that shape the code, each with what was
  considered and why.

**AI and human**

- The AI checked each runbook step against what the code does. One claim was wrong in the first draft
  (that a silent carrier's policies show up as never paid; they are not checked until its statement
  arrives) and was corrected before committing.

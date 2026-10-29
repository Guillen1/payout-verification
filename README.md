# Payout Verification

Checks what insurance carriers paid an agency network against what they owed, and works out what the
network owes each of its agencies.

An agency network receives commission from dozens of carriers. Each carrier sends a monthly statement in
its own layout, the rates change over time, and every agency gets its own share. Someone has to confirm,
every month, that each carrier paid the right amount for every policy, notice the policies that were
never paid at all, and pay each agency correctly. Once a year, carriers also pay profit-sharing bonuses
under agreements nobody rechecks by hand. This project does that work and hands a person only what
needs judgment.

All data in this repository is synthetic. Carriers, agencies, insureds, rates and amounts are invented.

## Run the demo

Requires Node 22 and pnpm. Each command builds the app first.

```sh
pnpm install
pnpm demo:seed        # writes a policy book and three carrier statements (two CSV, one PDF) into data/demo/
pnpm demo:reconcile   # reconciles the period and writes the report and payout files into out/2026-09/
pnpm demo:bonus       # verifies a carrier's profit-sharing bonus and writes out/bonus/northwind-2025/
pnpm eval             # measures the model's reading against the answer key
```

Claude reads the PDF statement and the bonus agreement. Its answers are recorded under `recordings/`, so the demo runs
the same way every time and without an API key. To let it call the model for anything not
recorded, copy `.env.example` to `.env` and add a key.

Open `out/2026-09/report.md` for the finance report. `agency-payouts.csv` is what to pay each agency,
and `allocation-lines.csv` traces every payout back to a statement row. `disputes/` holds a draft
letter for each carrier that underpaid.

**Break it on purpose.** Rename the `COMM_AMT` column in `data/demo/inbox/2026-09/bluestem.csv` and run
`pnpm demo:reconcile` again. Bluestem's statement is held as a layout change and nothing from it is paid
out, while the other carriers still close. Claude proposes an updated mapping, the code checks that the
proposal reads every line and ties out to the cent, and it waits in `out/2026-09/proposals/` for a
person to approve it.

## What it finds

The seeded period plants one of each problem a real close runs into:

| Problem                         | Example in the demo                                                           | What happens                                                               |
| ------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Paid at an outdated rate        | Northwind raised its auto rate on Sept 1 but paid two policies at the old one | Disputed with the carrier, with the exact shortfall                        |
| Overpayment                     | Harbor & Pine paid one policy above its rate                                  | Disputed, with the exact excess                                            |
| Policy never paid               | A policy that took effect in September is on no line                          | Listed as not received, with the expected amount                           |
| Line printed twice              | One Northwind line appears twice                                              | Second copy held for review                                                |
| Blank policy number             | Two Bluestem lines have no policy number                                      | Matched by insured name and effective date                                 |
| Premium disagrees with the book | Bluestem reports $120 more premium than the book                              | Held: either side may be out of date                                       |
| Policy not in the book          | Bluestem pays on a policy the network has no record of                        | Held for review                                                            |
| Cancellation chargeback         | Every carrier takes back commission on a cancelled policy                     | Cleared if taken back at the right rate                                    |
| Statement only in PDF           | Harbor & Pine prints two pages with page subtotals and "CR" credits           | Claude transcribes it; the same checks as a CSV apply                      |
| Misread amount                  | A transcription error in a PDF                                                | The lines no longer tie out, so the statement is held                      |
| Layout change                   | A renamed column                                                              | That carrier is held, the others close, and a verified mapping is proposed |
| Statement never arrived         | A carrier sends nothing                                                       | Reported, the others close                                                 |

## How it works

```
statement file ──▶ extract ──▶ tie out ──▶ match ──▶ classify ──▶ allocate ──▶ report + payout files
                     │            │           │           │
               format config   lines must  policy      rate in effect on the
               per carrier     sum to the  number,     policy's effective date,
                               printed     then name   agency split, variance
                               total       and date
```

1. **Extract.** Each carrier's layout is described in a YAML file under `tenants/<tenant>/formats/`.
   Headers that differ from the format stop that carrier as a layout change instead of being guessed.
2. **Tie out.** The extracted lines must add up to the total the carrier printed, to the cent, or the
   statement is held. This catches most reading errors before they can reach a payout.
3. **Match.** Each line is matched to a policy in the book by policy number, then by insured name and
   effective date. More than one candidate is reported as ambiguous, never picked.
4. **Classify.** Every line gets exactly one finding and one disposition: `clear` (allocated), `dispute`
   (allocated, and the variance is raised with the carrier) or `review` (held until a person decides).
5. **Find what is missing.** Policies that took effect in the period with no line at all are listed. A
   line-by-line check cannot see a payment that never came.
6. **Allocate.** Commission on lines that are not held is split by the agency's share in effect on the
   policy's effective date. Agency plus network plus held always equals what was paid.

## Profit-sharing bonuses

A carrier pays the network a bonus each year based on the premium its agencies wrote and how
profitable that business was. The terms are in an agreement document, and the carrier sends one
statement with its own figures. Nobody else recomputes it.

1. **Read the agreement once.** Claude reads it into rules: which lines count, the minimum premium, the
   bonus rate for each loss ratio band, and the cap. Every rule cites its clause, and terms the rules
   cannot express are listed for the reviewer. Nothing is computed until a person approves the rules,
   and a changed agreement document needs a new approval.
2. **Compute what is owed.** Code applies the approved rules to the network's own production records,
   with a step-by-step trace that cites the clause behind each number.
3. **Check the statement.** Each agency's premium is compared with the network's records, the loss
   ratio is recomputed from the carrier's own figures, and the rate is checked against the band.
4. **Split what was paid.** The network keeps its share and the rest goes to agencies by eligible
   premium, to the cent. An underpayment gets a draft dispute letter that quotes the clauses.

The demo plants two errors a carrier really makes: one agency's premium left out, and a loss ratio
exactly on a band boundary paid at the next band's lower rate. The run finds both and the exact
shortfall.

## Where AI is used, and where it is not

| Step                                     | Who does it                                                              | Why                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------- |
| Reading a PDF statement                  | Claude transcribes the printed lines                                     | Layouts vary and only a reader can follow them      |
| Mapping codes, parsing dates and amounts | Code, with the carrier's format                                          | Same rules for every file type                      |
| Checking the reading                     | Code: the lines must tie out to the printed total                        | A misread amount holds the statement                |
| Adapting to a changed layout             | Claude proposes a mapping; code verifies it; a person approves           | Turns an engineering ticket into a review           |
| Matching, rates, variances, allocation   | Code only                                                                | Money is never computed by a model                  |
| Reading a bonus agreement                | Claude drafts rules that cite their clauses; a person approves them once | Contracts are prose; the approval makes them config |
| Computing and checking the bonus         | Code only, from the approved rules                                       | Every number traces to a clause                     |
| Dispute letters                          | A template filled from the results                                       | Figures sent to a carrier must be exact             |

Claude Sonnet does the reading. A reading that does not tie out is retried once on Claude Opus before
the statement is held for a person, so only the hard documents pay for the stronger model. Both are
set in `.env`, and the eval decides whether a cheaper model is good enough.

Every model call uses structured outputs, so its answer is validated against a schema before the code
sees it. Calls are metered for tokens, latency and cost, and the report lists them.

## Principles

- **Money is integers.** Amounts are cents and rates are basis points. No floating-point dollars.
- **Rules are dated.** Rates and splits carry effective dates. A line is judged by the rule in effect on
  its policy's effective date.
- **Hold rather than guess.** A wrong automatic answer costs more than a line sent to review.
- **Config, not code.** A new carrier, or a carrier that changed its layout, is a YAML change. A new
  network is a new tenant directory.
- **Every number traces back.** Each allocation keeps the file and row it came from.
- **The test data does not grade itself.** The synthetic generator writes each carrier's file by hand
  and computes commissions with its own arithmetic, so the pipeline is checked against data it did not
  produce. Its answer key lists the expected finding for every line.

## How it was built

This project was researched, designed and built with an AI coding agent. [`docs/process/`](docs/process/README.md)
records the process: the portfolio research, three independent agent reviews and how their disagreements
were settled, the human decisions, and a log of each milestone with how it was verified.

## Repository tour

A NestJS command-line app laid out by module: each one has `domain/` (plain functions, no framework),
`application/` (services), `infrastructure/` (files and external systems), `cli/` and `tests/`. No CQRS.

| Path                                         | What is there                                                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/modules/reconciliation/domain/`         | The money rules as pure functions: dated rates, matching, classification, allocation, tie-out. Start here. |
| `src/modules/reconciliation/application/`    | Closing a period across carriers, and the report and payout files.                                         |
| `src/modules/reconciliation/infrastructure/` | Reading the tenant's config and policy book from files.                                                    |
| `src/modules/bonus/`                         | Profit-sharing bonuses: agreement to rules, expected bonus, statement check, split and dispute letter.     |
| `src/modules/extraction/`                    | Reading CSV and PDF statements into one shape, and proposing mappings for changed layouts.                 |
| `src/libs/model-client/`                     | The one door to the model: the Claude client with recordings, and a stand-in for tests.                    |
| `src/modules/demo/`                          | The seeded synthetic data generator (Faker), including the PDF statement and its answer key.               |
| `src/modules/evals/`                         | Measures the real model against the answer key, with floors.                                               |
| `tenants/agency-network/`                    | The demo tenant: carriers, agencies, rates, splits, carrier formats and bonus programs.                    |
| `recordings/`                                | Recorded model answers, so the demo and CI run without a key.                                              |
| `docs/design.md`                             | The design: goals, architecture, controls, monitoring and roadmap.                                         |
| `docs/process/`                              | How this was researched, decided and built with AI, including the research.                                |

```sh
pnpm check   # typecheck, lint, format check and tests
```

## Roadmap

See `docs/design.md` section 18 for detail.

- [x] **1. Domain core and CSV statements.**
- [x] **2. AI reading.** PDF statements, proposals for changed layouts, recordings, evals.
- [x] **3. Bonus verification.** Agreement terms extracted into rules, expected bonus computed and
      reconciled, dispute drafts.
- [ ] **4. Pipeline on Postgres.** Persisted runs, review queue and audit log.
- [ ] **5. Evals in CI and a fault generator.**
- [ ] **6. Monitoring.** Layout drift, variance control charts, silent carriers, kill switches.
- [ ] **7. A second tenant.** Retailer deductions for a consumer brand, with config only.
- [ ] **8. Production adapters.**
- [ ] **9. Runbook and decision records.**

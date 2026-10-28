# Payout Verification

Checks what insurance carriers paid an agency network against what they owed, and works out what the
network owes each of its agencies.

An agency network receives commission from dozens of carriers. Each carrier sends a monthly statement in
its own layout, the rates change over time, and every agency gets its own share. Someone has to confirm,
every month, that each carrier paid the right amount for every policy, notice the policies that were
never paid at all, and pay each agency correctly. This project does that work and hands a person only
the lines that need judgment.

All data in this repository is synthetic. Carriers, agencies, insureds, rates and amounts are invented.

## Run the demo

Requires Node 22 and pnpm.

```sh
pnpm install
pnpm demo:seed        # writes a policy book and two carrier statements for 2026-09 into data/demo/
pnpm demo:reconcile   # reconciles the period and writes the report and payout files into out/2026-09/
```

```
Agency Network (synthetic), period 2026-09

  Northwind Mutual           31 lines, 28 clear, 2 dispute, 1 review, 1 not received; paid $7,590.55
  Bluestem Insurance Co.     32 lines, 30 clear, 0 dispute, 2 review, 0 not received; paid $7,478.99
```

Open `out/2026-09/report.md` for the finance report. `agency-payouts.csv` is what to pay each agency,
and `allocation-lines.csv` traces every payout back to a statement row.

**Break it on purpose.** Rename the `COMM_AMT` column in `data/demo/inbox/2026-09/bluestem.csv` and run
`pnpm demo:reconcile` again. Bluestem's statement is held as a layout change and nothing from it is paid
out, while Northwind still closes.

## What it finds

The seeded period plants one of each problem a real close runs into:

| Problem                         | Example in the demo                                                           | What happens                                        |
| ------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------- |
| Paid at an outdated rate        | Northwind raised its auto rate on Sept 1 but paid two policies at the old one | Disputed with the carrier, with the exact shortfall |
| Policy never paid               | A Northwind policy that took effect in September is on no line                | Listed as not received, with the expected amount    |
| Line printed twice              | One Northwind line appears twice                                              | Second copy held for review                         |
| Blank policy number             | Two Bluestem lines have no policy number                                      | Matched by insured name and effective date          |
| Premium disagrees with the book | Bluestem reports $120 more premium than the book                              | Held: either side may be out of date                |
| Policy not in the book          | Bluestem pays on a policy the network has no record of                        | Held for review                                     |
| Cancellation chargeback         | Both carriers take back commission on a cancelled policy                      | Cleared if taken back at the right rate             |
| Layout change                   | A renamed column                                                              | The carrier's statement is held, the others close   |
| Statement never arrived         | A carrier sends nothing                                                       | Reported, the others close                          |

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

## Repository tour

| Path                      | What is there                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/domain/`             | The rules of the business as pure functions: money, dated rules, matching, classification, allocation. No I/O. |
| `src/extraction/`         | Reading carrier files into statements, driven by format configs.                                               |
| `src/tenant/`             | Loading and validating a tenant's config and policy book.                                                      |
| `src/application/`        | Running a whole period across carriers.                                                                        |
| `src/reporting/`          | The finance report and payout files.                                                                           |
| `src/cli/`                | `demo:seed` and `demo:reconcile`.                                                                              |
| `tenants/agency-network/` | The demo tenant: carriers, agencies, rates, splits and carrier formats.                                        |
| `synthetic/`              | The seeded demo data generator and its answer key.                                                             |
| `test/`                   | End-to-end checks of a full period against the answer key, across several seeds.                               |
| `docs/design.md`          | The design: goals, architecture, controls, monitoring and roadmap.                                             |

```sh
pnpm check   # typecheck, lint, format check and tests
```

## Roadmap

See `docs/design.md` section 18 for detail.

- [x] **1. Domain core and CSV statements.** Matching, classification, allocation, tie-out, missing
      payments, config-driven extraction, synthetic data with an answer key, report and payout files.
- [ ] **2. Pipeline on Postgres.** Persisted runs, stages as idempotent jobs, review queue and audit log.
- [ ] **3. Evals.** Labeled sets per format, a held-out format, a separate fault generator, CI gate,
      recorded model responses so the demo runs without an API key.
- [ ] **4. PDF statements and model-assisted matching.** The model reads PDFs and ranks candidates for
      unmatched lines. It never computes money.
- [ ] **5. Monitoring.** Layout drift, control charts on variance, silent carriers, kill switches.
- [ ] **6. Profit-sharing verification.** Bonus agreement terms extracted to rules, expected bonus
      computed and reconciled.
- [ ] **7. A second tenant.** Retailer deductions for a consumer brand, with config only.

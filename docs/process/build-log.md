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

- The human set the constraints: same conventions as the builder's other repositories, no CQRS, code a
  new reader can follow.
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

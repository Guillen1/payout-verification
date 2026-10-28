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

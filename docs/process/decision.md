# Decision

As of 2026-10-27, after the independent reviews.

## What we are building

A **carrier-to-agency payout verification** pipeline for an insurance agency network, modeled on AAI.

1. **Statement verification.** Carrier commission statements, each in its own layout, are read into one
   shape, tied out to the printed total, matched to the policy book, and checked against the rate in
   effect. Underpayments are disputed, unclear lines are held, and policies never paid are listed.
2. **Bonus verification.** A profit-sharing agreement is extracted into rules once and approved by a
   person. The expected bonus is computed by code and reconciled against the carrier's bonus statement.
3. **Allocation.** What each agency is owed, with every cent traced back to a statement row.

An agency can buy statement matching. A network cannot buy payout and bonus verification across dozens of
carriers and a hundred agencies, and that is the layer this project covers.

**Alternate:** Reliable Medical funding-packet readiness, if a non-insurance pick is preferred.

## Why this one

- **The pain is named by the company.** Its blog names commission tracking and reporting; its press names
  commission economics and profit-sharing programs as what it offers agencies.
- **It is buildable to production quality on synthetic data,** and the builder can judge whether it works.
- **The monitoring story is concrete:** layout changes, totals that do not tie out, carriers that go
  silent, unexplained variance, and reviewer override rates.
- **It generalizes.** Many counterparties, each with its own format, matched against a system of record:
  the same shape as retailer deductions at the firm's consumer brands.

## Buy, build, adopt

Not every part of this workflow should be custom software. The split:

|           | What                                                                                                                                                          | Why                                                                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Buy**   | Agency-level statement matching (Applied Recon, Vertafore, Ascend) and the AMS's own statement import                                                         | Mature products already do it. Rebuilding it adds cost without adding anything.                                                                                                       |
| **Build** | Network-level payout verification, bonus agreement verification, allocation to agencies                                                                       | No product covers the layer above a single agency, or bonus terms that differ in every agreement.                                                                                     |
| **Adopt** | General AI tools for the finance team, such as Claude for reading agreements and drafting carrier correspondence, with clear rules on what data may be shared | Raises the floor for the whole team without custom work. Speech-to-text tools fit other AAI processes, such as recruiting or carrier calls, but not this one, which is all documents. |

## Assumptions that could change the plan

| Assumption                                                    | If wrong                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Carriers remit commission to the network, which pays agencies | Statement verification shrinks to override settlement; bonus verification leads |
| The network holds an export of each agency's policies         | A per-agency policy source adapter is needed                                    |
| No accounting-automation vendor is already in place           | Scope narrows to bonus verification and allocation, positioned above the vendor |

## Scope

The milestones and their cut line are in [design.md section 18](../design.md#18-milestones-and-cut-line).
Formats are kept few and built well. Dropped: scanned-image OCR, multi-user access, any chat interface,
and integrations beyond a file drop.

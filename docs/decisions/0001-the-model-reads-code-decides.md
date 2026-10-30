# 0001. The model reads; code decides

**Status:** accepted, 2026-10-28.

**Context.** The hard part of this work is reading documents in every layout. The part that costs
money when wrong is the arithmetic and the rules: which rate was in effect, what was owed, who gets
what.

**Decision.** Claude only transcribes documents into a fixed schema (a PDF statement, a bonus
agreement) or proposes a column mapping. Every amount, match, finding and split is computed by plain
functions in `src/modules/*/domain/`, with integer cents and basis points.

**Considered.** Asking the model to reconcile a statement directly: fewer lines of code, but every
figure would need checking, and a wrong one would look as confident as a right one.

**Consequences.** A model mistake can only be a misreading, and misreadings are caught by tie-out
(0002) and by evals (0005). The domain is testable without a model.

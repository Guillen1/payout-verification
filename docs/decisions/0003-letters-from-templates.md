# 0003. Dispute letters are filled from templates, not written

**Status:** accepted, 2026-10-29.

**Context.** A letter to a carrier quotes money and clauses. It is sent outside the company.

**Decision.** Letters are a fixed template filled with figures and explanations from the results. No
model writes them.

**Considered.** Having Claude draft the letter: smoother prose, but it adds a place where a figure can
change and adds no information.

**Consequences.** Every figure in a letter is the reconciliation's figure. A person still reads it
before it is sent.

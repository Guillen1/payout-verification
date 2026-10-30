# 0004. Sonnet by default, Opus only as a retry

**Status:** accepted, 2026-10-29.

**Context.** The first build defaulted to the largest model. Asked whether that was needed, the evals
answered it: on every reading task, Sonnet scored the same as Opus at about half the cost.

**Decision.** `claude-sonnet-5-5` reads everything. When a PDF reading does not tie out, it is read once
more by `claude-opus-5-5`, and whatever comes back still has to tie out.

**Consequences.** Lower cost per statement, and a new signal: how often the retry fires. A rising rate
means a carrier's documents changed or the model got worse. Model size is chosen by measurement, per
task.

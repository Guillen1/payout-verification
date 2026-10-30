# 0007. Files before a database

**Status:** accepted, 2026-10-28.

**Context.** The demo has to run on a reviewer's machine with one command.

**Decision.** Config, inputs and results are files: YAML and CSV in, Markdown, CSV and JSON out. The
admin reads the results files. Approvals write config and append to `approvals.jsonl`.

**Considered.** Postgres from the start: needed for history, trends and a real review queue, but a
heavier setup for a demo.

**Consequences.** Signals that need history (control bands, trends) wait for the Postgres milestone.
The file layout maps one to one onto the tables in the design.

# 0005. Model answers are recorded and replayed; evals gate changes

**Status:** accepted, 2026-10-29.

**Context.** Tests that call a model are slow, cost money and change from run to run. A prompt change
can quietly make readings worse.

**Decision.** Every model answer is recorded under `recordings/`, keyed by model, task, prompt version,
instructions and inputs. The demo and CI replay them. Evals score the model against an answer key with
a floor for each measure; CI replays them on every push, and a model or prompt change runs them live.

**Consequences.** The demo runs the same every time, without an API key. A change to a prompt misses its
recordings, which forces a live eval run before it can ship.

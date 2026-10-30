# Runbook

How to run the monthly close and what to do when something is held. Commands are the demo's; in
production the same steps run as jobs and the admin is where people act.

## The monthly close

1. Statements arrive in `data/<tenant>/inbox/<period>/`, one file per carrier, named by carrier id.
2. Run the period: **Run again** on the admin's commissions page, or
   `pnpm demo:reconcile --period 2026-09`.
3. Open the overview. The amount found and its rows are what is owed; the yellow lines are what is
   waiting for a person.
4. Work each waiting item (below), then run the period again. Repeat until nothing is waiting.
5. Send the dispute letters: each carrier page has one. Read it before sending; it is a draft.
6. Pay agencies from `out/<period>/agency-payouts.csv`. Held money is not in it.

## A statement is held

The carrier page says why. Every held statement pays nothing; the other carriers are not affected.

| Reason                       | What it means                                    | What to do                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The statement layout changed | The file's columns are not the ones on file      | Check the proposed mapping on the carrier page: old column, new column. Approve and run if it is right. If not, edit `tenants/<tenant>/formats/<id>.yaml`.        |
| The lines do not add up      | What was read does not match the printed total   | Open the file. For a PDF, a misreading: run again, and if it repeats, pause the carrier and report it. For a CSV, the carrier's file is wrong: ask for a new one. |
| Unreadable values            | A date, amount or code the format does not know  | The detail names the row and field. A new product or transaction code goes in the carrier's format file.                                                          |
| No statement received        | Nothing in the inbox for this carrier and period | Ask the carrier. Nothing it owes is checked until the statement arrives.                                                                                          |
| The model was unavailable    | Claude could not be reached for a PDF            | Run again later. Nothing was guessed.                                                                                                                             |
| Paused by a person           | Someone switched the carrier off                 | See below.                                                                                                                                                        |

## Lines that need a person

| Label                         | What to do                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| Paid below the agreed rate    | Dispute it. It is in the letter.                                                                 |
| Paid above the agreed rate    | Check the rate on file. If it is out of date, fix `rates.csv` and run again; otherwise, note it. |
| Never paid                    | Dispute it. It is in the letter.                                                                 |
| Printed twice                 | Ask the carrier which line stands. The money is held.                                            |
| Not in the policy book        | Find the policy. If the book is behind, update it and run again.                                 |
| Premium differs from the book | One of them is out of date. Correct the book, or ask the carrier to correct its statement.       |

## Switch a carrier off

Add `paused: <reason>` under the carrier in `tenants/<tenant>/tenant.yaml` and run the period. The
carrier is not read and nothing from it is paid; the admin shows the reason. Remove the line to turn it
back on. Pause when a carrier's statements keep failing, when its readings look wrong, or while a dispute
with it is open and paying would weaken it.

## A bonus check

1. A new agreement PDF goes in `data/<tenant>/bonus/<program>/`. The bonus page then shows its rules to
   read before approving, each with its clause. Read the clauses that would change the amount, and the
   terms listed below the rules, which the rules cannot express.
2. **Approve and run.** The approval is tied to that exact document: a changed agreement stops the
   check and drafts new rules.
3. An amount owed comes with a letter quoting the clauses.

## The AI accuracy page shows a flag

| Flag                                   | What to do                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Statements that do not add up          | As above. Two in a row from one carrier: pause it.                                             |
| Layouts that changed                   | As above.                                                                                      |
| Carriers that sent nothing             | Ask the carrier.                                                                               |
| Lines that need a person above 15%     | Look at which carrier. Usually rates on file are out of date or the carrier changed something. |
| Readings retried on the stronger model | Once is fine. Every month from one carrier: its layout changed; improve its `readingNotes`.    |
| A score below its floor                | Stop releasing changes. See "Change the model or a prompt".                                    |

## Change the model or a prompt

1. Change it, then run `MODEL_MODE=live pnpm eval`. This calls Claude for every case and costs cents.
2. Every score must meet its floor. If one does not, do not ship the change.
3. To keep the new answers for CI, run `MODEL_MODE=record pnpm eval` after deleting the recordings the
   change made stale, and commit `recordings/`.

## Add a carrier or a new business

- **A carrier:** add it to `tenant.yaml`, its rates to `rates.csv`, and a format file describing its
  layout. A PDF carrier's format has `readingNotes` for anything a reader needs to know.
- **A business:** a new directory under `tenants/`, with its own words under `vocabulary`. See
  `tenants/brand-group/` and the design's section 11.

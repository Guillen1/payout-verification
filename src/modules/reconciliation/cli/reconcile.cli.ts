import { Command, CommandRunner, Option } from "nest-commander";
import { costOfLiveCalls } from "../../../libs/model-client/contract/model.models";
import { PeriodRunsService } from "../application/services/period-runs.service";
import type { CarrierOutcome } from "../application/services/reconcile-period.service";
import { isPeriod } from "../domain/dates";
import { formatMoney } from "../domain/money";

interface ReconcileOptions {
  tenant: string;
  data: string;
  out: string;
  period: string;
}

/** `reconcile`: closes one period and writes the report, payout files, proposed mappings and dispute drafts. */
@Command({ name: "reconcile", description: "Reconcile one period of carrier statements" })
export class ReconcileCli extends CommandRunner {
  constructor(private readonly periodRuns: PeriodRunsService) {
    super();
  }

  async run(_arguments: string[], options: ReconcileOptions): Promise<void> {
    const { result, tenant, outDirectory, proposals, disputes } = await this.periodRuns.run(
      { tenant: options.tenant, data: options.data, out: options.out },
      options.period
    );

    console.log(`\n${tenant.name}, period ${options.period}\n`);
    for (const outcome of result.carriers) {
      console.log(`  ${outcome.carrier.name.padEnd(26)} ${summarize(outcome)}`);
      const proposal = proposals[outcome.carrier.id];
      if (proposal) console.log(`  ${"".padEnd(26)} proposed mapping to review: ${proposal}`);
      const dispute = disputes[outcome.carrier.id];
      if (dispute) console.log(`  ${"".padEnd(26)} draft dispute letter: ${dispute}`);
    }

    if (result.modelCalls.length > 0) {
      const replayed = result.modelCalls.filter(call => call.source === "recording").length;
      console.log(
        `\nModel calls: ${result.modelCalls.length} (${replayed} replayed), ` +
          `estimated cost $${costOfLiveCalls(result.modelCalls).toFixed(4)}`
      );
    }
    console.log(`\nReport and payout files in ${outDirectory}/\n`);
  }

  @Option({ flags: "--period <period>", description: "Period to close, like 2026-09", defaultValue: "2026-09" })
  parsePeriod(value: string): string {
    if (!isPeriod(value)) throw new Error(`--period must look like 2026-09, got "${value}"`);
    return value;
  }

  @Option({
    flags: "--tenant <directory>",
    description: "Tenant config directory",
    defaultValue: "tenants/agency-network"
  })
  parseTenant(value: string): string {
    return value;
  }

  @Option({
    flags: "--data <directory>",
    description: "Where statements and the policy book are",
    defaultValue: "data/demo"
  })
  parseData(value: string): string {
    return value;
  }

  @Option({ flags: "--out <directory>", description: "Where to write the report", defaultValue: "out" })
  parseOut(value: string): string {
    return value;
  }
}

function summarize(outcome: CarrierOutcome): string {
  switch (outcome.status) {
    case "statement_missing":
      return "no statement received";
    case "paused":
      return `PAUSED, ${outcome.reason}`;
    case "format_drift":
      return `HELD, layout changed (missing ${outcome.headerCheck.missing.join(", ") || "none"})`;
    case "invalid_lines":
      return `HELD, ${outcome.problems.length} unreadable value(s)`;
    case "unreadable":
      return `HELD, could not be read: ${outcome.reason}`;
    case "model_unavailable":
      return `HELD, model unavailable: ${outcome.reason}`;
    case "processed": {
      const reconciliation = outcome.reconciliation;
      if (reconciliation.status === "held") return "HELD, lines do not add up to the statement total";
      const lines = reconciliation.lines;
      const count = (disposition: string) => lines.filter(line => line.disposition === disposition).length;
      return (
        `${lines.length} lines, ${count("clear")} clear, ${count("dispute")} dispute, ${count("review")} review, ` +
        `${reconciliation.missing.length} not received; paid ${formatMoney(reconciliation.totals.paidCents)}`
      );
    }
  }
}

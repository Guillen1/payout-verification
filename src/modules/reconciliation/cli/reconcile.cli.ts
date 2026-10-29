import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Command, CommandRunner, Option } from "nest-commander";
import { renderProposal } from "../../extraction/application/services/format-proposal.service";
import { renderAgencyPayouts, renderAllocationLines } from "../application/reports/payout-files";
import { renderRunReport } from "../application/reports/run-report";
import { ReconcilePeriodService, type CarrierOutcome } from "../application/services/reconcile-period.service";
import { isPeriod } from "../domain/dates";
import { formatMoney } from "../domain/money";
import { loadPolicyBook } from "../infrastructure/policy-book-file";
import { loadTenant } from "../infrastructure/tenant-files";

interface ReconcileOptions {
  tenant: string;
  data: string;
  out: string;
  period: string;
}

/** `reconcile`: closes one period and writes the report, payout files and any proposed mappings. */
@Command({ name: "reconcile", description: "Reconcile one period of carrier statements" })
export class ReconcileCli extends CommandRunner {
  constructor(private readonly reconcilePeriod: ReconcilePeriodService) {
    super();
  }

  async run(_arguments: string[], options: ReconcileOptions): Promise<void> {
    const tenant = await loadTenant(options.tenant);
    const policies = await loadPolicyBook(join(options.data, "book", "policies.csv"));
    const result = await this.reconcilePeriod.reconcile({
      tenant,
      policies,
      inboxDirectory: join(options.data, "inbox"),
      period: options.period
    });

    const outDirectory = join(options.out, options.period);
    await mkdir(join(outDirectory, "proposals"), { recursive: true });
    await writeFile(join(outDirectory, "report.md"), renderRunReport(result, tenant));
    await writeFile(join(outDirectory, "agency-payouts.csv"), renderAgencyPayouts(result));
    await writeFile(join(outDirectory, "allocation-lines.csv"), renderAllocationLines(result));
    await writeFile(join(outDirectory, "result.json"), `${JSON.stringify(result, null, 2)}\n`);

    console.log(`\n${tenant.name}, period ${options.period}\n`);
    for (const outcome of result.carriers) {
      console.log(`  ${outcome.carrier.name.padEnd(26)} ${summarize(outcome)}`);
      if (outcome.status === "format_drift" && outcome.proposal.status !== "no_answer" && outcome.proposal.format) {
        const path = join(outDirectory, "proposals", `${outcome.proposal.format.id}.yaml`);
        const verified = outcome.proposal.status === "verified";
        await writeFile(path, renderProposal({ ...outcome.proposal, format: outcome.proposal.format }, verified));
        console.log(`  ${"".padEnd(26)} proposed mapping to review: ${path}`);
      }
    }

    const cost = result.modelCalls.reduce((total, call) => total + (call.estimatedCostUsd ?? 0), 0);
    if (result.modelCalls.length > 0)
      console.log(`\nModel calls: ${result.modelCalls.length}, estimated cost $${cost.toFixed(4)}`);
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

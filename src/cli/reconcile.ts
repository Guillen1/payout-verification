import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { reconcilePeriod, type CarrierOutcome } from "../application/reconcile-period";
import { isPeriod } from "../domain/dates";
import { formatMoney } from "../domain/money";
import { renderAgencyPayouts, renderAllocationLines } from "../reporting/payout-file";
import { renderRunReport } from "../reporting/run-report";
import { loadPolicyBook } from "../tenant/policy-book";
import { loadTenant } from "../tenant/tenant";

const { values } = parseArgs({
  options: {
    tenant: { type: "string", default: "tenants/agency-network" },
    data: { type: "string", default: "data/demo" },
    out: { type: "string", default: "out" },
    period: { type: "string", default: "2026-09" }
  }
});

if (!isPeriod(values.period)) throw new Error(`--period must look like 2026-09, got "${values.period}"`);

const tenant = await loadTenant(values.tenant);
const policies = await loadPolicyBook(join(values.data, "book", "policies.csv"));
const result = await reconcilePeriod({
  tenant,
  policies,
  inboxDirectory: join(values.data, "inbox"),
  period: values.period
});

const outDirectory = join(values.out, values.period);
await mkdir(outDirectory, { recursive: true });
await writeFile(join(outDirectory, "report.md"), renderRunReport(result, tenant));
await writeFile(join(outDirectory, "agency-payouts.csv"), renderAgencyPayouts(result));
await writeFile(join(outDirectory, "allocation-lines.csv"), renderAllocationLines(result));
await writeFile(join(outDirectory, "result.json"), `${JSON.stringify(result, null, 2)}\n`);

console.log(`\n${tenant.name}, period ${values.period}\n`);
for (const outcome of result.carriers) console.log(`  ${outcome.carrier.name.padEnd(26)} ${summarize(outcome)}`);
console.log(`\nReport and payout files in ${outDirectory}/\n`);

function summarize(outcome: CarrierOutcome): string {
  switch (outcome.status) {
    case "statement_missing":
      return "no statement received";
    case "format_drift":
      return `HELD, layout changed (missing ${outcome.headerCheck.missing.join(", ") || "none"})`;
    case "invalid_rows":
      return `HELD, ${outcome.problems.length} unreadable value(s)`;
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

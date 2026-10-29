import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { reconcilePeriod, type CarrierOutcome } from "../application/reconcile-period";
import { isPeriod } from "../domain/dates";
import { formatMoney } from "../domain/money";
import { renderProposal } from "../extraction/propose-format";
import { createModelClient } from "../model/create-model-client";
import { renderAgencyPayouts, renderAllocationLines } from "../reporting/payout-file";
import { renderRunReport } from "../reporting/run-report";
import { loadPolicyBook } from "../tenant/policy-book";
import { loadTenant } from "../tenant/tenant";

loadEnvFileIfPresent();

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
  period: values.period,
  model: createModelClient()
});

const outDirectory = join(values.out, values.period);
await mkdir(outDirectory, { recursive: true });
await writeFile(join(outDirectory, "report.md"), renderRunReport(result, tenant));
await writeFile(join(outDirectory, "agency-payouts.csv"), renderAgencyPayouts(result));
await writeFile(join(outDirectory, "allocation-lines.csv"), renderAllocationLines(result));
await writeFile(join(outDirectory, "result.json"), `${JSON.stringify(result, null, 2)}\n`);

const proposals: string[] = [];
for (const outcome of result.carriers) {
  if (outcome.status !== "format_drift" || outcome.proposal === null || outcome.proposal.status === "no_answer")
    continue;
  if (outcome.proposal.format === null) continue;
  const path = join(outDirectory, "proposals", `${outcome.proposal.format.id}.yaml`);
  await mkdir(join(outDirectory, "proposals"), { recursive: true });
  await writeFile(
    path,
    renderProposal({ ...outcome.proposal, format: outcome.proposal.format }, outcome.proposal.status === "verified")
  );
  proposals.push(path);
}

console.log(`\n${tenant.name}, period ${values.period}\n`);
for (const outcome of result.carriers) console.log(`  ${outcome.carrier.name.padEnd(26)} ${summarize(outcome)}`);
if (proposals.length > 0)
  console.log(`\nProposed mappings to review:\n${proposals.map(path => `  ${path}`).join("\n")}`);
const cost = result.modelCalls.reduce((total, call) => total + (call.estimatedCostUsd ?? 0), 0);
if (result.modelCalls.length > 0)
  console.log(`\nModel calls: ${result.modelCalls.length}, estimated cost $${cost.toFixed(4)}`);
console.log(`\nReport and payout files in ${outDirectory}/\n`);

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

function loadEnvFileIfPresent(): void {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file: credentials may come from the environment, or the run uses recordings only.
  }
}

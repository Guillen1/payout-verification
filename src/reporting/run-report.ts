import { payoutsByAgency } from "../domain/allocation";
import type { LineResult } from "../domain/line-result";
import { formatMoney } from "../domain/money";
import type { CarrierOutcome, PeriodResult } from "../application/reconcile-period";
import type { Tenant } from "../tenant/tenant";
import { allocationsOf } from "./payout-file";

/**
 * The period report for the finance team, in Markdown. It leads with what needs a person, because
 * that is what someone opens the report for.
 */
export function renderRunReport(result: PeriodResult, tenant: Tenant): string {
  const agencyNames = new Map(tenant.agencies.map(agency => [agency.agencyId, agency.name]));
  const sections = [
    `# Commission reconciliation: ${tenant.name}, ${result.period}`,
    summaryTable(result),
    notProcessedSection(result),
    linesSection(result, "dispute", "Dispute with the carrier", "The money was allocated; the amount is wrong."),
    linesSection(result, "review", "Review before payout", "This money is held until someone decides."),
    missingSection(result),
    payoutSection(result, agencyNames)
  ];
  return `${sections.filter(Boolean).join("\n\n")}\n`;
}

function summaryTable(result: PeriodResult): string {
  const rows = result.carriers.map(outcome => {
    if (outcome.status !== "processed") return tableRow([outcome.carrier.name, describeStatus(outcome)], 9);
    const reconciliation = outcome.reconciliation;
    if (reconciliation.status === "held") {
      return tableRow([outcome.carrier.name, "Held: does not tie out"], 9);
    }
    const totals = reconciliation.totals;
    return tableRow([
      outcome.carrier.name,
      "Reconciled",
      reconciliation.lines.length,
      formatMoney(totals.paidCents),
      formatMoney(totals.toAgenciesCents),
      formatMoney(totals.toNetworkCents),
      formatMoney(totals.heldCents),
      formatMoney(totals.disputedVarianceCents),
      formatMoney(totals.missingExpectedCents)
    ]);
  });

  return [
    "## Summary",
    "",
    "| Carrier | Status | Lines | Paid | To agencies | To network | Held | Disputed variance | Not received (est.) |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows
  ].join("\n");
}

function notProcessedSection(result: PeriodResult): string {
  const problems = result.carriers.flatMap(outcome => {
    switch (outcome.status) {
      case "processed":
        if (outcome.reconciliation.status === "reconciled") return [];
        return [
          `- **${outcome.carrier.name}**: the lines add up to ${formatMoney(outcome.reconciliation.tieOut.extractedTotalCents)} ` +
            `but the statement total is ${formatMoney(outcome.reconciliation.tieOut.statedTotalCents)}. Nothing was allocated.`
        ];
      case "statement_missing":
        return [`- **${outcome.carrier.name}**: no statement received at \`${outcome.file}\`.`];
      case "format_drift":
        return [
          `- **${outcome.carrier.name}**: the statement layout changed, so it was not processed. ` +
            `Missing columns: ${list(outcome.headerCheck.missing)}. New columns: ${list(outcome.headerCheck.unexpected)}.`
        ];
      case "invalid_rows":
        return [
          `- **${outcome.carrier.name}**: ${outcome.problems.length} unreadable value(s), so it was not processed.`,
          ...outcome.problems.map(problem => `  - Row ${problem.row}, ${problem.column}: ${problem.message}`)
        ];
    }
  });
  return problems.length === 0 ? "" : ["## Statements not processed", "", ...problems].join("\n");
}

function linesSection(
  result: PeriodResult,
  disposition: LineResult["disposition"],
  title: string,
  note: string
): string {
  const rows = result.carriers.flatMap(outcome =>
    outcome.status === "processed" && outcome.reconciliation.status === "reconciled"
      ? outcome.reconciliation.lines
          .filter(line => line.disposition === disposition)
          .map(line =>
            [
              outcome.carrier.name,
              line.line.source.row,
              line.policy?.policyNumber ?? line.line.policyNumber ?? "(blank)",
              line.finding.replaceAll("_", " "),
              formatMoney(line.line.commissionCents),
              line.explanation
            ].join(" | ")
          )
      : []
  );
  if (rows.length === 0) return "";
  return [
    `## ${title}`,
    "",
    note,
    "",
    "| Carrier | Row | Policy | Finding | Paid | Detail |",
    "| --- | ---: | --- | --- | ---: | --- |",
    ...rows.map(row => `| ${row} |`)
  ].join("\n");
}

function missingSection(result: PeriodResult): string {
  const rows = result.carriers.flatMap(outcome =>
    outcome.status === "processed" && outcome.reconciliation.status === "reconciled"
      ? outcome.reconciliation.missing.map(
          ({ policy, expectedCents }) =>
            `| ${outcome.carrier.name} | ${policy.policyNumber} | ${policy.agencyId} | ${policy.effectiveDate} | ` +
            `${expectedCents === null ? "unknown" : formatMoney(expectedCents)} |`
        )
      : []
  );
  if (rows.length === 0) return "";
  return [
    "## Commission not received",
    "",
    "Policies that took effect this period and appear on no statement line.",
    "",
    "| Carrier | Policy | Agency | Effective | Expected |",
    "| --- | --- | --- | --- | ---: |",
    ...rows
  ].join("\n");
}

function payoutSection(result: PeriodResult, agencyNames: Map<string, string>): string {
  const payouts = payoutsByAgency(allocationsOf(result));
  if (payouts.length === 0) return "";
  return [
    "## Agency payouts",
    "",
    "| Agency | Lines | Commission | To agency | To network |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...payouts.map(
      payout =>
        `| ${agencyNames.get(payout.agencyId) ?? payout.agencyId} | ${payout.lineCount} | ${formatMoney(payout.paidCents)} | ` +
        `${formatMoney(payout.agencyCents)} | ${formatMoney(payout.networkCents)} |`
    )
  ].join("\n");
}

function describeStatus(outcome: CarrierOutcome): string {
  switch (outcome.status) {
    case "statement_missing":
      return "No statement";
    case "format_drift":
      return "Held: layout changed";
    case "invalid_rows":
      return "Held: unreadable values";
    case "processed":
      return "Processed";
  }
}

function list(items: readonly string[]): string {
  return items.length === 0 ? "none" : items.map(item => `"${item}"`).join(", ");
}

/** A Markdown table row, padded with empty cells up to the column count. */
function tableRow(cells: readonly (string | number)[], columns = cells.length): string {
  const padded = [...cells, ...Array<string>(Math.max(0, columns - cells.length)).fill("")];
  return `| ${padded.join(" | ")} |`;
}

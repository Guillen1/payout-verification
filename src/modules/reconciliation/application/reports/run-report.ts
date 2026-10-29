import { payoutsByAgency } from "../../domain/allocation";
import type { LineResult } from "../../domain/line-result";
import { formatMoney } from "../../domain/money";
import type { CarrierOutcome, PeriodResult } from "../services/reconcile-period.service";
import type { FormatProposal } from "../../../extraction/application/services/format-proposal.service";
import type { Tenant } from "../../infrastructure/tenant-files";
import { allocationsOf } from "./payout-files";

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
    payoutSection(result, agencyNames),
    modelSection(result)
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
    const name = `**${outcome.carrier.name}**`;
    switch (outcome.status) {
      case "processed": {
        if (outcome.reconciliation.status === "reconciled") return [];
        const { extractedTotalCents, statedTotalCents } = outcome.reconciliation.tieOut;
        return [
          `- ${name}: the lines add up to ${formatMoney(extractedTotalCents)} but the statement total is ` +
            `${formatMoney(statedTotalCents)}. Nothing was allocated.`
        ];
      }
      case "statement_missing":
        return [`- ${name}: no statement received at \`${outcome.file}\`.`];
      case "format_drift":
        return [
          `- ${name}: the statement layout changed, so it was not processed. ` +
            `Missing columns: ${list(outcome.headerCheck.missing)}. New columns: ${list(outcome.headerCheck.unexpected)}.`,
          `  - ${describeProposal(outcome.proposal)}`
        ];
      case "invalid_lines":
        return [
          `- ${name}: ${outcome.problems.length} unreadable value(s), so it was not processed.`,
          ...outcome.problems.map(problem => `  - ${problem.location}, ${problem.field}: ${problem.message}`)
        ];
      case "unreadable":
        return [`- ${name}: the statement could not be read. ${outcome.reason}`];
      case "model_unavailable":
        return [`- ${name}: not processed because the model was unavailable. ${outcome.reason}`];
    }
  });
  return problems.length === 0 ? "" : ["## Statements not processed", "", ...problems].join("\n");
}

function describeProposal(proposal: FormatProposal | null): string {
  if (proposal === null) return "No mapping was proposed because no model is configured.";
  switch (proposal.status) {
    case "verified":
      return (
        `A model proposed an updated mapping that reads all ${proposal.lineCount} lines and ties out to the cent. ` +
        `It is in this run's proposals folder, waiting for review.`
      );
    case "unverified":
      return `A model proposed a mapping, but it failed the check: ${proposal.reason} It is not usable as is.`;
    case "no_answer":
      return `No mapping was proposed: ${proposal.reason}`;
  }
}

function modelSection(result: PeriodResult): string {
  if (result.modelCalls.length === 0) return "";
  const rows = result.modelCalls.map(call =>
    tableRow([
      call.task,
      call.model,
      call.source,
      call.inputTokens,
      call.outputTokens,
      `${(call.latencyMs / 1000).toFixed(1)}s`,
      call.estimatedCostUsd === null ? "unknown" : `$${call.estimatedCostUsd.toFixed(4)}`
    ])
  );
  return [
    "## Model use",
    "",
    "The model reads PDFs and proposes mappings for changed layouts. It never computes amounts.",
    "",
    "| Task | Model | Source | Input tokens | Output tokens | Latency | Est. cost |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: |",
    ...rows
  ].join("\n");
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
    case "invalid_lines":
      return "Held: unreadable values";
    case "unreadable":
      return "Held: could not be read";
    case "model_unavailable":
      return "Held: model unavailable";
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

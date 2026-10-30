import { payoutsByAgency } from "../../domain/allocation";
import type { LineResult } from "../../domain/line-result";
import { formatMoney } from "../../domain/money";
import { capitalized, withoutArticle, type Vocabulary } from "../../domain/vocabulary";
import type { CarrierOutcome, PeriodResult } from "../services/reconcile-period.service";
import type { Tenant } from "../../infrastructure/tenant-files";
import { describeHold } from "../views/period-view";
import { allocationsOf } from "./payout-files";

/**
 * The period report for the finance team, in Markdown. It leads with what needs a person, because
 * that is what someone opens the report for.
 */
export function renderRunReport(result: PeriodResult, tenant: Tenant): string {
  const agencyNames = new Map(tenant.agencies.map(agency => [agency.agencyId, agency.name]));
  const words = tenant.vocabulary;
  const sections = [
    `# ${capitalized(words.payment)} reconciliation: ${tenant.name}, ${result.period}`,
    summaryTable(result, words),
    notProcessedSection(result),
    linesSection(
      result,
      words,
      "dispute",
      `Dispute with the ${words.counterparty}`,
      "The money was allocated; the amount is wrong."
    ),
    linesSection(result, words, "review", "Review before payout", "This money is held until someone decides."),
    missingSection(result, words),
    payoutSection(result, agencyNames, words),
    modelSection(result)
  ];
  return `${sections.filter(Boolean).join("\n\n")}\n`;
}

function summaryTable(result: PeriodResult, words: Vocabulary): string {
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
    `| ${capitalized(words.counterparty)} | Status | Lines | Paid | To ${words.partners} | To ${withoutArticle(words.organization)} | Held | Disputed variance | Not received (est.) |`,
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows
  ].join("\n");
}

function notProcessedSection(result: PeriodResult): string {
  const problems = result.carriers.flatMap(outcome => {
    const hold = describeHold(outcome);
    if (hold === null) return [];
    return [`- **${outcome.carrier.name}**: ${hold.reason}`, ...hold.details.map(detail => `  - ${detail}`)];
  });
  return problems.length === 0 ? "" : ["## Statements not processed", "", ...problems].join("\n");
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
  words: Vocabulary,
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
              line.expectedCents === null ? "" : formatMoney(line.expectedCents),
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
    `| ${capitalized(words.counterparty)} | Row | ${capitalized(words.item)} | Finding | Paid | Expected | Detail |`,
    "| --- | ---: | --- | --- | ---: | ---: | --- |",
    ...rows.map(row => `| ${row} |`)
  ].join("\n");
}

function missingSection(result: PeriodResult, words: Vocabulary): string {
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
    `## ${capitalized(words.payment)} not received`,
    "",
    `${capitalized(words.items)} that took effect this period and appear on no statement line.`,
    "",
    `| ${capitalized(words.counterparty)} | ${capitalized(words.item)} | ${capitalized(words.partner)} | Effective | Expected |`,
    "| --- | --- | --- | --- | ---: |",
    ...rows
  ].join("\n");
}

function payoutSection(result: PeriodResult, agencyNames: Map<string, string>, words: Vocabulary): string {
  const payouts = payoutsByAgency(allocationsOf(result));
  if (payouts.length === 0) return "";
  return [
    `## ${capitalized(words.partner)} payouts`,
    "",
    `| ${capitalized(words.partner)} | Lines | ${capitalized(words.payment)} | To ${words.partner} | To ${withoutArticle(words.organization)} |`,
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
    case "paused":
      return "Paused by a person";
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

/** A Markdown table row, padded with empty cells up to the column count. */
function tableRow(cells: readonly (string | number)[], columns = cells.length): string {
  const padded = [...cells, ...Array<string>(Math.max(0, columns - cells.length)).fill("")];
  return `| ${padded.join(" | ")} |`;
}

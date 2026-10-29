import { stringify } from "csv-stringify/sync";
import { renderDisputeLetter } from "../../../reconciliation/application/reports/dispute-letter";
import { formatMoney, formatMoneyPlain, formatRate } from "../../../reconciliation/domain/money";
import type { BonusFinding, BonusCheck } from "../../domain/check-bonus";
import type { BonusResult } from "../services/bonus-verification.service";

interface Names {
  network: string;
  carrier: string;
  agency: (agencyId: string) => string;
}

export function renderBonusReport(result: BonusResult, names: Names): string {
  const { program, outcome } = result;
  const title = `# Profit-sharing bonus: ${names.carrier}, program year ${program.programYear}`;

  switch (outcome.status) {
    case "awaiting_approval": {
      const draft = outcome.draft;
      const next =
        draft.status === "drafted"
          ? "A model drafted the rules from the agreement. They are in proposed-rules.yaml, waiting for a person to check each one against its clause and approve it."
          : draft.status === "invalid"
            ? `A model read the agreement, but its terms do not make valid rules: ${draft.reason}`
            : `No rules could be drafted: ${draft.reason}`;
      return [title, "", `**Not checked.** ${outcome.reason}`, "", next, ""].join("\n");
    }
    case "statement_invalid":
      return [
        title,
        "",
        "**Not checked.** The carrier's bonus statement could not be read:",
        "",
        ...outcome.problems.map(problem => `- ${problem}`),
        ""
      ].join("\n");
    case "checked": {
      const { check, allocation } = outcome;
      return [
        title,
        "",
        "## Summary",
        "",
        verdict(check),
        "",
        "## How the expected bonus was computed",
        "",
        "| Step | Value | Clause |",
        "| --- | ---: | --- |",
        ...check.expected.steps.map(step => `| ${step.step} | ${step.value} | ${step.clause ?? ""} |`),
        "",
        "Earned premium and incurred losses are the carrier's figures: only the carrier has them.",
        "",
        "## Findings",
        "",
        ...(check.findings.length === 0
          ? ["The statement matches the agreement and the network's records."]
          : check.findings.map(finding => `- ${describeFinding(finding, names)}`)),
        "",
        "## Bonus shares",
        "",
        `Split from what was paid: the network keeps ${formatRate(program.networkShareBps)}, and the rest goes to agencies by eligible premium.`,
        "",
        "| Agency | Eligible premium | Share |",
        "| --- | ---: | ---: |",
        ...allocation.agencies.map(
          share =>
            `| ${names.agency(share.agencyId)} | ${formatMoney(share.eligiblePremiumCents)} | ${formatMoney(share.agencyCents)} |`
        ),
        `| Network | | ${formatMoney(allocation.networkCents)} |`,
        `| **Paid** | | **${formatMoney(allocation.paidCents)}** |`,
        ""
      ].join("\n");
    }
  }
}

export function renderBonusShares(result: BonusResult): string {
  if (result.outcome.status !== "checked") return "";
  const { allocation } = result.outcome;
  return stringify([
    ["agency_id", "eligible_premium", "bonus_share"],
    ...allocation.agencies.map(share => [
      share.agencyId,
      formatMoneyPlain(share.eligiblePremiumCents),
      formatMoneyPlain(share.agencyCents)
    ]),
    ["network", "", formatMoneyPlain(allocation.networkCents)]
  ]);
}

/** A draft dispute letter when the carrier underpaid, otherwise null. */
export function renderBonusDispute(result: BonusResult, names: Names): string | null {
  if (result.outcome.status !== "checked" || result.outcome.check.disposition !== "dispute") return null;
  const { check } = result.outcome;
  const codes = new Map(Object.entries(result.program.producerCodes).map(([code, agencyId]) => [agencyId, code]));
  const withCode: Names = {
    ...names,
    agency: agencyId => `${names.agency(agencyId)} (producer code ${codes.get(agencyId) ?? "unknown"})`
  };
  return renderDisputeLetter({
    to: `${names.carrier}, agency accounting`,
    from: names.network,
    subject: `Profit-sharing bonus for ${result.program.programYear}: underpayment`,
    opening: `We have checked the ${result.program.programYear} profit-sharing statement against our agreement and our production records. The bonus paid is ${formatMoney(check.paidCents)}; by our figures the agreement provides for ${formatMoney(check.expected.bonusCents)}. The differences are below.`,
    items: [
      ...check.findings.map(finding => disputeItem(finding, withCode)),
      {
        reference: "Bonus",
        issue: "Amount paid",
        stated: formatMoney(check.paidCents),
        expected: formatMoney(check.expected.bonusCents)
      }
    ],
    owedCents: -check.varianceCents
  });
}

function verdict(check: BonusCheck): string {
  const paid = formatMoney(check.paidCents);
  const expected = formatMoney(check.expected.bonusCents);
  const difference = formatMoney(Math.abs(check.varianceCents));
  switch (check.disposition) {
    case "dispute":
      return `**Dispute.** The carrier paid ${paid}; the agreement and the network's records support ${expected}. Underpaid by ${difference}. A draft letter is in dispute-letter.md.`;
    case "review":
      return `**Review.** The carrier paid ${paid}, more than the ${expected} the agreement supports, by ${difference}. Check before accepting it: an overpayment is usually taken back later.`;
    case "clear":
      return `**Clear.** The carrier paid ${paid}, matching the ${expected} the agreement supports.`;
  }
}

function describeFinding(finding: BonusFinding, names: Names): string {
  switch (finding.kind) {
    case "premium_difference":
      return `${names.agency(finding.agencyId)}: the statement counts ${formatMoney(finding.statementCents)} of eligible premium; the network's records show ${formatMoney(finding.networkCents)} (clause ${finding.clause}).`;
    case "loss_ratio_differs":
      return `The statement gives a loss ratio of ${formatRate(finding.statedBps)}, but its own figures give ${formatRate(finding.computedBps)} (clause ${finding.clause}).`;
    case "rate_differs":
      return `The statement applies a bonus rate of ${formatRate(finding.statedBps)}; the agreement sets ${formatRate(finding.agreementBps)} for this loss ratio (clause ${finding.clause}).`;
  }
}

function disputeItem(finding: BonusFinding, names: Names) {
  switch (finding.kind) {
    case "premium_difference":
      return {
        reference: `Clause ${finding.clause}`,
        issue: `Eligible premium, ${names.agency(finding.agencyId)}`,
        stated: formatMoney(finding.statementCents),
        expected: formatMoney(finding.networkCents)
      };
    case "loss_ratio_differs":
      return {
        reference: `Clause ${finding.clause}`,
        issue: "Loss ratio",
        stated: formatRate(finding.statedBps),
        expected: formatRate(finding.computedBps)
      };
    case "rate_differs":
      return {
        reference: `Clause ${finding.clause}`,
        issue: "Bonus rate for the loss ratio",
        stated: formatRate(finding.statedBps),
        expected: formatRate(finding.agreementBps)
      };
  }
}

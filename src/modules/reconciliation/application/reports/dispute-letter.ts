import { carrierClaims } from "../../domain/carrier-claims";
import { formatMoney, type Cents } from "../../domain/money";
import { capitalized, DEFAULT_VOCABULARY, type Vocabulary } from "../../domain/vocabulary";
import type { CarrierOutcome } from "../services/reconcile-period.service";

export interface DisputeItem {
  reference: string;
  issue: string;
  stated: string;
  expected: string;
}

/**
 * A draft letter to a carrier about an underpayment, for a person to review and send.
 *
 * Filled from a template rather than written by a model: every figure in it comes straight from
 * the reconciliation, and a letter quoting money to a carrier has to be exact.
 */
export function renderDisputeLetter(letter: {
  to: string;
  from: string;
  subject: string;
  opening: string;
  items: DisputeItem[];
  owedCents: Cents;
  /** Whose figure the first amount column is: "Carrier's figure". */
  theirFigure?: string;
}): string {
  const rows = letter.items.map(item => `| ${item.reference} | ${item.issue} | ${item.stated} | ${item.expected} |`);
  return [
    "<!-- DRAFT generated from the reconciliation. Review before sending. -->",
    "",
    `**To:** ${letter.to}`,
    `**From:** ${letter.from}`,
    `**Subject:** ${letter.subject}`,
    "",
    "Hello,",
    "",
    letter.opening,
    "",
    `| Reference | Issue | ${letter.theirFigure ?? "Carrier's figure"} | Our figure |`,
    "| --- | --- | ---: | ---: |",
    ...rows,
    "",
    `By our figures, ${formatMoney(letter.owedCents)} is still owed. Please send the corrected amount, or the figures you used if yours differ from ours, so we can reconcile them.`,
    "",
    "Thank you,",
    "",
    letter.from,
    ""
  ].join("\n");
}

/** A draft letter for one carrier's underpaid and missing commissions in a period, or null if there are none. */
export function renderCommissionDispute(
  outcome: CarrierOutcome,
  period: string,
  networkName: string,
  words: Vocabulary = DEFAULT_VOCABULARY
): string | null {
  if (outcome.status !== "processed" || outcome.reconciliation.status !== "reconciled") return null;
  const { underpaid, unpaid, owedCents } = carrierClaims(outcome.reconciliation);
  if (underpaid.length === 0 && unpaid.length === 0) return null;

  const Item = capitalized(words.item);
  const items: DisputeItem[] = [
    ...underpaid.map(result => ({
      reference: `${Item} ${result.policy?.policyNumber ?? result.line.policyNumber ?? "(blank)"}`,
      issue: result.explanation,
      stated: formatMoney(result.line.commissionCents),
      expected: formatMoney(result.expectedCents ?? 0)
    })),
    ...unpaid.map(entry => ({
      reference: `${Item} ${entry.policy.policyNumber}`,
      issue: `No ${words.payment} received for this ${words.item}, ${words.date} ${entry.policy.effectiveDate}.`,
      stated: formatMoney(0),
      expected: formatMoney(entry.expectedCents ?? 0)
    }))
  ];

  return renderDisputeLetter({
    to: `${outcome.carrier.name}, ${words.disputeDesk}`,
    from: networkName,
    subject: `${capitalized(words.statement)} for ${period}: underpaid and missing ${words.payment}`,
    opening: `We have reconciled your ${words.statement} for ${period} against our ${words.item} records and the ${words.rates} in our agreement. The lines below were paid less than the agreed rate, or not paid at all.`,
    items,
    owedCents,
    theirFigure: `${capitalized(words.counterparty)}'s figure`
  });
}

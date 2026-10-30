import { carrierClaims } from "../../domain/carrier-claims";
import { formatMoney, type Cents } from "../../domain/money";
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
    "| Reference | Issue | Carrier's figure | Our figure |",
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
export function renderCommissionDispute(outcome: CarrierOutcome, period: string, networkName: string): string | null {
  if (outcome.status !== "processed" || outcome.reconciliation.status !== "reconciled") return null;
  const { underpaid, unpaid, owedCents } = carrierClaims(outcome.reconciliation);
  if (underpaid.length === 0 && unpaid.length === 0) return null;

  const items: DisputeItem[] = [
    ...underpaid.map(result => ({
      reference: `Policy ${result.policy?.policyNumber ?? result.line.policyNumber ?? "(blank)"}`,
      issue: result.explanation,
      stated: formatMoney(result.line.commissionCents),
      expected: formatMoney(result.expectedCents ?? 0)
    })),
    ...unpaid.map(entry => ({
      reference: `Policy ${entry.policy.policyNumber}`,
      issue: `No commission received for this policy, effective ${entry.policy.effectiveDate}.`,
      stated: formatMoney(0),
      expected: formatMoney(entry.expectedCents ?? 0)
    }))
  ];

  return renderDisputeLetter({
    to: `${outcome.carrier.name}, agency accounting`,
    from: networkName,
    subject: `Commission statement for ${period}: underpaid and missing commission`,
    opening: `We have reconciled your commission statement for ${period} against our policy records and the commission rates in our agreement. The lines below were paid less than the agreed rate, or not paid at all.`,
    items,
    owedCents
  });
}

import type { LineResult } from "./line-result";
import type { MissingCommission } from "./missing-commissions";
import { sumCents, type Cents } from "./money";

export interface CarrierClaims {
  /** Lines paid below the agreed rate. */
  underpaid: LineResult[];
  /** Policies with no commission at all, where the expected amount is known. */
  unpaid: MissingCommission[];
  owedCents: Cents;
}

/** What a carrier still owes on a reconciled statement. Overpayments are reviewed, not claimed. */
export function carrierClaims(reconciliation: { lines: LineResult[]; missing: MissingCommission[] }): CarrierClaims {
  const underpaid = reconciliation.lines.filter(
    result => result.disposition === "dispute" && result.varianceCents !== null && result.varianceCents < 0
  );
  const unpaid = reconciliation.missing.filter(entry => entry.expectedCents !== null);
  const owedCents = sumCents([
    ...underpaid.map(result => -(result.varianceCents ?? 0)),
    ...unpaid.map(entry => entry.expectedCents ?? 0)
  ]);
  return { underpaid, unpaid, owedCents };
}

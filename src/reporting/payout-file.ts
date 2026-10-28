import { stringify } from "csv-stringify/sync";
import { payoutsByAgency, type Allocation } from "../domain/allocation";
import { formatMoneyPlain } from "../domain/money";
import type { PeriodResult } from "../application/reconcile-period";

export function allocationsOf(result: PeriodResult): Allocation[] {
  return result.carriers.flatMap(outcome =>
    outcome.status === "processed" && outcome.reconciliation.status === "reconciled"
      ? outcome.reconciliation.allocations
      : []
  );
}

/** One row per allocated line: the detail an agency can check its payment against. */
export function renderAllocationLines(result: PeriodResult): string {
  return stringify(
    allocationsOf(result).map(allocation => ({
      period: result.period,
      agency_id: allocation.agencyId,
      carrier_id: allocation.carrierId,
      policy_number: allocation.policyNumber,
      source_file: allocation.source.file,
      source_row: allocation.source.row,
      commission_paid: formatMoneyPlain(allocation.paidCents),
      agency_share_bps: allocation.agencyShareBps,
      agency_amount: formatMoneyPlain(allocation.agencyCents),
      network_amount: formatMoneyPlain(allocation.networkCents)
    })),
    { header: true }
  );
}

/** One row per agency: what to pay. */
export function renderAgencyPayouts(result: PeriodResult): string {
  return stringify(
    payoutsByAgency(allocationsOf(result)).map(payout => ({
      period: result.period,
      agency_id: payout.agencyId,
      lines: payout.lineCount,
      commission_paid: formatMoneyPlain(payout.paidCents),
      agency_amount: formatMoneyPlain(payout.agencyCents),
      network_amount: formatMoneyPlain(payout.networkCents)
    })),
    { header: true }
  );
}

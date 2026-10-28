import type { LineResult } from "./line-result";
import { applyRate, sumCents, type BasisPoints, type Cents } from "./money";
import type { SourceRef } from "./types";

/** One line's commission divided between the agency that wrote the policy and the network. */
export interface Allocation {
  carrierId: string;
  agencyId: string;
  policyNumber: string;
  source: SourceRef;
  paidCents: Cents;
  agencyShareBps: BasisPoints;
  agencyCents: Cents;
  networkCents: Cents;
}

export interface AgencyPayout {
  agencyId: string;
  lineCount: number;
  paidCents: Cents;
  agencyCents: Cents;
  networkCents: Cents;
}

/**
 * Splits the commission on every line that is not held for review.
 *
 * The network's share is the remainder after the agency's rounded share, so agency plus network
 * always equals what was paid, to the cent.
 */
export function allocate(carrierId: string, results: readonly LineResult[]): Allocation[] {
  const allocations: Allocation[] = [];
  for (const result of results) {
    if (result.disposition === "review" || result.policy === null || result.agencySplit === null) continue;

    const paidCents = result.line.commissionCents;
    const agencyCents = applyRate(paidCents, result.agencySplit.agencyShareBps);
    allocations.push({
      carrierId,
      agencyId: result.policy.agencyId,
      policyNumber: result.policy.policyNumber,
      source: result.line.source,
      paidCents,
      agencyShareBps: result.agencySplit.agencyShareBps,
      agencyCents,
      networkCents: paidCents - agencyCents
    });
  }
  return allocations;
}

export function payoutsByAgency(allocations: readonly Allocation[]): AgencyPayout[] {
  const byAgency = Map.groupBy(allocations, allocation => allocation.agencyId);
  return [...byAgency.entries()]
    .map(([agencyId, lines]) => ({
      agencyId,
      lineCount: lines.length,
      paidCents: sumCents(lines.map(line => line.paidCents)),
      agencyCents: sumCents(lines.map(line => line.agencyCents)),
      networkCents: sumCents(lines.map(line => line.networkCents))
    }))
    .sort((a, b) => a.agencyId.localeCompare(b.agencyId));
}

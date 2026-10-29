import { applyRate, sumCents, type BasisPoints, type Cents } from "../../reconciliation/domain/money";

export interface BonusShare {
  agencyId: string;
  eligiblePremiumCents: Cents;
  agencyCents: Cents;
}

export interface BonusAllocation {
  paidCents: Cents;
  networkCents: Cents;
  agencies: BonusShare[];
}

/**
 * Splits a bonus that was paid: the network keeps its share, and the rest goes to agencies in
 * proportion to the eligible premium each wrote.
 *
 * Shares are rounded down and the leftover cents go to the largest remainders, so the agencies'
 * shares and the network's add up to exactly what was paid.
 */
export function allocateBonus(
  paidCents: Cents,
  networkShareBps: BasisPoints,
  eligiblePremiumByAgency: Record<string, Cents>
): BonusAllocation {
  const entries = Object.entries(eligiblePremiumByAgency)
    .filter(([, premium]) => premium > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  const totalPremium = sumCents(entries.map(([, premium]) => premium));
  const pool = totalPremium > 0 ? paidCents - applyRate(paidCents, networkShareBps) : 0;

  // BigInt: pool times premium can exceed the integers a JavaScript number holds exactly.
  const shares = entries.map(([agencyId, premium]) => {
    const exact = BigInt(pool) * BigInt(premium);
    return {
      agencyId,
      eligiblePremiumCents: premium,
      agencyCents: Number(exact / BigInt(totalPremium)),
      remainder: exact % BigInt(totalPremium)
    };
  });

  let leftover = pool - sumCents(shares.map(share => share.agencyCents));
  const byRemainder = [...shares].sort((a, b) => (b.remainder > a.remainder ? 1 : b.remainder < a.remainder ? -1 : 0));
  for (const share of byRemainder) {
    if (leftover === 0) break;
    share.agencyCents += 1;
    leftover -= 1;
  }

  const agencies = shares.map(({ agencyId, eligiblePremiumCents, agencyCents }) => ({
    agencyId,
    eligiblePremiumCents,
    agencyCents
  }));
  return { paidCents, networkCents: paidCents - sumCents(agencies.map(share => share.agencyCents)), agencies };
}

import {
  applyRate,
  formatMoney,
  formatRate,
  sumCents,
  type BasisPoints,
  type Cents
} from "../../reconciliation/domain/money";
import type { BonusRules } from "./bonus-rules";

/** Written premium in the network's own records for the program year, by agency and product. */
export interface ProductionRow {
  agencyId: string;
  product: string;
  writtenPremiumCents: Cents;
}

/** One step of the calculation, with the clause behind it. */
export interface CalculationStep {
  step: string;
  value: string;
  clause: string | null;
}

export interface ExpectedBonus {
  eligiblePremiumByAgency: Record<string, Cents>;
  eligiblePremiumCents: Cents;
  lossRatioBps: BasisPoints;
  qualifies: boolean;
  rateBps: BasisPoints;
  bonusCents: Cents;
  steps: CalculationStep[];
}

/**
 * What the agreement says the carrier owes.
 *
 * Premium comes from the network's own records. Earned premium and incurred losses come from the
 * carrier, because only the carrier has them; the report says so.
 */
export function computeExpectedBonus(
  rules: BonusRules,
  production: readonly ProductionRow[],
  carrier: { earnedPremiumCents: Cents; incurredLossesCents: Cents }
): ExpectedBonus {
  const eligible = new Set(rules.eligibleProducts.products);
  const eligiblePremiumByAgency: Record<string, Cents> = {};
  for (const row of production) {
    if (!eligible.has(row.product)) continue;
    eligiblePremiumByAgency[row.agencyId] = (eligiblePremiumByAgency[row.agencyId] ?? 0) + row.writtenPremiumCents;
  }
  const eligiblePremiumCents = sumCents(Object.values(eligiblePremiumByAgency));

  const qualifies = eligiblePremiumCents >= rules.minimumPremium.cents;
  const lossRatioBps = lossRatio(carrier.incurredLossesCents, carrier.earnedPremiumCents);
  const rateBps = bonusRate(rules, lossRatioBps);
  const uncappedCents = qualifies ? applyRate(eligiblePremiumCents, rateBps) : 0;
  const maximum = rules.maximumBonus;
  const bonusCents = maximum ? Math.min(uncappedCents, maximum.cents) : uncappedCents;

  const steps: CalculationStep[] = [
    {
      step: `Eligible written premium (${rules.eligibleProducts.products.join(", ")}), network records`,
      value: formatMoney(eligiblePremiumCents),
      clause: rules.eligibleProducts.clause
    },
    {
      step: `Minimum to qualify: ${formatMoney(rules.minimumPremium.cents)}`,
      value: qualifies ? "met" : "not met",
      clause: rules.minimumPremium.clause
    },
    {
      step: `Loss ratio: ${formatMoney(carrier.incurredLossesCents)} incurred / ${formatMoney(carrier.earnedPremiumCents)} earned, carrier figures`,
      value: formatRate(lossRatioBps),
      clause: rules.lossRatioBands.clause
    },
    { step: "Bonus rate for that loss ratio", value: formatRate(rateBps), clause: rules.lossRatioBands.clause },
    { step: "Bonus before any maximum", value: formatMoney(uncappedCents), clause: rules.lossRatioBands.clause }
  ];
  if (maximum) {
    steps.push({
      step: `Maximum bonus: ${formatMoney(maximum.cents)}`,
      value: formatMoney(bonusCents),
      clause: maximum.clause
    });
  }
  steps.push({ step: "Expected bonus", value: formatMoney(bonusCents), clause: null });

  return { eligiblePremiumByAgency, eligiblePremiumCents, lossRatioBps, qualifies, rateBps, bonusCents, steps };
}

/** Incurred losses over earned premium, in basis points, rounded to the nearest one. */
export function lossRatio(incurredLossesCents: Cents, earnedPremiumCents: Cents): BasisPoints {
  if (earnedPremiumCents <= 0) throw new Error("Earned premium must be positive to compute a loss ratio");
  return Math.round((incurredLossesCents * 10_000) / earnedPremiumCents);
}

/** The rate of the first band the loss ratio falls in, or zero above the last band. */
export function bonusRate(rules: BonusRules, lossRatioBps: BasisPoints): BasisPoints {
  const band = rules.lossRatioBands.bands.find(entry => lossRatioBps <= entry.upToLossRatioBps);
  return band?.rateBps ?? 0;
}

import type { IsoDate } from "../src/domain/dates";
import type { Cents } from "../src/domain/money";
import type { Policy, RateRule } from "../src/domain/types";

/*
 * The generator computes commissions on its own, without the domain's applyRate or rule lookup.
 * If it reused them, a bug there would be baked into both the data and the answer key, and the
 * tests would still pass.
 */

export function commissionAt(premium: Cents, rateBps: number): Cents {
  const magnitude = Math.round((Math.abs(premium) * rateBps) / 10_000);
  return premium < 0 ? -magnitude : magnitude;
}

export function rateOn(rates: readonly RateRule[], policy: Policy, date: IsoDate): number {
  const rule = rates.find(
    rate =>
      rate.carrierId === policy.carrierId &&
      rate.product === policy.product &&
      rate.term === policy.term &&
      rate.effectiveFrom <= date &&
      (rate.effectiveTo === null || date <= rate.effectiveTo)
  );
  if (!rule)
    throw new Error(`Demo rates have no rule for ${policy.carrierId} ${policy.product} ${policy.term} on ${date}`);
  return rule.rateBps;
}

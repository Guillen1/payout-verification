import type { Period } from "./dates";
import { periodOf } from "./dates";
import { findEffectiveRule } from "./effective-dated";
import { applyRate, type BasisPoints, type Cents } from "./money";
import type { Policy, RateRule } from "./types";

export interface MissingCommission {
  policy: Policy;
  /** What the carrier should have paid, or null when no rate rule applies. */
  expectedCents: Cents | null;
  /** The agreed rate that amount comes from, or null when no rate rule applies. */
  rateBps: BasisPoints | null;
}

/**
 * Policies that took effect in the period but appear on no line of the carrier's statement.
 *
 * Nothing on a statement points at a payment that never came, so a line-by-line check cannot
 * see it. The only way to find it is to start from the book and look for what is absent.
 */
export function findMissingCommissions(input: {
  carrierId: string;
  period: Period;
  policies: readonly Policy[];
  paidPolicyNumbers: ReadonlySet<string>;
  rateRules: readonly RateRule[];
}): MissingCommission[] {
  return input.policies
    .filter(policy => policy.carrierId === input.carrierId)
    .filter(policy => periodOf(policy.effectiveDate) === input.period)
    .filter(policy => !input.paidPolicyNumbers.has(policy.policyNumber))
    .map(policy => {
      const rateBps = rateFor(policy, input.rateRules);
      return { policy, expectedCents: rateBps === null ? null : applyRate(policy.premiumCents, rateBps), rateBps };
    });
}

function rateFor(policy: Policy, rateRules: readonly RateRule[]): BasisPoints | null {
  const lookup = findEffectiveRule(
    rateRules,
    policy.effectiveDate,
    rule => rule.carrierId === policy.carrierId && rule.product === policy.product && rule.term === policy.term
  );
  return lookup.status === "found" ? lookup.rule.rateBps : null;
}

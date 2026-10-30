import type { Period } from "../../reconciliation/domain/dates";
import type { Policy, RateRule } from "../../reconciliation/domain/types";
import { commissionAt, rateOn } from "./commission";
import type { PlannedLine } from "./planned-line";
import { previousPeriod, times, type PolicyMaker } from "./policies";

/**
 * What each carrier's statement looks like this period, including the problems planted in it.
 * Every planted problem carries the finding a correct reconciliation must reach.
 */
export interface CarrierScenario {
  /** Policies this carrier contributes to the book (the system of record). */
  book: Policy[];
  /** Lines the carrier prints, in statement order. */
  lines: PlannedLine[];
  /** Policies that took effect this period and that the carrier never paid. */
  missingPolicyNumbers: string[];
}

export interface ScenarioInput {
  makePolicy: PolicyMaker;
  rates: readonly RateRule[];
  period: Period;
}

export const REGULAR_POLICIES = 26;
export const PRIOR_PERIOD_POLICIES = 10;

/**
 * Northwind raised its auto new-business rate on the first of the month but paid two policies at
 * the old rate. It also skipped one policy, printed one line twice, and charged back a
 * cancellation from last month.
 */
export function northwindScenario({ makePolicy, rates, period }: ScenarioInput): CarrierScenario {
  const policy = (overrides = {}) => makePolicy("northwind", "NW-1", period, overrides);

  const underpaid = times(2, () => policy({ product: "auto", term: "new" }));
  const skipped = policy();
  const printedTwice = policy();
  const regular = times(REGULAR_POLICIES, () => policy());
  const lastMonth = times(PRIOR_PERIOD_POLICIES, () => makePolicy("northwind", "NW-1", previousPeriod(period)));
  const cancelled = lastMonth[0]!;

  const dayBeforePeriod = lastDayOf(previousPeriod(period));
  const lines: PlannedLine[] = [
    ...regular.map(p => paidCorrectly(p, rates)),
    ...underpaid.map(p => paidAtRate(p, rateOn(rates, p, dayBeforePeriod), "rate_variance")),
    paidCorrectly(printedTwice, rates),
    { ...paidCorrectly(printedTwice, rates), expected: { finding: "duplicate", policyNumber: null } },
    chargeback(cancelled, rates)
  ];

  return {
    book: [...underpaid, skipped, printedTwice, ...regular, ...lastMonth],
    lines: inStatementOrder(lines),
    missingPolicyNumbers: [skipped.policyNumber]
  };
}

/**
 * Bluestem left the policy number blank on two new-business lines, reported a higher premium than
 * the book has on one policy, paid commission on a policy the network has no record of, and
 * charged back a cancellation from last month.
 */
export function bluestemScenario({ makePolicy, rates, period }: ScenarioInput): CarrierScenario {
  const policy = (overrides = {}) => makePolicy("bluestem", "BS-2", period, overrides);

  const blankNumber = times(2, () => policy({ term: "new" }));
  const premiumDisagrees = policy();
  const notInBook = policy();
  const regular = times(REGULAR_POLICIES + 1, () => policy());
  const lastMonth = times(PRIOR_PERIOD_POLICIES, () => makePolicy("bluestem", "BS-2", previousPeriod(period)));
  const cancelled = lastMonth[0]!;

  const reportedPremium = premiumDisagrees.premiumCents + 12_000;
  const lines: PlannedLine[] = [
    ...regular.map(p => paidCorrectly(p, rates)),
    ...blankNumber.map(p => ({ ...paidCorrectly(p, rates), showPolicyNumber: false })),
    {
      ...paidCorrectly(premiumDisagrees, rates),
      premiumCents: reportedPremium,
      commissionCents: commissionAt(reportedPremium, rateOn(rates, premiumDisagrees, premiumDisagrees.effectiveDate)),
      expected: { finding: "premium_variance", policyNumber: premiumDisagrees.policyNumber }
    },
    { ...paidCorrectly(notInBook, rates), expected: { finding: "unmatched", policyNumber: null } },
    chargeback(cancelled, rates)
  ];

  return {
    book: [...blankNumber, premiumDisagrees, ...regular, ...lastMonth],
    lines: inStatementOrder(lines),
    missingPolicyNumbers: []
  };
}

/**
 * Harbor & Pine sends a printed PDF. It overpaid one policy, skipped one, and charged back a
 * cancellation from last month, printed as a credit.
 */
export function harborPineScenario({ makePolicy, rates, period }: ScenarioInput): CarrierScenario {
  const policy = (overrides = {}) => makePolicy("harbor-pine", "HP-3", period, overrides);

  const overpaid = policy({ product: "home", term: "renewal" });
  const skipped = policy();
  const regular = times(REGULAR_POLICIES - 2, () => policy());
  const lastMonth = times(PRIOR_PERIOD_POLICIES, () => makePolicy("harbor-pine", "HP-3", previousPeriod(period)));
  const cancelled = lastMonth[0]!;

  const lines: PlannedLine[] = [
    ...regular.map(p => paidCorrectly(p, rates)),
    paidAtRate(overpaid, rateOn(rates, overpaid, overpaid.effectiveDate) + 200, "rate_variance"),
    chargeback(cancelled, rates)
  ];

  return {
    book: [overpaid, skipped, ...regular, ...lastMonth],
    lines: inStatementOrder(lines),
    missingPolicyNumbers: [skipped.policyNumber]
  };
}

export function paidCorrectly(policy: Policy, rates: readonly RateRule[]): PlannedLine {
  return paidAtRate(policy, rateOn(rates, policy, policy.effectiveDate), "ok");
}

export function paidAtRate(policy: Policy, rateBps: number, finding: PlannedLine["expected"]["finding"]): PlannedLine {
  return {
    policy,
    showPolicyNumber: true,
    transactionType: policy.term,
    premiumCents: policy.premiumCents,
    commissionCents: commissionAt(policy.premiumCents, rateBps),
    appliedRateBps: rateBps,
    expected: { finding, policyNumber: policy.policyNumber }
  };
}

/** The carrier takes back commission on the unearned half of a cancelled policy's premium. */
export function chargeback(policy: Policy, rates: readonly RateRule[]): PlannedLine {
  const rateBps = rateOn(rates, policy, policy.effectiveDate);
  const returnedPremium = -Math.round(policy.premiumCents / 2);
  return {
    policy,
    showPolicyNumber: true,
    transactionType: "cancellation",
    premiumCents: returnedPremium,
    commissionCents: commissionAt(returnedPremium, rateBps),
    appliedRateBps: rateBps,
    expected: { finding: "chargeback", policyNumber: policy.policyNumber }
  };
}

/** Carriers sort by effective date, then policy number. A duplicate stays right after its original. */
export function inStatementOrder(lines: PlannedLine[]): PlannedLine[] {
  return lines
    .map((line, index) => ({ line, index }))
    .sort(
      (a, b) =>
        a.line.policy.effectiveDate.localeCompare(b.line.policy.effectiveDate) ||
        a.line.policy.policyNumber.localeCompare(b.line.policy.policyNumber) ||
        a.index - b.index
    )
    .map(({ line }) => line);
}

export function lastDayOf(period: Period): string {
  const [year, month] = period.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

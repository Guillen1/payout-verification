import { commissionAt, rateOn } from "./commission";
import type { PlannedLine } from "./planned-line";
import { previousPeriod, times } from "./policies";
import {
  chargeback,
  inStatementOrder,
  lastDayOf,
  paidAtRate,
  paidCorrectly,
  PRIOR_PERIOD_POLICIES,
  REGULAR_POLICIES,
  type CarrierScenario,
  type ScenarioInput
} from "./scenarios";

/*
 * The brand group's retailers. A retailer pays each invoice net of the allowance in the trade
 * terms, so the "rate" is the share of the invoice it agreed to pay: 9,800 basis points is 98%,
 * a 2% allowance. A return is a credit for half of a last-month invoice. The same planted
 * problems as the agency network, in a retailer's clothes.
 */

/**
 * Brightline cut its hair reorder allowance from 3% to 2% on the first of the month but still took
 * 3% on two invoices. It also skipped one invoice, paid one twice, and took a return credit.
 */
export function brightlineScenario({ makePolicy, rates, period }: ScenarioInput): CarrierScenario {
  const invoice = (overrides = {}) => makePolicy("brightline", "LB-1", period, overrides);

  const shortPaid = times(2, () => invoice({ product: "hair", term: "renewal" }));
  const skipped = invoice();
  const paidTwice = invoice();
  const regular = times(REGULAR_POLICIES, () => invoice());
  const lastMonth = times(PRIOR_PERIOD_POLICIES, () => makePolicy("brightline", "LB-1", previousPeriod(period)));
  const returned = lastMonth[0]!;

  const dayBeforePeriod = lastDayOf(previousPeriod(period));
  const lines: PlannedLine[] = [
    ...regular.map(p => paidCorrectly(p, rates)),
    ...shortPaid.map(p => paidAtRate(p, rateOn(rates, p, dayBeforePeriod), "rate_variance")),
    paidCorrectly(paidTwice, rates),
    { ...paidCorrectly(paidTwice, rates), expected: { finding: "duplicate", policyNumber: null } },
    chargeback(returned, rates)
  ];

  return {
    book: [...shortPaid, skipped, paidTwice, ...regular, ...lastMonth],
    lines: inStatementOrder(lines),
    missingPolicyNumbers: [skipped.policyNumber]
  };
}

/**
 * Maple & Main left the invoice number blank on two new-item lines, paid one invoice on a lower
 * amount than was billed, paid an invoice the group has no record of, and took a return credit.
 */
export function mapleMainScenario({ makePolicy, rates, period }: ScenarioInput): CarrierScenario {
  const invoice = (overrides = {}) => makePolicy("maple-main", "LB-2", period, overrides);

  const blankNumber = times(2, () => invoice({ term: "new" }));
  const amountDisagrees = invoice();
  const notInLedger = invoice();
  const regular = times(REGULAR_POLICIES + 1, () => invoice());
  const lastMonth = times(PRIOR_PERIOD_POLICIES, () => makePolicy("maple-main", "LB-2", previousPeriod(period)));
  const returned = lastMonth[0]!;

  const reportedAmount = amountDisagrees.premiumCents - 45_000;
  const lines: PlannedLine[] = [
    ...regular.map(p => paidCorrectly(p, rates)),
    ...blankNumber.map(p => ({ ...paidCorrectly(p, rates), showPolicyNumber: false })),
    {
      ...paidCorrectly(amountDisagrees, rates),
      premiumCents: reportedAmount,
      commissionCents: commissionAt(reportedAmount, rateOn(rates, amountDisagrees, amountDisagrees.effectiveDate)),
      expected: { finding: "premium_variance", policyNumber: amountDisagrees.policyNumber }
    },
    { ...paidCorrectly(notInLedger, rates), expected: { finding: "unmatched", policyNumber: null } },
    chargeback(returned, rates)
  ];

  return {
    book: [...blankNumber, amountDisagrees, ...regular, ...lastMonth],
    lines: inStatementOrder(lines),
    missingPolicyNumbers: []
  };
}

/**
 * Coastal sends a printed remittance advice. It paid one reorder net of a smaller allowance than
 * agreed, skipped one invoice, and took a return credit, printed as a credit.
 */
export function coastalScenario({ makePolicy, rates, period }: ScenarioInput): CarrierScenario {
  const invoice = (overrides = {}) => makePolicy("coastal", "LB-3", period, overrides);

  const overpaid = invoice({ product: "skin", term: "renewal" });
  const skipped = invoice();
  const regular = times(REGULAR_POLICIES - 2, () => invoice());
  const lastMonth = times(PRIOR_PERIOD_POLICIES, () => makePolicy("coastal", "LB-3", previousPeriod(period)));
  const returned = lastMonth[0]!;

  const lines: PlannedLine[] = [
    ...regular.map(p => paidCorrectly(p, rates)),
    paidAtRate(overpaid, rateOn(rates, overpaid, overpaid.effectiveDate) + 100, "rate_variance"),
    chargeback(returned, rates)
  ];

  return {
    book: [overpaid, skipped, ...regular, ...lastMonth],
    lines: inStatementOrder(lines),
    missingPolicyNumbers: [skipped.policyNumber]
  };
}

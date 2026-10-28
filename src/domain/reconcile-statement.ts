import { allocate, type Allocation } from "./allocation";
import { classifyLine, type ClassificationRules } from "./classify-line";
import type { LineResult } from "./line-result";
import { findMissingCommissions, type MissingCommission } from "./missing-commissions";
import { sumCents, type Cents } from "./money";
import { normalizeInsuredName, normalizePolicyNumber } from "./normalize";
import type { PolicyIndex } from "./policy-index";
import { tieOut, type TieOut } from "./tie-out";
import type { Statement, StatementLine } from "./types";

export interface StatementTotals {
  paidCents: Cents;
  toAgenciesCents: Cents;
  toNetworkCents: Cents;
  /** Paid but not allocated: lines held for review. */
  heldCents: Cents;
  /** Sum of variances on disputed lines. Negative means the carrier owes the network. */
  disputedVarianceCents: Cents;
  /** What policies with no line at all should have paid. */
  missingExpectedCents: Cents;
}

export type StatementReconciliation =
  | { status: "held"; reason: "does_not_tie_out"; tieOut: TieOut }
  | {
      status: "reconciled";
      tieOut: TieOut;
      lines: LineResult[];
      missing: MissingCommission[];
      allocations: Allocation[];
      totals: StatementTotals;
    };

/**
 * Reconciles one carrier statement for one period: tie out, classify every line, look for
 * payments that never came, and split what was paid between agencies and the network.
 */
export function reconcileStatement(
  statement: Statement,
  policies: PolicyIndex,
  rules: ClassificationRules
): StatementReconciliation {
  const totalCheck = tieOut(statement);
  if (!totalCheck.tiesOut) {
    return { status: "held", reason: "does_not_tie_out", tieOut: totalCheck };
  }

  const seen = new Set<string>();
  const lines = statement.lines.map(line => {
    const key = duplicateKey(line);
    const isDuplicate = seen.has(key);
    seen.add(key);
    const match = policies.match(statement.carrierId, line);
    return classifyLine({ carrierId: statement.carrierId, line, match, isDuplicate }, rules);
  });

  const paidPolicyNumbers = new Set(lines.flatMap(result => (result.policy ? [result.policy.policyNumber] : [])));
  const missing = findMissingCommissions({
    carrierId: statement.carrierId,
    period: statement.period,
    policies: policies.policiesFor(statement.carrierId),
    paidPolicyNumbers,
    rateRules: rules.rateRules
  });

  const allocations = allocate(statement.carrierId, lines);
  const totals = summarize(lines, allocations, missing);

  return { status: "reconciled", tieOut: totalCheck, lines, missing, allocations, totals };
}

function duplicateKey(line: StatementLine): string {
  const identity = line.policyNumber
    ? normalizePolicyNumber(line.policyNumber)
    : `${normalizeInsuredName(line.insuredName)}|${line.effectiveDate}`;
  return [identity, line.transactionType, line.premiumCents, line.commissionCents].join("|");
}

function summarize(lines: LineResult[], allocations: Allocation[], missing: MissingCommission[]): StatementTotals {
  const paidCents = sumCents(lines.map(result => result.line.commissionCents));
  const toAgenciesCents = sumCents(allocations.map(allocation => allocation.agencyCents));
  const toNetworkCents = sumCents(allocations.map(allocation => allocation.networkCents));
  const heldCents = sumCents(
    lines.filter(result => result.disposition === "review").map(result => result.line.commissionCents)
  );

  // Every cent paid is either allocated or held. If not, the code is wrong, not the data.
  if (paidCents !== toAgenciesCents + toNetworkCents + heldCents) {
    throw new Error(
      `Allocation does not conserve money: paid ${paidCents}, accounted ${toAgenciesCents + toNetworkCents + heldCents}`
    );
  }

  return {
    paidCents,
    toAgenciesCents,
    toNetworkCents,
    heldCents,
    disputedVarianceCents: sumCents(
      lines.filter(result => result.disposition === "dispute").map(result => result.varianceCents ?? 0)
    ),
    missingExpectedCents: sumCents(missing.map(item => item.expectedCents ?? 0))
  };
}

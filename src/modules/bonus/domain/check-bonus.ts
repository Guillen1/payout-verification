import type { Disposition } from "../../reconciliation/domain/line-result";
import type { BasisPoints, Cents } from "../../reconciliation/domain/money";
import type { BonusRules } from "./bonus-rules";
import type { BonusStatement } from "./bonus-statement";
import { bonusRate, computeExpectedBonus, lossRatio, type ExpectedBonus, type ProductionRow } from "./compute-bonus";

/** A difference between the carrier's statement and the agreement or the network's records. */
export type BonusFinding =
  | {
      kind: "premium_difference";
      agencyId: string;
      statementCents: Cents;
      networkCents: Cents;
      clause: string;
    }
  | { kind: "loss_ratio_differs"; statedBps: BasisPoints; computedBps: BasisPoints; clause: string }
  | { kind: "rate_differs"; statedBps: BasisPoints; agreementBps: BasisPoints; clause: string };

export interface BonusCheck {
  expected: ExpectedBonus;
  paidCents: Cents;
  /** Paid minus expected. Negative means the carrier underpaid. */
  varianceCents: Cents;
  /** dispute when underpaid, review when overpaid, clear within tolerance. */
  disposition: Disposition;
  findings: BonusFinding[];
}

/**
 * Checks a carrier's bonus statement against the approved rules and the network's own records.
 *
 * Each finding names the clause it rests on, so a dispute can quote the contract.
 */
export function checkBonus(input: {
  rules: BonusRules;
  production: readonly ProductionRow[];
  statement: BonusStatement;
  toleranceCents: Cents;
}): BonusCheck {
  const { rules, statement, toleranceCents } = input;
  const expected = computeExpectedBonus(rules, input.production, statement);
  const findings: BonusFinding[] = [];

  const statementByAgency: Record<string, Cents> = {};
  for (const line of statement.lines) {
    statementByAgency[line.agencyId] = (statementByAgency[line.agencyId] ?? 0) + line.writtenPremiumCents;
  }
  const agencyIds = [...new Set([...Object.keys(statementByAgency), ...Object.keys(expected.eligiblePremiumByAgency)])];
  for (const agencyId of agencyIds.sort()) {
    const statementCents = statementByAgency[agencyId] ?? 0;
    const networkCents = expected.eligiblePremiumByAgency[agencyId] ?? 0;
    if (Math.abs(statementCents - networkCents) > toleranceCents) {
      findings.push({
        kind: "premium_difference",
        agencyId,
        statementCents,
        networkCents,
        clause: rules.eligibleProducts.clause
      });
    }
  }

  const computedBps = lossRatio(statement.incurredLossesCents, statement.earnedPremiumCents);
  if (statement.statedLossRatioBps !== computedBps) {
    findings.push({
      kind: "loss_ratio_differs",
      statedBps: statement.statedLossRatioBps,
      computedBps,
      clause: rules.lossRatioBands.clause
    });
  }

  const agreementBps = bonusRate(rules, computedBps);
  if (statement.statedRateBps !== agreementBps) {
    findings.push({
      kind: "rate_differs",
      statedBps: statement.statedRateBps,
      agreementBps,
      clause: rules.lossRatioBands.clause
    });
  }

  const varianceCents = statement.paidCents - expected.bonusCents;
  const disposition: Disposition =
    varianceCents < -toleranceCents ? "dispute" : varianceCents > toleranceCents ? "review" : "clear";

  return { expected, paidCents: statement.paidCents, varianceCents, disposition, findings };
}

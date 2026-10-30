import type { BasisPoints, Cents } from "../../../reconciliation/domain/money";
import type { Disposition } from "../../../reconciliation/domain/line-result";
import type { BonusRules } from "../../domain/bonus-rules";
import type { CalculationStep } from "../../domain/compute-bonus";
import { describeFinding, type Names } from "../reports/bonus-report";
import type { BonusResult } from "../services/bonus-verification.service";

/** What the admin shows for a bonus program year, with names resolved and every amount computed. */
export interface BonusView {
  programId: string;
  programYear: number;
  carrierName: string;
  ranAt: string;
  status: BonusResult["outcome"]["status"];
  /** Why the bonus was not checked, with any detail. */
  hold: { reason: string; details: string[] } | null;
  /** The rules a model drafted, while they wait for approval. */
  draft: { rules: BonusRules; notes: string[] } | null;
  check: {
    disposition: Disposition;
    paidCents: Cents;
    expectedCents: Cents;
    varianceCents: Cents;
    lossRatioBps: BasisPoints;
    rateBps: BasisPoints;
    steps: CalculationStep[];
    findings: { kind: string; clause: string; description: string }[];
  } | null;
  allocation: {
    networkShareBps: BasisPoints;
    networkCents: Cents;
    agencies: { agencyId: string; name: string; eligiblePremiumCents: Cents; agencyCents: Cents }[];
  } | null;
}

export function toBonusView(result: BonusResult, names: Names, ranAt: string): BonusView {
  const { program, outcome } = result;
  const base = {
    programId: program.id,
    programYear: program.programYear,
    carrierName: names.carrier,
    ranAt,
    status: outcome.status,
    hold: null,
    draft: null,
    check: null,
    allocation: null
  };

  switch (outcome.status) {
    case "awaiting_approval": {
      const { draft } = outcome;
      return {
        ...base,
        hold: {
          reason: outcome.reason,
          details:
            draft.status === "drafted"
              ? ["A model drafted the rules from the agreement. They are waiting for approval."]
              : [draft.reason]
        },
        draft: draft.status === "drafted" ? { rules: draft.rules, notes: draft.notes } : null
      };
    }
    case "statement_invalid":
      return {
        ...base,
        hold: { reason: "The carrier's bonus statement could not be read.", details: outcome.problems }
      };
    case "checked": {
      const { check, allocation } = outcome;
      return {
        ...base,
        check: {
          disposition: check.disposition,
          paidCents: check.paidCents,
          expectedCents: check.expected.bonusCents,
          varianceCents: check.varianceCents,
          lossRatioBps: check.expected.lossRatioBps,
          rateBps: check.expected.rateBps,
          steps: check.expected.steps,
          findings: check.findings.map(finding => ({
            kind: finding.kind,
            clause: finding.clause,
            description: describeFinding(finding, names)
          }))
        },
        allocation: {
          networkShareBps: program.networkShareBps,
          networkCents: allocation.networkCents,
          agencies: allocation.agencies.map(share => ({ ...share, name: names.agency(share.agencyId) }))
        }
      };
    }
  }
}

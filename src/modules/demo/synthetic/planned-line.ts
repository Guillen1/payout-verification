import type { LineFinding } from "../../reconciliation/domain/line-result";
import type { Cents } from "../../reconciliation/domain/money";
import type { Policy, TransactionType } from "../../reconciliation/domain/types";
import type { StatementTranscript } from "../../extraction/application/services/pdf-statement-reader.service";

/**
 * One line the carrier will print, plus what the reconciliation is expected to conclude about
 * it. Renderers turn planned lines into each carrier's own file layout.
 */
export interface PlannedLine {
  policy: Policy;
  /** False when the carrier leaves the policy number blank. */
  showPolicyNumber: boolean;
  transactionType: TransactionType;
  premiumCents: Cents;
  commissionCents: Cents;
  /** The rate the carrier says it applied, which some layouts print. */
  appliedRateBps: number;
  expected: {
    finding: LineFinding;
    /** The policy the line should match, or null when it should not match any. */
    policyNumber: string | null;
  };
}

export interface CarrierLabels {
  file: string;
  lines: { row: number; finding: LineFinding; policyNumber: string | null }[];
  missingPolicyNumbers: string[];
  /** For PDF statements: exactly what a perfect reader would transcribe. */
  transcript?: StatementTranscript;
}

/** The answer key for one period: what a correct reconciliation finds. */
export interface PeriodLabels {
  period: string;
  carriers: Record<string, CarrierLabels>;
}

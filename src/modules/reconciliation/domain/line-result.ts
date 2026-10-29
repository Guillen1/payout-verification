import type { MatchMethod } from "./policy-index";
import type { Cents } from "./money";
import type { Policy, SplitRule, StatementLine } from "./types";

/** What the reconciliation concluded about one statement line. */
export type LineFinding =
  | "ok"
  | "chargeback"
  | "rate_variance"
  | "premium_variance"
  | "duplicate"
  | "unmatched"
  | "ambiguous_match"
  | "no_rate_rule"
  | "no_split_rule";

/**
 * What happens next with the line.
 *
 * - clear:   the carrier paid what it owed. The money is allocated to the agency.
 * - dispute: the money is real but the amount is wrong. It is allocated, and the variance is
 *            raised with the carrier.
 * - review:  the system cannot tell what the line is or who it belongs to. The money is held
 *            until a person decides.
 */
export type Disposition = "clear" | "dispute" | "review";

export interface LineResult {
  line: StatementLine;
  finding: LineFinding;
  disposition: Disposition;
  /** One sentence a finance person can act on. */
  explanation: string;
  policy: Policy | null;
  matchMethod: MatchMethod | null;
  expectedCents: Cents | null;
  /** Paid minus expected. Negative means the carrier underpaid. */
  varianceCents: Cents | null;
  agencySplit: SplitRule | null;
}

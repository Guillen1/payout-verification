import type { IsoDate, Period } from "./dates";
import type { EffectiveDated } from "./effective-dated";
import type { BasisPoints, Cents } from "./money";

/** A line of business, as named by the tenant (for example "auto"). Carriers' own codes are mapped to these. */
export type Product = string;

export type PolicyTerm = "new" | "renewal";

export type TransactionType = "new" | "renewal" | "cancellation";

/** A policy in the system of record (the agency management system export). */
export interface Policy {
  policyNumber: string;
  carrierId: string;
  agencyId: string;
  product: Product;
  term: PolicyTerm;
  insuredName: string;
  effectiveDate: IsoDate;
  premiumCents: Cents;
}

/** What a carrier owes in commission for a product and term. */
export interface RateRule extends EffectiveDated {
  carrierId: string;
  product: Product;
  term: PolicyTerm;
  rateBps: BasisPoints;
}

/** The share of received commission an agency keeps. */
export interface SplitRule extends EffectiveDated {
  agencyId: string;
  /** A specific product, or "*" for the agency's default across all products. */
  product: Product;
  agencyShareBps: BasisPoints;
}

/** Where a value came from in the original file, so every number in a report can be traced back. */
export interface SourceRef {
  file: string;
  /**
   * For a CSV, the row in the file, counting the header as row 1. For a PDF, the line's position
   * on the statement, counting from 1.
   */
  row: number;
  /** The PDF page the line is printed on. */
  page?: number;
}

/** One line of a carrier commission statement, in the tenant's vocabulary. */
export interface StatementLine {
  /** Null when the carrier left it blank, which happens for new business before a number is issued. */
  policyNumber: string | null;
  insuredName: string;
  product: Product;
  transactionType: TransactionType;
  effectiveDate: IsoDate;
  premiumCents: Cents;
  commissionCents: Cents;
  source: SourceRef;
}

export interface Statement {
  carrierId: string;
  period: Period;
  formatId: string;
  /** The control total the carrier printed on the statement. */
  statedTotalCents: Cents;
  lines: StatementLine[];
}

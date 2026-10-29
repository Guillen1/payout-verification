import type { Policy, RateRule, SplitRule, Statement, StatementLine } from "../../domain/types";

/**
 * Small builders for unit tests. Each returns a valid default that a test overrides only where it
 * matters, so every test reads as "the same as normal, except this".
 */

export function aPolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    policyNumber: "NW-1000001",
    carrierId: "northwind",
    agencyId: "ag-101",
    product: "auto",
    term: "new",
    insuredName: "Maria Lopez",
    effectiveDate: "2026-09-03",
    premiumCents: 150_000,
    ...overrides
  };
}

export function aLine(overrides: Partial<StatementLine> = {}): StatementLine {
  return {
    policyNumber: "NW1000001",
    insuredName: "Maria Lopez",
    product: "auto",
    transactionType: "new",
    effectiveDate: "2026-09-03",
    premiumCents: 150_000,
    commissionCents: 18_000,
    source: { file: "northwind.csv", row: 2 },
    ...overrides
  };
}

export function aRateRule(overrides: Partial<RateRule> = {}): RateRule {
  return {
    carrierId: "northwind",
    product: "auto",
    term: "new",
    rateBps: 1200,
    effectiveFrom: "2025-01-01",
    effectiveTo: null,
    ...overrides
  };
}

export function aSplitRule(overrides: Partial<SplitRule> = {}): SplitRule {
  return {
    agencyId: "ag-101",
    product: "*",
    agencyShareBps: 8000,
    effectiveFrom: "2025-01-01",
    effectiveTo: null,
    ...overrides
  };
}

export function aStatement(lines: StatementLine[], overrides: Partial<Statement> = {}): Statement {
  return {
    carrierId: "northwind",
    period: "2026-09",
    formatId: "northwind-csv",
    statedTotalCents: lines.reduce((total, line) => total + line.commissionCents, 0),
    lines,
    ...overrides
  };
}

import { describe, expect, it } from "vitest";
import { classifyLine, type ClassificationRules } from "../../domain/classify-line";
import type { MatchResult } from "../../domain/policy-index";
import { aLine, aPolicy, aRateRule, aSplitRule } from "../support/test-builders";
import type { StatementLine } from "../../domain/types";

const policy = aPolicy({ premiumCents: 150_000 });
const rules: ClassificationRules = {
  rateRules: [aRateRule({ rateBps: 1200 })],
  splitRules: [aSplitRule({ agencyShareBps: 8000 })],
  lineToleranceCents: 1
};
const matched: MatchResult = { status: "matched", policy, method: "policy_number" };

function classify(line: StatementLine, match: MatchResult = matched, isDuplicate = false) {
  return classifyLine({ carrierId: "northwind", line, match, isDuplicate }, rules);
}

describe("classifyLine", () => {
  it("clears a line paid at the rate in effect", () => {
    const result = classify(aLine({ commissionCents: 18_000 }));
    expect(result).toMatchObject({ finding: "ok", disposition: "clear", expectedCents: 18_000, varianceCents: 0 });
  });

  it("accepts a one-cent rounding difference", () => {
    expect(classify(aLine({ commissionCents: 18_001 })).finding).toBe("ok");
  });

  it("disputes a line paid at the wrong rate and says by how much", () => {
    const result = classify(aLine({ commissionCents: 16_500 }));
    expect(result).toMatchObject({ finding: "rate_variance", disposition: "dispute", varianceCents: -1500 });
    expect(result.explanation).toContain("Underpaid by $15.00");
  });

  it("holds a line whose premium disagrees with the book, since either side may be wrong", () => {
    const result = classify(aLine({ premiumCents: 162_000, commissionCents: 19_440 }));
    expect(result).toMatchObject({ finding: "premium_variance", disposition: "review", expectedCents: 18_000 });
  });

  it("clears a cancellation chargeback taken back at the policy's rate", () => {
    const line = aLine({ transactionType: "cancellation", premiumCents: -60_000, commissionCents: -7_200 });
    expect(classify(line)).toMatchObject({ finding: "chargeback", disposition: "clear", varianceCents: 0 });
  });

  it("disputes a chargeback that takes back more than the rate allows", () => {
    const line = aLine({ transactionType: "cancellation", premiumCents: -60_000, commissionCents: -9_000 });
    expect(classify(line)).toMatchObject({ finding: "rate_variance", disposition: "dispute", varianceCents: -1800 });
  });

  it("holds duplicates, unmatched and ambiguous lines for review", () => {
    expect(classify(aLine(), matched, true)).toMatchObject({ finding: "duplicate", disposition: "review" });
    expect(classify(aLine(), { status: "unmatched" })).toMatchObject({ finding: "unmatched", disposition: "review" });
    const ambiguous: MatchResult = { status: "ambiguous", method: "insured_and_date", candidates: [policy, policy] };
    expect(classify(aLine(), ambiguous)).toMatchObject({ finding: "ambiguous_match", disposition: "review" });
  });

  it("holds the line when no rate rule is in effect instead of guessing an amount", () => {
    const result = classifyLine(
      { carrierId: "northwind", line: aLine(), match: matched, isDuplicate: false },
      { ...rules, rateRules: [aRateRule({ effectiveFrom: "2027-01-01" })] }
    );
    expect(result).toMatchObject({ finding: "no_rate_rule", disposition: "review", expectedCents: null });
  });

  it("prefers a product-specific split over the agency default", () => {
    const umbrellaPolicy = aPolicy({ product: "umbrella" });
    const result = classifyLine(
      {
        carrierId: "northwind",
        line: aLine({ product: "umbrella" }),
        match: { status: "matched", policy: umbrellaPolicy, method: "policy_number" },
        isDuplicate: false
      },
      {
        ...rules,
        rateRules: [aRateRule({ product: "umbrella" })],
        splitRules: [aSplitRule({ agencyShareBps: 8000 }), aSplitRule({ product: "umbrella", agencyShareBps: 9000 })]
      }
    );
    expect(result.agencySplit?.agencyShareBps).toBe(9000);
  });
});

import { describe, expect, it } from "vitest";
import type { ClassificationRules } from "./classify-line";
import { PolicyIndex } from "./policy-index";
import { reconcileStatement } from "./reconcile-statement";
import { aLine, aPolicy, aRateRule, aSplitRule, aStatement } from "./test-builders";

const rules: ClassificationRules = {
  rateRules: [aRateRule({ rateBps: 1200 })],
  splitRules: [aSplitRule({ agencyShareBps: 8000 })],
  lineToleranceCents: 1
};

describe("reconcileStatement", () => {
  const paid = aPolicy({ policyNumber: "NW-1000001", insuredName: "Maria Lopez" });
  const unpaid = aPolicy({ policyNumber: "NW-1000002", insuredName: "James Carter", premiumCents: 100_000 });
  const index = new PolicyIndex([paid, unpaid]);

  it("holds the whole statement when the lines do not add up to the printed total", () => {
    const statement = aStatement([aLine()], { statedTotalCents: 99_999 });
    expect(reconcileStatement(statement, index, rules)).toMatchObject({
      status: "held",
      reason: "does_not_tie_out",
      tieOut: { differenceCents: 18_000 - 99_999 }
    });
  });

  it("splits cleared commission between the agency and the network", () => {
    const result = reconcileStatement(aStatement([aLine({ commissionCents: 18_000 })]), index, rules);
    expect(result.status).toBe("reconciled");
    if (result.status !== "reconciled") return;

    expect(result.allocations).toEqual([
      expect.objectContaining({ agencyId: "ag-101", paidCents: 18_000, agencyCents: 14_400, networkCents: 3_600 })
    ]);
  });

  it("finds policies the carrier did not pay at all", () => {
    const result = reconcileStatement(aStatement([aLine()]), index, rules);
    if (result.status !== "reconciled") throw new Error("expected a reconciled statement");

    expect(result.missing.map(item => item.policy.policyNumber)).toEqual(["NW-1000002"]);
    expect(result.totals.missingExpectedCents).toBe(12_000);
  });

  it("flags the second of two identical lines and holds its money", () => {
    const line = aLine();
    const result = reconcileStatement(aStatement([line, { ...line, source: { file: "x.csv", row: 3 } }]), index, rules);
    if (result.status !== "reconciled") throw new Error("expected a reconciled statement");

    expect(result.lines.map(item => item.finding)).toEqual(["ok", "duplicate"]);
    expect(result.totals).toMatchObject({ paidCents: 36_000, heldCents: 18_000 });
  });

  it("accounts for every cent paid as allocated or held", () => {
    const lines = [
      aLine({ commissionCents: 18_000 }),
      aLine({ policyNumber: null, insuredName: "Nobody Known", commissionCents: 5_000 }),
      aLine({ policyNumber: "NW-1000002", insuredName: "James Carter", premiumCents: 100_000, commissionCents: 11_000 })
    ];
    const result = reconcileStatement(aStatement(lines), index, rules);
    if (result.status !== "reconciled") throw new Error("expected a reconciled statement");

    const { paidCents, toAgenciesCents, toNetworkCents, heldCents, disputedVarianceCents } = result.totals;
    expect(paidCents).toBe(34_000);
    expect(toAgenciesCents + toNetworkCents + heldCents).toBe(paidCents);
    expect(heldCents).toBe(5_000);
    expect(disputedVarianceCents).toBe(-1_000);
  });
});

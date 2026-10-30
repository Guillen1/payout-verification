import { describe, expect, it } from "vitest";
import type { BonusStatement } from "../../domain/bonus-statement";
import { checkBonus } from "../../domain/check-bonus";
import { rules } from "../support/bonus-builders";

const production = [
  { agencyId: "ag-1", product: "auto", writtenPremiumCents: 40_000_000 },
  { agencyId: "ag-2", product: "home", writtenPremiumCents: 30_000_000 }
];

function statement(overrides: Partial<BonusStatement> = {}): BonusStatement {
  return {
    lines: [
      {
        row: 2,
        producerCode: "NW-1",
        agencyId: "ag-1",
        writtenPremiumCents: 40_000_000,
        earnedPremiumCents: 36_000_000,
        incurredLossesCents: 18_000_000
      },
      {
        row: 3,
        producerCode: "NW-2",
        agencyId: "ag-2",
        writtenPremiumCents: 30_000_000,
        earnedPremiumCents: 24_000_000,
        incurredLossesCents: 12_000_000
      }
    ],
    writtenPremiumCents: 70_000_000,
    earnedPremiumCents: 60_000_000,
    incurredLossesCents: 30_000_000,
    statedLossRatioBps: 5_000,
    statedRateBps: 300,
    paidCents: 2_100_000,
    ...overrides
  };
}

describe("checkBonus", () => {
  it("clears a statement that matches the agreement and the network's records", () => {
    const check = checkBonus({ rules: rules(), production, statement: statement(), toleranceCents: 100 });
    expect(check).toMatchObject({ disposition: "clear", varianceCents: 0, findings: [] });
  });

  it("disputes a rate from the wrong band, citing the clause", () => {
    const check = checkBonus({
      rules: rules(),
      production,
      statement: statement({ statedRateBps: 150, paidCents: 1_050_000 }),
      toleranceCents: 100
    });
    expect(check.disposition).toBe("dispute");
    expect(check.varianceCents).toBe(-1_050_000);
    expect(check.findings).toEqual([{ kind: "rate_differs", statedBps: 150, agreementBps: 300, clause: "5.1" }]);
  });

  it("finds an agency the statement leaves out", () => {
    const [first] = statement().lines;
    const check = checkBonus({
      rules: rules(),
      production,
      statement: statement({ lines: [first!], writtenPremiumCents: 40_000_000, paidCents: 1_200_000 }),
      toleranceCents: 100
    });
    expect(check.findings).toContainEqual({
      kind: "premium_difference",
      agencyId: "ag-2",
      statementCents: 0,
      networkCents: 30_000_000,
      clause: "3.2"
    });
  });

  it("flags a loss ratio that does not follow from the statement's own figures", () => {
    const check = checkBonus({
      rules: rules(),
      production,
      statement: statement({ statedLossRatioBps: 4_800 }),
      toleranceCents: 100
    });
    expect(check.findings).toEqual([
      { kind: "loss_ratio_differs", statedBps: 4_800, computedBps: 5_000, clause: "5.1" }
    ]);
  });

  it("expects no rate below the minimum premium, citing the minimum", () => {
    const belowMinimum = rules({ minimumPremium: { cents: 80_000_000, clause: "4.1" } });
    const statedZero = statement({ statedRateBps: 0, paidCents: 0 });
    expect(checkBonus({ rules: belowMinimum, production, statement: statedZero, toleranceCents: 100 })).toMatchObject({
      disposition: "clear",
      findings: []
    });

    const statedBand = statement({ statedRateBps: 300, paidCents: 0 });
    expect(
      checkBonus({ rules: belowMinimum, production, statement: statedBand, toleranceCents: 100 }).findings
    ).toEqual([{ kind: "rate_differs", statedBps: 300, agreementBps: 0, clause: "4.1" }]);
  });

  it("sends an overpayment to review rather than accepting it", () => {
    const check = checkBonus({
      rules: rules(),
      production,
      statement: statement({ paidCents: 2_500_000 }),
      toleranceCents: 100
    });
    expect(check.disposition).toBe("review");
  });
});

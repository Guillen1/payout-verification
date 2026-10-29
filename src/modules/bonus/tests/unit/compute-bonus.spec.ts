import { describe, expect, it } from "vitest";
import { bonusRate, computeExpectedBonus, lossRatio } from "../../domain/compute-bonus";
import { rules } from "../support/bonus-builders";

const production = [
  { agencyId: "ag-1", product: "auto", writtenPremiumCents: 40_000_000 },
  { agencyId: "ag-1", product: "umbrella", writtenPremiumCents: 9_000_000 },
  { agencyId: "ag-2", product: "home", writtenPremiumCents: 30_000_000 }
];

describe("bonusRate", () => {
  it("includes the upper boundary of a band", () => {
    expect(bonusRate(rules(), 5_000)).toBe(300);
    expect(bonusRate(rules(), 5_001)).toBe(150);
  });

  it("pays nothing above the last band", () => {
    expect(bonusRate(rules(), 6_001)).toBe(0);
  });
});

describe("lossRatio", () => {
  it("rounds to the nearest basis point", () => {
    expect(lossRatio(1_000_000, 3_000_000)).toBe(3_333);
  });
});

describe("computeExpectedBonus", () => {
  const carrier = { earnedPremiumCents: 60_000_000, incurredLossesCents: 30_000_000 }; // 50.00%

  it("counts only eligible products and applies the band's rate", () => {
    const expected = computeExpectedBonus(rules(), production, carrier);
    expect(expected.eligiblePremiumByAgency).toEqual({ "ag-1": 40_000_000, "ag-2": 30_000_000 });
    expect(expected.rateBps).toBe(300);
    expect(expected.bonusCents).toBe(2_100_000);
  });

  it("pays nothing below the minimum premium", () => {
    const expected = computeExpectedBonus(
      rules({ minimumPremium: { cents: 80_000_000, clause: "4.1" } }),
      production,
      carrier
    );
    expect(expected.qualifies).toBe(false);
    expect(expected.bonusCents).toBe(0);
  });

  it("caps the bonus at the maximum", () => {
    const expected = computeExpectedBonus(
      rules({ maximumBonus: { cents: 1_000_000, clause: "5.3" } }),
      production,
      carrier
    );
    expect(expected.bonusCents).toBe(1_000_000);
  });

  it("cites a clause for every step that has one", () => {
    const expected = computeExpectedBonus(rules(), production, carrier);
    expect(expected.steps.map(step => step.clause)).toEqual(["3.2", "4.1", "5.1", "5.1", "5.1", "5.3", null]);
  });
});

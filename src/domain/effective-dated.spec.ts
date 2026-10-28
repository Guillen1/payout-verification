import { describe, expect, it } from "vitest";
import { findEffectiveRule, type EffectiveDated } from "./effective-dated";

interface Rate extends EffectiveDated {
  product: string;
  rateBps: number;
}

const rates: Rate[] = [
  { product: "auto", rateBps: 1100, effectiveFrom: "2025-01-01", effectiveTo: "2026-08-31" },
  { product: "auto", rateBps: 1200, effectiveFrom: "2026-09-01", effectiveTo: null },
  { product: "home", rateBps: 1500, effectiveFrom: "2025-01-01", effectiveTo: null }
];
const isAuto = (rate: Rate) => rate.product === "auto";

describe("findEffectiveRule", () => {
  it("picks the rule in effect on the date, with inclusive bounds", () => {
    expect(findEffectiveRule(rates, "2026-08-31", isAuto)).toMatchObject({ status: "found", rule: { rateBps: 1100 } });
    expect(findEffectiveRule(rates, "2026-09-01", isAuto)).toMatchObject({ status: "found", rule: { rateBps: 1200 } });
  });

  it("reports when no rule applies", () => {
    expect(findEffectiveRule(rates, "2024-12-31", isAuto)).toEqual({ status: "none" });
    expect(findEffectiveRule(rates, "2026-09-01", rate => rate.product === "boat")).toEqual({ status: "none" });
  });

  it("reports overlapping rules as a conflict rather than guessing", () => {
    const overlapping = [...rates, { product: "auto", rateBps: 1300, effectiveFrom: "2026-09-15", effectiveTo: null }];
    const lookup = findEffectiveRule(overlapping, "2026-09-20", isAuto);
    expect(lookup.status).toBe("conflict");
  });
});

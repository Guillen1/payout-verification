import { describe, expect, it } from "vitest";
import { money, moneyDelta, periodName, rate } from "./format";

describe("format", () => {
  it("shows cents as dollars, and a signed difference with a real minus sign", () => {
    expect(money(2_764_416)).toBe("$27,644.16");
    expect(moneyDelta(-2_549)).toBe("−$25.49");
    expect(moneyDelta(1_200)).toBe("+$12.00");
    expect(moneyDelta(0)).toBe("$0.00");
  });

  it("shows basis points as a percentage", () => {
    expect(rate(5_500)).toBe("55.00%");
  });

  it("names periods for people", () => {
    expect(periodName("2026-09")).toBe("September 2026");
  });
});

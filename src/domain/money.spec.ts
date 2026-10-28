import { describe, expect, it } from "vitest";
import { applyRate, formatMoney, formatRate, parseMoney, sumCents } from "./money";

describe("applyRate", () => {
  it("applies a rate in basis points", () => {
    expect(applyRate(150_000, 1200)).toBe(18_000);
  });

  it("rounds to the nearest cent", () => {
    expect(applyRate(12_345, 1150)).toBe(1420); // 1419.675
    expect(applyRate(12_341, 1150)).toBe(1419); // 1419.215
  });

  it("rounds exact halves away from zero, for charges and chargebacks alike", () => {
    expect(applyRate(5, 5000)).toBe(3); // 2.5
    expect(applyRate(-5, 5000)).toBe(-3); // -2.5
  });

  it("returns zero for a zero amount", () => {
    expect(applyRate(0, 1200)).toBe(0);
  });
});

describe("parseMoney", () => {
  it.each([
    ["1234.56", 123_456],
    ["1,234.56", 123_456],
    ["$1,234.56", 123_456],
    ["  42 ", 4200],
    ["42.5", 4250],
    ["-12.30", -1230],
    ["(12.30)", -1230],
    ["($1,000.00)", -100_000],
    ["0.00", 0],
    ["-0.00", 0]
  ])("parses %j", (text, expected) => {
    expect(parseMoney(text)).toBe(expected);
  });

  it.each(["", "abc", "12.345", "1.2.3", "$"])("rejects %j", text => {
    expect(() => parseMoney(text)).toThrow("Not a money amount");
  });
});

describe("formatting", () => {
  it("formats money and rates for reports", () => {
    expect(formatMoney(123_456)).toBe("$1,234.56");
    expect(formatMoney(-1230)).toBe("-$12.30");
    expect(formatRate(1150)).toBe("11.50%");
  });

  it("sums cents", () => {
    expect(sumCents([100, -30, 5])).toBe(75);
    expect(sumCents([])).toBe(0);
  });
});

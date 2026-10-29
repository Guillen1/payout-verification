import { describe, expect, it } from "vitest";
import { isPeriod, parseDate, periodOf } from "../../domain/dates";

describe("parseDate", () => {
  it("reads ISO and US formats into the same ISO date", () => {
    expect(parseDate("2026-09-03", "YYYY-MM-DD")).toBe("2026-09-03");
    expect(parseDate("09/03/2026", "MM/DD/YYYY")).toBe("2026-09-03");
    expect(parseDate("9/3/2026", "MM/DD/YYYY")).toBe("2026-09-03");
  });

  it("rejects text in the wrong format", () => {
    expect(() => parseDate("09/03/2026", "YYYY-MM-DD")).toThrow("Not a YYYY-MM-DD date");
  });

  it("rejects dates that do not exist", () => {
    expect(() => parseDate("2026-02-30", "YYYY-MM-DD")).toThrow("Not a calendar date");
  });
});

describe("periods", () => {
  it("derives the period of a date", () => {
    expect(periodOf("2026-09-03")).toBe("2026-09");
  });

  it("validates period text", () => {
    expect(isPeriod("2026-09")).toBe(true);
    expect(isPeriod("2026-13")).toBe(false);
    expect(isPeriod("2026-9")).toBe(false);
  });
});

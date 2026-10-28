import { describe, expect, it } from "vitest";
import { normalizeInsuredName, normalizePolicyNumber } from "./normalize";

describe("normalizePolicyNumber", () => {
  it.each(["NW-1004231", "nw 1004231", "NW1004231", " NW.1004231 "])("reduces %j to letters and digits", raw => {
    expect(normalizePolicyNumber(raw)).toBe("NW1004231");
  });
});

describe("normalizeInsuredName", () => {
  it.each(["Maria Lopez", "LOPEZ, MARIA", "maria  lopez", "Lopez,Maria"])("reduces %j to first-last order", raw => {
    expect(normalizeInsuredName(raw)).toBe("maria lopez");
  });

  it("drops punctuation", () => {
    expect(normalizeInsuredName("O'Brien, Sean J.")).toBe("sean j obrien");
  });
});

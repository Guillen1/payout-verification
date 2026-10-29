import { describe, expect, it } from "vitest";
import { PolicyIndex } from "../../domain/policy-index";
import { aLine, aPolicy } from "../support/test-builders";

describe("PolicyIndex.match", () => {
  const maria = aPolicy({ policyNumber: "NW-1000001", insuredName: "Maria Lopez" });
  const james = aPolicy({ policyNumber: "NW-1000002", insuredName: "James Carter" });
  const index = new PolicyIndex([maria, james]);

  it("matches on policy number regardless of formatting", () => {
    expect(index.match("northwind", aLine({ policyNumber: "nw 1000001" }))).toEqual({
      status: "matched",
      policy: maria,
      method: "policy_number"
    });
  });

  it("falls back to insured name and effective date when the number is blank", () => {
    const line = aLine({ policyNumber: null, insuredName: "CARTER, JAMES" });
    expect(index.match("northwind", line)).toEqual({ status: "matched", policy: james, method: "insured_and_date" });
  });

  it("falls back to insured name and effective date when the number is unknown", () => {
    const line = aLine({ policyNumber: "NW-9999999", insuredName: "Maria Lopez" });
    expect(index.match("northwind", line)).toMatchObject({ status: "matched", method: "insured_and_date" });
  });

  it("does not match across carriers", () => {
    expect(index.match("bluestem", aLine({ policyNumber: "NW-1000001" }))).toEqual({ status: "unmatched" });
  });

  it("reports ambiguity instead of picking one of several candidates", () => {
    const twin = aPolicy({ policyNumber: "NW-1000003", insuredName: "Maria Lopez" });
    const withTwin = new PolicyIndex([maria, twin]);
    const result = withTwin.match("northwind", aLine({ policyNumber: null }));
    expect(result).toMatchObject({ status: "ambiguous", method: "insured_and_date" });
  });

  it("reports unmatched when no rule finds the policy", () => {
    const line = aLine({ policyNumber: "NW-9999999", insuredName: "Nobody Known" });
    expect(index.match("northwind", line)).toEqual({ status: "unmatched" });
  });
});

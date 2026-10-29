import { describe, expect, it } from "vitest";
import { allocateBonus } from "../../domain/allocate-bonus";

describe("allocateBonus", () => {
  it("keeps the network's share and splits the rest by eligible premium", () => {
    const allocation = allocateBonus(1_000_000, 2_000, { "ag-1": 300, "ag-2": 100 });
    expect(allocation.agencies).toEqual([
      { agencyId: "ag-1", eligiblePremiumCents: 300, agencyCents: 600_000 },
      { agencyId: "ag-2", eligiblePremiumCents: 100, agencyCents: 200_000 }
    ]);
    expect(allocation.networkCents).toBe(200_000);
  });

  it("gives leftover cents to the largest remainders, so the shares add up to what was paid", () => {
    const allocation = allocateBonus(1_001, 0, { "ag-1": 1, "ag-2": 1, "ag-3": 1 });
    expect(allocation.agencies.map(share => share.agencyCents)).toEqual([334, 334, 333]);
    expect(allocation.networkCents).toBe(0);
  });

  it("handles amounts too large to multiply exactly as plain numbers", () => {
    const allocation = allocateBonus(999_999_999, 1_500, { "ag-1": 7_777_777_777, "ag-2": 3_333_333_333 });
    const total = allocation.networkCents + allocation.agencies.reduce((sum, share) => sum + share.agencyCents, 0);
    expect(total).toBe(999_999_999);
  });

  it("leaves everything with the network when no agency has eligible premium", () => {
    expect(allocateBonus(5_000, 2_000, { "ag-1": 0 })).toEqual({ paidCents: 5_000, networkCents: 5_000, agencies: [] });
  });
});

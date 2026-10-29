import { describe, expect, it } from "vitest";
import { loadTenant } from "./tenant";

describe("loadTenant", () => {
  it("loads and validates the demo tenant", async () => {
    const tenant = await loadTenant("tenants/agency-network");

    expect(tenant.id).toBe("agency-network");
    expect(tenant.carriers.map(carrier => carrier.format.id)).toEqual([
      "northwind-csv",
      "bluestem-csv",
      "harbor-pine-pdf"
    ]);
    expect(tenant.agencies).toHaveLength(8);
    expect(tenant.rateRules).toContainEqual({
      carrierId: "northwind",
      product: "auto",
      term: "new",
      rateBps: 1200,
      effectiveFrom: "2026-09-01",
      effectiveTo: null
    });
    expect(tenant.splitRules).toContainEqual(expect.objectContaining({ agencyId: "ag-102", product: "umbrella" }));
  });
});

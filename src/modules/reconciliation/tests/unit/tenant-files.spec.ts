import { appendFile, cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadTenant } from "../../infrastructure/tenant-files";

/** A copy of the demo tenant, changed by the test, so each test shows one kind of config mistake. */
async function tenantWith(change: (directory: string) => Promise<void>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "tenant-"));
  await cp("tenants/agency-network", directory, { recursive: true });
  await change(directory);
  return directory;
}

describe("loadTenant", () => {
  it("names the file and row of a bad value", async () => {
    const directory = await tenantWith(tenant =>
      appendFile(join(tenant, "rates.csv"), "northwind,auto,new,twelve,2027-01-01,\n")
    );

    await expect(loadTenant(directory)).rejects.toThrow(/rates\.csv row \d+: rate_bps/);
  });

  it("refuses a format configured for a different carrier", async () => {
    const directory = await tenantWith(async tenant => {
      const settings = await readFile(join(tenant, "tenant.yaml"), "utf8");
      await writeFile(
        join(tenant, "tenant.yaml"),
        settings.replace("format: harbor-pine-pdf", "format: northwind-csv")
      );
    });

    await expect(loadTenant(directory)).rejects.toThrow(
      'describes carrier "northwind" but is configured for "harbor-pine"'
    );
  });

  it("reads an empty end date as a rule with no end", async () => {
    const directory = await tenantWith(tenant =>
      writeFile(
        join(tenant, "rates.csv"),
        "carrier_id,product,term,rate_bps,effective_from,effective_to\nnorthwind,auto,new,1200,2026-09-01,\n"
      )
    );

    const { rateRules } = await loadTenant(directory);
    expect(rateRules).toEqual([expect.objectContaining({ rateBps: 1200, effectiveTo: null })]);
  });
});

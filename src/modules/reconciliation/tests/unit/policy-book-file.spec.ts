import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPolicyBook } from "../../infrastructure/policy-book-file";

describe("loadPolicyBook", () => {
  it("names the file and row of an amount it cannot read", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "book-")), "policies.csv");
    await writeFile(
      path,
      [
        "policy_number,carrier_id,agency_id,product,term,insured_name,effective_date,premium",
        "NW-1,northwind,ag-101,auto,new,Maria Lopez,2026-09-03,1500.00",
        "NW-2,northwind,ag-101,auto,new,James Carter,2026-09-04,12x.00"
      ].join("\n")
    );

    await expect(loadPolicyBook(path)).rejects.toThrow(`${path} row 3: premium: Not a money amount: "12x.00"`);
  });
});

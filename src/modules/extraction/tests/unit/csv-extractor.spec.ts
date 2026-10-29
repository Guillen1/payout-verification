import { describe, expect, it } from "vitest";
import { extractCsvStatement } from "../../domain/csv-extractor";
import type { CsvFormat } from "../../domain/source-format";

const format: CsvFormat = {
  id: "test-csv",
  version: 1,
  carrierId: "bluestem",
  kind: "csv",
  headers: ["POLICY_NO", "NAMED_INSURED", "PRODUCT_CD", "TXN_CD", "EFF_DT", "PREMIUM", "COMM_AMT"],
  columns: {
    policyNumber: "POLICY_NO",
    insuredName: "NAMED_INSURED",
    product: "PRODUCT_CD",
    transactionType: "TXN_CD",
    effectiveDate: "EFF_DT",
    premium: "PREMIUM",
    commission: "COMM_AMT"
  },
  dateFormat: "MM/DD/YYYY",
  policyNumberStripPattern: "-\\d{2}$",
  products: { PA: "auto", HO: "home" },
  transactionTypes: { NB: "new", RN: "renewal", XC: "cancellation" },
  totalRow: { labelColumn: "POLICY_NO", label: "TOTAL", amountColumn: "COMM_AMT" }
};

const header = "POLICY_NO,NAMED_INSURED,PRODUCT_CD,TXN_CD,EFF_DT,PREMIUM,COMM_AMT";

function extract(content: string) {
  return extractCsvStatement({ fileName: "bluestem.csv", content, period: "2026-09", format });
}

describe("extractCsvStatement", () => {
  it("reads lines into the tenant's vocabulary and keeps the control total", () => {
    const result = extract(
      [
        header,
        `BS-2000001-02,"LOPEZ, MARIA",PA,RN,09/03/2026,"$1,500.00",$157.50`,
        `,"CARTER, JAMES",HO,NB,09/04/2026,"$2,000.00",$320.00`,
        `BS-2000003-01,"KIM, ANA",HO,XC,08/12/2026,($800.00),($112.00)`,
        `TOTAL,,,,,,$365.50`
      ].join("\n")
    );

    expect(result.status).toBe("extracted");
    if (result.status !== "extracted") return;

    expect(result.statement.statedTotalCents).toBe(36_550);
    expect(result.statement.lines).toEqual([
      expect.objectContaining({
        policyNumber: "BS-2000001",
        insuredName: "LOPEZ, MARIA",
        product: "auto",
        transactionType: "renewal",
        effectiveDate: "2026-09-03",
        premiumCents: 150_000,
        commissionCents: 15_750,
        source: { file: "bluestem.csv", row: 2 }
      }),
      expect.objectContaining({ policyNumber: null, transactionType: "new" }),
      expect.objectContaining({ transactionType: "cancellation", premiumCents: -80_000, commissionCents: -11_200 })
    ]);
  });

  it("reports format drift when a column was renamed", () => {
    const renamed = header.replace("COMM_AMT", "COMMISSION");
    expect(extract(`${renamed}\nTOTAL,,,,,,$0.00`)).toEqual({
      status: "format_drift",
      headerCheck: { matches: false, missing: ["COMM_AMT"], unexpected: ["COMMISSION"] }
    });
  });

  it("reports every bad cell at once, with its row and column", () => {
    const result = extract(
      [
        header,
        `BS-1,"A, B",XX,NB,09/03/2026,$1.00,$0.10`,
        `BS-2,"C, D",PA,NB,13/45/2026,$1.00,abc`,
        `TOTAL,,,,,,$0.10`
      ].join("\n")
    );
    expect(result).toEqual({
      status: "invalid_lines",
      problems: [
        { location: "row 2", field: "product", message: 'Unknown product code "XX"' },
        { location: "row 3", field: "effective date", message: "Not a calendar date: 2026-13-45" },
        { location: "row 3", field: "commission", message: 'Not a money amount: "abc"' }
      ]
    });
  });

  it("reports a file that is not valid CSV as unreadable", () => {
    expect(extract(`${header}\n"BS-1,unclosed quote`)).toMatchObject({
      status: "unreadable",
      reason: expect.stringContaining("Not a valid CSV file") as string
    });
  });

  it("refuses a statement without a control total", () => {
    const result = extract([header, `BS-1,"A, B",PA,NB,09/03/2026,$1.00,$0.10`].join("\n"));
    expect(result).toMatchObject({
      status: "invalid_lines",
      problems: [{ message: 'No control total row labeled "TOTAL"' }]
    });
  });
});

import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

/**
 * Layout changes carriers really make: a renamed column, two renamed columns, columns reordered
 * with one renamed. Each case says how to change the file and what a correct mapping looks like.
 */
export interface DriftCase {
  name: string;
  carrierId: string;
  change: (csv: string) => string;
  /** The columns a correct proposal maps, by field. */
  expectedColumns: Record<string, string>;
}

export const DRIFT_CASES: DriftCase[] = [
  {
    name: "Bluestem renames its commission column",
    carrierId: "bluestem",
    change: csv => renameColumns(csv, { COMM_AMT: "COMMISSION_AMOUNT" }),
    expectedColumns: { commission: "COMMISSION_AMOUNT", premium: "PREMIUM", policyNumber: "POLICY_NO" }
  },
  {
    name: "Northwind renames two columns",
    carrierId: "northwind",
    change: csv => renameColumns(csv, { "Policy Number": "Policy #", "Commission Paid": "Comm Paid" }),
    expectedColumns: { policyNumber: "Policy #", commission: "Comm Paid", premium: "Written Premium" }
  },
  {
    name: "Bluestem reorders its columns and renames the date",
    carrierId: "bluestem",
    change: csv => reorderColumns(renameColumns(csv, { EFF_DT: "EFFECTIVE_DATE" }), [6, 5, 0, 1, 4, 2, 3]),
    expectedColumns: { effectiveDate: "EFFECTIVE_DATE", commission: "COMM_AMT", product: "PRODUCT_CD" }
  }
];

function renameColumns(csv: string, renames: Record<string, string>): string {
  const [header = [], ...rows]: string[][] = parse(csv);
  return stringify([header.map(name => renames[name] ?? name), ...rows]);
}

function reorderColumns(csv: string, order: number[]): string {
  const rows: string[][] = parse(csv, { relax_column_count: true });
  return stringify(rows.map(row => order.map(index => row[index] ?? "")));
}

import { parse } from "csv-parse/sync";
import { parseDate, type Period } from "../domain/dates";
import { parseMoney, type Cents } from "../domain/money";
import type { Statement, StatementLine } from "../domain/types";
import { checkHeaders, type HeaderCheck } from "./header-check";
import type { SourceFormat } from "./source-format";

export interface RowProblem {
  row: number;
  column: string;
  message: string;
}

export type ExtractionResult =
  | { status: "extracted"; statement: Statement }
  | { status: "format_drift"; headerCheck: HeaderCheck }
  | { status: "invalid_rows"; problems: RowProblem[] };

/**
 * Reads a CSV commission statement into the tenant's vocabulary using the carrier's format.
 *
 * Every row is read before deciding, so a statement with problems reports all of them at once
 * instead of failing on the first.
 */
export function extractCsvStatement(input: {
  fileName: string;
  content: string;
  period: Period;
  format: SourceFormat;
}): ExtractionResult {
  const { format } = input;
  const rows: string[][] = parse(input.content, { bom: true, skip_empty_lines: true });
  const [header = [], ...body] = rows;

  const headerCheck = checkHeaders(format.headers, header);
  if (!headerCheck.matches) return { status: "format_drift", headerCheck };

  const columnIndex = new Map(header.map((name, index) => [name.trim(), index]));
  const lines: StatementLine[] = [];
  const problems: RowProblem[] = [];
  let statedTotalCents: Cents | null = null;

  body.forEach((cells, index) => {
    const rowNumber = index + 2; // the header is row 1
    const cell = (column: string) => (cells[columnIndex.get(column) ?? -1] ?? "").trim();
    const read = <T>(column: string, parseValue: (text: string) => T): T | undefined => {
      try {
        return parseValue(cell(column));
      } catch (error) {
        problems.push({ row: rowNumber, column, message: (error as Error).message });
        return undefined;
      }
    };

    if (cell(format.totalRow.labelColumn) === format.totalRow.label) {
      statedTotalCents = read(format.totalRow.amountColumn, parseMoney) ?? null;
      return;
    }

    const { columns } = format;
    const product = read(columns.product, code => lookup(format.products, code, "product code"));
    const transactionType = read(columns.transactionType, code =>
      lookup(format.transactionTypes, code, "transaction code")
    );
    const effectiveDate = read(columns.effectiveDate, text => parseDate(text, format.dateFormat));
    const premiumCents = read(columns.premium, parseMoney);
    const commissionCents = read(columns.commission, parseMoney);

    if (
      product === undefined ||
      transactionType === undefined ||
      effectiveDate === undefined ||
      premiumCents === undefined ||
      commissionCents === undefined
    ) {
      return;
    }

    lines.push({
      policyNumber: cleanPolicyNumber(cell(columns.policyNumber), format.policyNumberStripPattern),
      insuredName: cell(columns.insuredName),
      product,
      transactionType,
      effectiveDate,
      premiumCents,
      commissionCents,
      source: { file: input.fileName, row: rowNumber }
    });
  });

  if (statedTotalCents === null) {
    problems.push({
      row: rows.length,
      column: format.totalRow.labelColumn,
      message: `No control total row labeled "${format.totalRow.label}"`
    });
  }

  if (problems.length > 0 || statedTotalCents === null) return { status: "invalid_rows", problems };

  return {
    status: "extracted",
    statement: { carrierId: format.carrierId, period: input.period, formatId: format.id, statedTotalCents, lines }
  };
}

function lookup<T>(mapping: Record<string, T>, code: string, what: string): T {
  const value = mapping[code];
  if (value === undefined) throw new Error(`Unknown ${what} "${code}"`);
  return value;
}

function cleanPolicyNumber(raw: string, stripPattern: string | undefined): string | null {
  const cleaned = stripPattern ? raw.replace(new RegExp(stripPattern), "") : raw;
  return cleaned === "" ? null : cleaned;
}

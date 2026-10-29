import { parse } from "csv-parse/sync";
import type { Period } from "../../reconciliation/domain/dates";
import { parseMoney, type Cents } from "../../reconciliation/domain/money";
import type { StatementLine } from "../../reconciliation/domain/types";
import type { CsvExtractionResult } from "./extraction-result";
import { checkHeaders } from "./header-check";
import type { CsvFormat } from "./source-format";
import { readPrintedLine, type LineProblem } from "./statement-line-reader";

/**
 * Reads a CSV commission statement using the carrier's format.
 *
 * Every row is read before deciding, so a statement with problems reports all of them at once
 * instead of failing on the first.
 */
export function extractCsvStatement(input: {
  fileName: string;
  content: string;
  period: Period;
  format: CsvFormat;
}): CsvExtractionResult {
  const { format } = input;
  let rows: string[][];
  try {
    rows = parse(input.content, { bom: true, skip_empty_lines: true, relax_column_count: true });
  } catch (error) {
    return { status: "unreadable", reason: `Not a valid CSV file: ${(error as Error).message}` };
  }
  const [header = [], ...body] = rows;

  const headerCheck = checkHeaders(format.headers, header);
  if (!headerCheck.matches) return { status: "format_drift", headerCheck };

  const columnIndex = new Map(header.map((name, index) => [name.trim(), index]));
  const lines: StatementLine[] = [];
  const problems: LineProblem[] = [];
  let statedTotalCents: Cents | null = null;

  body.forEach((cells, index) => {
    const row = index + 2; // the header is row 1
    const cell = (column: string) => (cells[columnIndex.get(column) ?? -1] ?? "").trim();

    if (cell(format.totalRow.labelColumn) === format.totalRow.label) {
      try {
        statedTotalCents = parseMoney(cell(format.totalRow.amountColumn));
      } catch (error) {
        problems.push({ location: `row ${row}`, field: "statement total", message: (error as Error).message });
      }
      return;
    }

    const { columns } = format;
    const result = readPrintedLine(
      {
        policyNumber: cell(columns.policyNumber),
        insuredName: cell(columns.insuredName),
        productCode: cell(columns.product),
        transactionCode: cell(columns.transactionType),
        effectiveDate: cell(columns.effectiveDate),
        premium: cell(columns.premium),
        commission: cell(columns.commission),
        source: { file: input.fileName, row }
      },
      format,
      format.dateFormat
    );
    if ("line" in result) lines.push(result.line);
    else problems.push(...result.problems);
  });

  if (statedTotalCents === null && problems.length === 0) {
    problems.push({
      location: `row ${rows.length}`,
      field: "statement total",
      message: `No control total row labeled "${format.totalRow.label}"`
    });
  }

  if (problems.length > 0 || statedTotalCents === null) return { status: "invalid_lines", problems };

  return {
    status: "extracted",
    statement: { carrierId: format.carrierId, period: input.period, formatId: format.id, statedTotalCents, lines }
  };
}

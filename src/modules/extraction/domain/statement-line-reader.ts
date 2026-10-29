import { parseDate, type DateFormat } from "../../reconciliation/domain/dates";
import { parseMoney } from "../../reconciliation/domain/money";
import type { SourceRef, StatementLine } from "../../reconciliation/domain/types";
import type { SourceFormat } from "./source-format";

/** One line as the carrier printed it, before codes are mapped and values are parsed. */
export interface PrintedLine {
  policyNumber: string;
  insuredName: string;
  productCode: string;
  transactionCode: string;
  effectiveDate: string;
  premium: string;
  commission: string;
  source: SourceRef;
}

export interface LineProblem {
  /** Where the bad value is, for example "row 12" or "page 2, line 5". */
  location: string;
  field: string;
  message: string;
}

/**
 * Turns a printed line into a statement line using the carrier's format: maps codes, parses dates
 * and amounts, and strips policy number suffixes. Shared by every file type, so a CSV and a PDF
 * from the same carrier are held to exactly the same rules.
 */
export function readPrintedLine(
  printed: PrintedLine,
  format: SourceFormat,
  dateFormat: DateFormat
): { line: StatementLine } | { problems: LineProblem[] } {
  const problems: LineProblem[] = [];
  const read = <T>(field: string, parse: () => T): T | undefined => {
    try {
      return parse();
    } catch (error) {
      problems.push({ location: describeLocation(printed.source), field, message: (error as Error).message });
      return undefined;
    }
  };

  const product = read("product", () => lookup(format.products, printed.productCode, "product code"));
  const transactionType = read("transaction", () =>
    lookup(format.transactionTypes, printed.transactionCode, "transaction code")
  );
  const effectiveDate = read("effective date", () => parseDate(printed.effectiveDate, dateFormat));
  const premiumCents = read("premium", () => parseMoney(printed.premium));
  const commissionCents = read("commission", () => parseMoney(printed.commission));

  if (
    product === undefined ||
    transactionType === undefined ||
    effectiveDate === undefined ||
    premiumCents === undefined ||
    commissionCents === undefined
  ) {
    return { problems };
  }

  return {
    line: {
      policyNumber: cleanPolicyNumber(printed.policyNumber, format.policyNumberStripPattern),
      insuredName: printed.insuredName.trim(),
      product,
      transactionType,
      effectiveDate,
      premiumCents,
      commissionCents,
      source: printed.source
    }
  };
}

export function describeLocation(source: SourceRef): string {
  return source.page === undefined ? `row ${source.row}` : `page ${source.page}, line ${source.row}`;
}

function lookup<T>(mapping: Record<string, T>, code: string, what: string): T {
  const value = mapping[code.trim()];
  if (value === undefined) throw new Error(`Unknown ${what} "${code}"`);
  return value;
}

function cleanPolicyNumber(raw: string, stripPattern: string | undefined): string | null {
  const trimmed = raw.trim();
  const cleaned = stripPattern ? trimmed.replace(new RegExp(stripPattern), "") : trimmed;
  return cleaned === "" ? null : cleaned;
}

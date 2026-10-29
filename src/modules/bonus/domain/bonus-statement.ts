import { parse } from "csv-parse/sync";
import { parseMoney, parsePercent, sumCents, type BasisPoints, type Cents } from "../../reconciliation/domain/money";
import type { BonusProgram } from "./bonus-program";

export interface BonusStatementLine {
  row: number;
  producerCode: string;
  agencyId: string;
  writtenPremiumCents: Cents;
  earnedPremiumCents: Cents;
  incurredLossesCents: Cents;
}

/** A carrier's bonus statement: one line per agency, the totals, and what the carrier says it applied. */
export interface BonusStatement {
  lines: BonusStatementLine[];
  writtenPremiumCents: Cents;
  earnedPremiumCents: Cents;
  incurredLossesCents: Cents;
  statedLossRatioBps: BasisPoints;
  statedRateBps: BasisPoints;
  paidCents: Cents;
}

export type BonusStatementReading =
  { status: "read"; statement: BonusStatement } | { status: "invalid"; problems: string[] };

/**
 * Reads a carrier's bonus statement CSV: a header, one row per producer code, a total row, then
 * one row each for the loss ratio, bonus rate and bonus paid the carrier states.
 *
 * Every problem is collected rather than stopping at the first, and the lines must add up to the
 * total row, as with commission statements.
 */
export function readBonusStatement(content: string, program: BonusProgram): BonusStatementReading {
  const { columns, totalLabel } = program.statement;
  let parsed: string[][];
  try {
    parsed = parse(content, { bom: true, skip_empty_lines: true, relax_column_count: true });
  } catch (error) {
    return { status: "invalid", problems: [`Not a valid CSV file: ${(error as Error).message}`] };
  }
  const [header = [], ...rows] = parsed;
  const problems: string[] = [];

  const index = (name: string) => {
    const position = header.findIndex(cell => cell.trim() === name);
    if (position === -1) problems.push(`Column "${name}" is missing from the header`);
    return position;
  };
  const at = {
    producerCode: index(columns.producerCode),
    writtenPremium: index(columns.writtenPremium),
    earnedPremium: index(columns.earnedPremium),
    incurredLosses: index(columns.incurredLosses)
  };
  if (problems.length > 0) return { status: "invalid", problems };

  const money = (row: string[], position: number, where: string): Cents => {
    try {
      return parseMoney(row[position] ?? "");
    } catch (error) {
      problems.push(`${where}: ${(error as Error).message}`);
      return 0;
    }
  };

  const lines: BonusStatementLine[] = [];
  let totals: Cents[] | null = null;
  const summary = new Map<string, string>();

  rows.forEach((row, offset) => {
    const where = `row ${offset + 2}`;
    const first = (row[0] ?? "").trim();
    if (totals !== null) {
      summary.set(first, (row[1] ?? "").trim());
      return;
    }
    if (first === totalLabel) {
      totals = [at.writtenPremium, at.earnedPremium, at.incurredLosses].map(position => money(row, position, where));
      return;
    }

    const producerCode = (row[at.producerCode] ?? "").trim();
    const agencyId = program.producerCodes[producerCode];
    if (!agencyId) problems.push(`${where}: producer code "${producerCode}" is not in the program's list`);
    lines.push({
      row: offset + 2,
      producerCode,
      agencyId: agencyId ?? "",
      writtenPremiumCents: money(row, at.writtenPremium, where),
      earnedPremiumCents: money(row, at.earnedPremium, where),
      incurredLossesCents: money(row, at.incurredLosses, where)
    });
  });

  const stated = (label: string, parse: (text: string) => number): number => {
    const text = summary.get(label);
    if (text === undefined) {
      problems.push(`The "${label}" row is missing`);
      return 0;
    }
    try {
      return parse(text);
    } catch (error) {
      problems.push(`${label}: ${(error as Error).message}`);
      return 0;
    }
  };
  const statedLossRatioBps = stated(program.statement.lossRatioLabel, parsePercent);
  const statedRateBps = stated(program.statement.bonusRateLabel, parsePercent);
  const paidCents = stated(program.statement.bonusPaidLabel, parseMoney);

  const [writtenPremiumCents = 0, earnedPremiumCents = 0, incurredLossesCents = 0] = totals ?? [];
  if (totals === null) problems.push(`The "${totalLabel}" row is missing`);
  else {
    const check = (name: string, total: Cents, values: Cents[]) => {
      if (sumCents(values) !== total) problems.push(`The lines' ${name} do not add up to the total row`);
    };
    check(
      "written premium",
      writtenPremiumCents,
      lines.map(line => line.writtenPremiumCents)
    );
    check(
      "earned premium",
      earnedPremiumCents,
      lines.map(line => line.earnedPremiumCents)
    );
    check(
      "incurred losses",
      incurredLossesCents,
      lines.map(line => line.incurredLossesCents)
    );
  }
  if (earnedPremiumCents <= 0) problems.push("Earned premium must be positive");

  if (problems.length > 0) return { status: "invalid", problems };
  return {
    status: "read",
    statement: {
      lines,
      writtenPremiumCents,
      earnedPremiumCents,
      incurredLossesCents,
      statedLossRatioBps,
      statedRateBps,
      paidCents
    }
  };
}

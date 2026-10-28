import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Period } from "../domain/dates";
import type { Policy } from "../domain/types";
import { PolicyIndex } from "../domain/policy-index";
import { reconcileStatement, type StatementReconciliation } from "../domain/reconcile-statement";
import { extractCsvStatement, type RowProblem } from "../extraction/csv-extractor";
import type { HeaderCheck } from "../extraction/header-check";
import type { CarrierConfig, Tenant } from "../tenant/tenant";

/** What happened to one carrier's statement this period. */
export type CarrierOutcome = { carrier: CarrierConfig; file: string } & (
  | { status: "statement_missing" }
  | { status: "format_drift"; headerCheck: HeaderCheck }
  | { status: "invalid_rows"; problems: RowProblem[] }
  | { status: "processed"; reconciliation: StatementReconciliation }
);

export interface PeriodResult {
  tenantId: string;
  period: Period;
  carriers: CarrierOutcome[];
}

/**
 * Reconciles every configured carrier for one period. Each carrier stands alone: a missing or
 * unreadable statement from one carrier never stops the others from closing.
 *
 * Statements are read from <inboxDirectory>/<period>/<carrier id>.csv.
 */
export async function reconcilePeriod(input: {
  tenant: Tenant;
  policies: readonly Policy[];
  inboxDirectory: string;
  period: Period;
}): Promise<PeriodResult> {
  const { tenant, period } = input;
  const index = new PolicyIndex(input.policies);
  const rules = {
    rateRules: tenant.rateRules,
    splitRules: tenant.splitRules,
    lineToleranceCents: tenant.lineToleranceCents
  };

  const carriers: CarrierOutcome[] = [];
  for (const carrier of tenant.carriers) {
    const file = join(input.inboxDirectory, period, `${carrier.id}.csv`);
    const content = await readIfPresent(file);
    if (content === null) {
      carriers.push({ carrier, file, status: "statement_missing" });
      continue;
    }

    const extraction = extractCsvStatement({ fileName: file, content, period, format: carrier.format });
    if (extraction.status !== "extracted") {
      carriers.push({ carrier, file, ...extraction });
      continue;
    }

    carriers.push({
      carrier,
      file,
      status: "processed",
      reconciliation: reconcileStatement(extraction.statement, index, rules)
    });
  }

  return { tenantId: tenant.id, period, carriers };
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

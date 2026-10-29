import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Period } from "../domain/dates";
import { PolicyIndex } from "../domain/policy-index";
import { reconcileStatement, type StatementReconciliation } from "../domain/reconcile-statement";
import type { Policy } from "../domain/types";
import { extractCsvStatement } from "../extraction/csv-extractor";
import type { ExtractionResult } from "../extraction/extraction-result";
import type { HeaderCheck } from "../extraction/header-check";
import { extractPdfStatement } from "../extraction/pdf-extractor";
import { proposeCsvFormat, type FormatProposal } from "../extraction/propose-format";
import { fileExtension } from "../extraction/source-format";
import type { LineProblem } from "../extraction/statement-line-reader";
import { MeteredModelClient } from "../model/metered-model-client";
import type { ModelClient, ModelUsage } from "../model/model-client";
import type { CarrierConfig, Tenant } from "../tenant/tenant";

/** What happened to one carrier's statement this period. */
export type CarrierOutcome = { carrier: CarrierConfig; file: string } & (
  | { status: "statement_missing" }
  | { status: "format_drift"; headerCheck: HeaderCheck; proposal: FormatProposal | null }
  | { status: "invalid_lines"; problems: LineProblem[] }
  | { status: "unreadable"; reason: string }
  | { status: "model_unavailable"; reason: string }
  | { status: "processed"; reconciliation: StatementReconciliation }
);

export interface PeriodResult {
  tenantId: string;
  period: Period;
  carriers: CarrierOutcome[];
  /** Every model call made during the run, with tokens, latency and estimated cost. */
  modelCalls: ModelUsage[];
}

/**
 * Reconciles every configured carrier for one period. Each carrier stands alone: a missing,
 * changed or unreadable statement from one carrier never stops the others from closing.
 *
 * Statements are read from <inboxDirectory>/<period>/<carrier id>.<csv|pdf>. The model is used
 * only to read PDFs and to propose a mapping when a CSV layout changes; without a model those
 * carriers are reported and everything else still runs.
 */
export async function reconcilePeriod(input: {
  tenant: Tenant;
  policies: readonly Policy[];
  inboxDirectory: string;
  period: Period;
  model: ModelClient | null;
}): Promise<PeriodResult> {
  const { tenant, period } = input;
  const index = new PolicyIndex(input.policies);
  const model = input.model ? new MeteredModelClient(input.model) : null;
  const rules = {
    rateRules: tenant.rateRules,
    splitRules: tenant.splitRules,
    lineToleranceCents: tenant.lineToleranceCents
  };

  const carriers: CarrierOutcome[] = [];
  for (const carrier of tenant.carriers) {
    const file = join(input.inboxDirectory, period, `${carrier.id}.${fileExtension(carrier.format)}`);
    const outcome = await readStatement({ carrier, file, period, model });

    carriers.push(
      outcome.status === "extracted"
        ? { carrier, file, status: "processed", reconciliation: reconcileStatement(outcome.statement, index, rules) }
        : { carrier, file, ...outcome }
    );
  }

  return { tenantId: tenant.id, period, carriers, modelCalls: model?.calls ?? [] };
}

type ReadOutcome =
  | Exclude<ExtractionResult, { status: "format_drift" }>
  | { status: "format_drift"; headerCheck: HeaderCheck; proposal: FormatProposal | null }
  | { status: "statement_missing" }
  | { status: "model_unavailable"; reason: string };

async function readStatement(input: {
  carrier: CarrierConfig;
  file: string;
  period: Period;
  model: ModelClient | null;
}): Promise<ReadOutcome> {
  const { carrier, file, period, model } = input;
  const data = await readIfPresent(file);
  if (data === null) return { status: "statement_missing" };

  const format = carrier.format;
  try {
    if (format.kind === "pdf") {
      if (model === null)
        return { status: "model_unavailable", reason: "PDF statements need a model and none is configured." };
      const extraction = await extractPdfStatement({ fileName: file, data, period, format, model });
      return extraction.status === "format_drift" ? { ...extraction, proposal: null } : extraction;
    }

    const content = data.toString("utf8");
    const extraction = extractCsvStatement({ fileName: file, content, period, format });
    if (extraction.status !== "format_drift") return extraction;

    const proposal = model ? await proposeCsvFormat({ current: format, fileName: file, content, period, model }) : null;
    return { ...extraction, proposal };
  } catch (error) {
    // A model outage or a missing recording affects this carrier only.
    return { status: "model_unavailable", reason: (error as Error).message };
  }
}

async function readIfPresent(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

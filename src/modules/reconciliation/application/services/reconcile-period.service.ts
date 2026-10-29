import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Injectable } from "@nestjs/common";
import type { ModelUsage } from "../../../../libs/model-client/contract/model.models";
import {
  FormatProposalService,
  type FormatProposal
} from "../../../extraction/application/services/format-proposal.service";
import { PdfStatementReaderService } from "../../../extraction/application/services/pdf-statement-reader.service";
import { extractCsvStatement } from "../../../extraction/domain/csv-extractor";
import type { HeaderCheck } from "../../../extraction/domain/header-check";
import { fileExtension } from "../../../extraction/domain/source-format";
import type { Period } from "../../domain/dates";
import { PolicyIndex } from "../../domain/policy-index";
import { reconcileStatement, type StatementReconciliation } from "../../domain/reconcile-statement";
import type { Policy, Statement } from "../../domain/types";
import type { LineProblem } from "../../../extraction/domain/statement-line-reader";
import type { CarrierConfig, Tenant } from "../../infrastructure/tenant-files";

/** What reading one carrier's statement file can produce, before reconciliation. */
type ReadOutcome =
  | { status: "extracted"; statement: Statement }
  | { status: "statement_missing" }
  | { status: "format_drift"; headerCheck: HeaderCheck; proposal: FormatProposal }
  | { status: "invalid_lines"; problems: LineProblem[] }
  | { status: "unreadable"; reason: string }
  | { status: "model_unavailable"; reason: string };

/** What happened to one carrier's statement this period. */
export type CarrierOutcome = { carrier: CarrierConfig; file: string } & (
  Exclude<ReadOutcome, { status: "extracted" }> | { status: "processed"; reconciliation: StatementReconciliation }
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
 * only to read PDFs and to propose a mapping when a CSV layout changes.
 */
@Injectable()
export class ReconcilePeriodService {
  constructor(
    private readonly pdfReader: PdfStatementReaderService,
    private readonly formatProposals: FormatProposalService
  ) {}

  async reconcile(input: {
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
    const modelCalls: ModelUsage[] = [];

    for (const carrier of tenant.carriers) {
      const file = join(input.inboxDirectory, period, `${carrier.id}.${fileExtension(carrier.format)}`);
      const outcome = await this.readStatement(carrier, file, period, modelCalls);

      carriers.push(
        outcome.status === "extracted"
          ? { carrier, file, status: "processed", reconciliation: reconcileStatement(outcome.statement, index, rules) }
          : { ...outcome, carrier, file }
      );
    }

    return { tenantId: tenant.id, period, carriers, modelCalls };
  }

  private async readStatement(
    carrier: CarrierConfig,
    file: string,
    period: Period,
    modelCalls: ModelUsage[]
  ): Promise<ReadOutcome> {
    const data = await readIfPresent(file);
    if (data === null) return { status: "statement_missing" };

    const format = carrier.format;
    if (format.kind === "pdf") {
      try {
        const reading = await this.pdfReader.read({ fileName: file, data, period, format });
        modelCalls.push(...reading.modelCalls);
        return reading.extraction;
      } catch (error) {
        return modelUnavailable(error);
      }
    }

    const content = data.toString("utf8");
    const extraction = extractCsvStatement({ fileName: file, content, period, format });
    if (extraction.status !== "format_drift") return extraction;

    try {
      const { proposal, usage } = await this.formatProposals.propose({
        current: format,
        fileName: file,
        content,
        period
      });
      modelCalls.push(usage);
      return { ...extraction, proposal };
    } catch (error) {
      return modelUnavailable(error);
    }
  }
}

/** A model outage or a missing recording holds this carrier only. */
function modelUnavailable(error: unknown): ReadOutcome {
  return { status: "model_unavailable", reason: (error as Error).message };
}

async function readIfPresent(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

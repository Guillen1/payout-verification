import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Command, CommandRunner } from "nest-commander";
import { costOfLiveCalls, type ModelUsage } from "../../../libs/model-client/contract/model.models";
import { BonusTermsService } from "../../bonus/application/services/bonus-terms.service";
import type { BonusRules } from "../../bonus/domain/bonus-rules";
import { loadBonusProgram } from "../../bonus/infrastructure/bonus-files";
import { generateBonusDemo } from "../../demo/synthetic/bonus-scenario";
import { generateDemoData } from "../../demo/synthetic/generate-demo";
import { FormatProposalService } from "../../extraction/application/services/format-proposal.service";
import {
  PdfStatementReaderService,
  type StatementTranscript
} from "../../extraction/application/services/pdf-statement-reader.service";
import { PolicyIndex } from "../../reconciliation/domain/policy-index";
import { reconcileStatement } from "../../reconciliation/domain/reconcile-statement";
import { loadTenant, type Tenant } from "../../reconciliation/infrastructure/tenant-files";
import { DRIFT_CASES } from "../drift-cases";
import { MEASURE_LABELS, type EvalSummary } from "../eval-summary";

const PERIOD = "2026-09";
const SEEDS = [42, 7, 2026];
/** Every demo tenant's PDF statement is read; the layout and agreement suites use the agency network. */
const TENANTS = ["agency-network", "brand-group"];
const FLOORS = { fieldAccuracy: 0.99, tieOutRate: 1, findingAccuracy: 1, proposalsCorrect: 1, bonusRulesCorrect: 1 };
type Measure = keyof typeof FLOORS;

/**
 * `eval`: measures the model on its three jobs against the answer key, and fails below the floors.
 *
 *   MODEL_MODE=record (default)  replays recordings, asks the model for anything not recorded
 *   MODEL_MODE=replay            recordings only; what CI runs
 *   MODEL_MODE=live              ignores recordings, measures the model as it is today
 */
@Command({ name: "eval", description: "Measure the model against the answer key" })
export class EvalCli extends CommandRunner {
  constructor(
    private readonly pdfReader: PdfStatementReaderService,
    private readonly formatProposals: FormatProposalService,
    private readonly bonusTerms: BonusTermsService
  ) {
    super();
  }

  async run(): Promise<void> {
    const tenants = await Promise.all(TENANTS.map(id => loadTenant(`tenants/${id}`)));
    const tenant = tenants[0]!;
    const calls: ModelUsage[] = [];

    const reading = await this.evaluatePdfReading(tenants, calls);
    const proposals = await this.evaluateProposals(tenant, calls);
    const agreements = await this.evaluateAgreements(tenant, calls);

    const scores: Record<Measure, number> = {
      ...reading.scores,
      proposalsCorrect: proposals.score,
      bonusRulesCorrect: agreements.score
    };
    const passed = (Object.keys(FLOORS) as Measure[]).every(measure => scores[measure] >= FLOORS[measure]);

    const report = [
      `# Model evals, ${new Date().toISOString().slice(0, 10)}`,
      "",
      `Model calls: ${calls.length}, ${calls.filter(call => call.source === "recording").length} replayed from recordings. Estimated cost of this run: $${costOfLiveCalls(calls).toFixed(4)}.`,
      "",
      "## Reading PDF statements",
      "",
      `Retried on the escalation model: ${reading.escalations} of ${reading.statements}. A rising count means the default model is struggling.`,
      "",
      "| Statement | Seed | Read by | Fields read correctly | Ties out | Findings correct |",
      "| --- | ---: | --- | ---: | --- | ---: |",
      ...reading.rows,
      "",
      "## Proposing mappings for changed layouts",
      "",
      "| Case | Proposal | Maps the changed columns correctly |",
      "| --- | --- | --- |",
      ...proposals.rows,
      "",
      "## Reading bonus agreements into rules",
      "",
      "| Seed | Draft | Every rule and clause correct | Notes for the reviewer |",
      "| ---: | --- | --- | ---: |",
      ...agreements.rows,
      "",
      "## Scores against floors",
      "",
      "| Measure | Score | Floor |",
      "| --- | ---: | ---: |",
      ...(Object.keys(FLOORS) as Measure[]).map(
        measure => `| ${measure} | ${(scores[measure] * 100).toFixed(1)}% | ${(FLOORS[measure] * 100).toFixed(0)}% |`
      ),
      "",
      passed ? "**Result: pass.**" : "**Result: FAIL.**"
    ].join("\n");

    const summary: EvalSummary = {
      ranAt: new Date().toISOString(),
      passed,
      scores: (Object.keys(FLOORS) as Measure[]).map(measure => ({
        measure,
        label: MEASURE_LABELS[measure] ?? measure,
        score: scores[measure],
        floor: FLOORS[measure]
      })),
      escalations: reading.escalations,
      statements: reading.statements,
      calls: calls.length,
      replayed: calls.filter(call => call.source === "recording").length,
      costUsd: costOfLiveCalls(calls)
    };

    await mkdir(join("out", "evals"), { recursive: true });
    await writeFile(join("out", "evals", "report.md"), `${report}\n`);
    await writeFile(join("out", "evals", "report.json"), `${JSON.stringify(summary, null, 2)}\n`);
    console.log(report);
    process.exitCode = passed ? 0 : 1;
  }

  /**
   * Field-level reading accuracy, tie-out and end-to-end findings on each tenant's PDF statement,
   * once per seed: an insurance carrier's commission statement and a retailer's remittance advice.
   */
  private async evaluatePdfReading(tenants: readonly Tenant[], calls: ModelUsage[]) {
    const rows: string[] = [];
    const totals = { fieldsRight: 0, fields: 0, tiedOut: 0, findingsRight: 0, findings: 0 };
    let escalations = 0;
    let statements = 0;

    for (const { tenant, seed } of tenants.flatMap(tenant => SEEDS.map(seed => ({ tenant, seed })))) {
      const carrier = tenant.carriers.find(entry => entry.format.kind === "pdf");
      if (!carrier || carrier.format.kind !== "pdf") throw new Error(`${tenant.id} has no PDF statement`);
      statements += 1;

      const demo = await generateDemoData({ tenant, period: PERIOD, seed });
      const statement = demo.statements.find(entry => entry.carrierId === carrier.id)!;
      const labels = demo.labels.carriers[carrier.id]!;

      const result = await this.pdfReader.read({
        fileName: statement.fileName,
        data: Buffer.from(statement.content),
        period: PERIOD,
        format: carrier.format,
        vocabulary: tenant.vocabulary
      });
      calls.push(...result.modelCalls);
      const readBy = result.modelCalls.at(-1)!.model;
      if (result.modelCalls.length > 1) escalations += 1;

      const fields = scoreTranscript(result.transcript, labels.transcript!);
      let tiesOut = false;
      let findingsRight = 0;
      if (result.extraction.status === "extracted") {
        const reconciliation = reconcileStatement(result.extraction.statement, new PolicyIndex(demo.policies), {
          rateRules: tenant.rateRules,
          splitRules: tenant.splitRules,
          lineToleranceCents: tenant.lineToleranceCents,
          words: tenant.vocabulary
        });
        tiesOut = reconciliation.status === "reconciled";
        if (reconciliation.status === "reconciled") {
          findingsRight = reconciliation.lines.filter(
            (line, index) => line.finding === labels.lines[index]?.finding
          ).length;
        }
      }

      totals.fieldsRight += fields.right;
      totals.fields += fields.total;
      totals.tiedOut += tiesOut ? 1 : 0;
      totals.findingsRight += findingsRight;
      totals.findings += labels.lines.length;
      rows.push(
        `| ${carrier.name} | ${seed} | ${readBy} | ${fields.right}/${fields.total} | ${tiesOut ? "yes" : "no"} | ${findingsRight}/${labels.lines.length} |`
      );
    }

    return {
      rows,
      escalations,
      statements,
      scores: {
        fieldAccuracy: totals.fieldsRight / totals.fields,
        tieOutRate: totals.tiedOut / statements,
        findingAccuracy: totals.findingsRight / totals.findings
      }
    };
  }

  /** Whether each proposed mapping is verified and maps the changed columns to the right names. */
  private async evaluateProposals(tenant: Tenant, calls: ModelUsage[]) {
    const demo = await generateDemoData({ tenant, period: PERIOD, seed: SEEDS[0]! });
    const rows: string[] = [];
    let correct = 0;

    for (const driftCase of DRIFT_CASES) {
      const carrier = tenant.carriers.find(entry => entry.id === driftCase.carrierId)!;
      if (carrier.format.kind !== "csv") throw new Error(`${carrier.id} is not a CSV carrier`);
      const original = demo.statements.find(entry => entry.carrierId === carrier.id)!.content.toString();

      const { proposal, usage } = await this.formatProposals.propose({
        current: carrier.format,
        fileName: `${carrier.id}.csv`,
        content: driftCase.change(original),
        period: PERIOD,
        vocabulary: tenant.vocabulary
      });
      calls.push(usage);

      const columns = proposal.status !== "no_answer" ? proposal.format?.columns : undefined;
      const mapsCorrectly =
        columns !== undefined &&
        Object.entries(driftCase.expectedColumns).every(
          ([field, name]) => columns[field as keyof typeof columns] === name
        );
      if (proposal.status === "verified" && mapsCorrectly) correct += 1;
      rows.push(`| ${driftCase.name} | ${proposal.status} | ${mapsCorrectly ? "yes" : "no"} |`);
    }

    return { rows, score: correct / DRIFT_CASES.length };
  }

  /** Whether the rules drafted from each seed's agreement match the answer key exactly, clauses included. */
  private async evaluateAgreements(tenant: Tenant, calls: ModelUsage[]) {
    const { program } = await loadBonusProgram("tenants/agency-network", "northwind-2025");
    const carrierName = tenant.carriers.find(carrier => carrier.id === program.carrierId)!.name;
    const products = [...new Set(tenant.rateRules.map(rule => rule.product))].sort();
    const rows: string[] = [];
    let correct = 0;

    for (const seed of SEEDS) {
      const demo = await generateBonusDemo({ tenant, program, carrierName, seed });
      const { draft, usage } = await this.bonusTerms.draft({
        program,
        products,
        fileName: "agreement.pdf",
        agreement: demo.agreement
      });
      calls.push(usage);

      const matches = draft.status === "drafted" && sameRules(draft.rules, demo.labels.rules);
      if (matches) correct += 1;
      const notes = draft.status === "no_answer" ? 0 : draft.notes.length;
      rows.push(`| ${seed} | ${draft.status} | ${matches ? "yes" : "no"} | ${notes} |`);
    }

    return { rows, score: correct / SEEDS.length };
  }
}

/** Rules compared exactly, except the order products are listed in. */
function sameRules(actual: BonusRules, expected: BonusRules): boolean {
  const normalize = (rules: BonusRules) =>
    JSON.stringify({
      ...rules,
      eligibleProducts: { ...rules.eligibleProducts, products: [...rules.eligibleProducts.products].sort() }
    });
  return normalize(actual) === normalize(expected);
}

/** Every field of every line, compared exactly, ignoring differences in spacing. */
function scoreTranscript(actual: StatementTranscript | null, expected: StatementTranscript) {
  const total = 1 + expected.lines.reduce((sum, line) => sum + Object.keys(line).length, 0);
  if (actual === null) return { right: 0, total };

  const same = (a: unknown, b: unknown) =>
    String(a).replace(/\s+/g, " ").trim() === String(b).replace(/\s+/g, " ").trim();
  let right = same(actual.statementTotal, expected.statementTotal) ? 1 : 0;
  expected.lines.forEach((line, index) => {
    const read = actual.lines[index];
    for (const field of Object.keys(line) as (keyof typeof line)[])
      if (read && same(read[field], line[field])) right += 1;
  });
  return { right, total };
}

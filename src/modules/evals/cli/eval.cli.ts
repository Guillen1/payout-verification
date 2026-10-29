import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Command, CommandRunner } from "nest-commander";
import type { ModelUsage } from "../../../libs/model-client/contract/model.models";
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

const PERIOD = "2026-09";
const SEEDS = [42, 7, 2026];
const FLOORS = { fieldAccuracy: 0.99, tieOutRate: 1, findingAccuracy: 1, proposalsCorrect: 1 };
type Measure = keyof typeof FLOORS;

/**
 * `eval`: measures the model on its two jobs against the answer key, and fails below the floors.
 *
 *   MODEL_MODE=record (default)  replays recordings, asks the model for anything not recorded
 *   MODEL_MODE=replay            recordings only; what CI runs
 *   MODEL_MODE=live              ignores recordings, measures the model as it is today
 */
@Command({ name: "eval", description: "Measure the model against the answer key" })
export class EvalCli extends CommandRunner {
  constructor(
    private readonly pdfReader: PdfStatementReaderService,
    private readonly formatProposals: FormatProposalService
  ) {
    super();
  }

  async run(): Promise<void> {
    const tenant = await loadTenant("tenants/agency-network");
    const calls: ModelUsage[] = [];

    const reading = await this.evaluatePdfReading(tenant, calls);
    const proposals = await this.evaluateProposals(tenant, calls);

    const scores: Record<Measure, number> = { ...reading.scores, proposalsCorrect: proposals.score };
    const passed = (Object.keys(FLOORS) as Measure[]).every(measure => scores[measure] >= FLOORS[measure]);
    const cost = calls.reduce((total, call) => total + (call.estimatedCostUsd ?? 0), 0);

    const report = [
      `# Model evals, ${new Date().toISOString().slice(0, 10)}`,
      "",
      `Model calls: ${calls.length} (${[...new Set(calls.map(call => call.source))].join(", ")}). Estimated cost: $${cost.toFixed(4)}.`,
      "",
      "## Reading PDF statements",
      "",
      `Retried on the escalation model: ${reading.escalations} of ${SEEDS.length}. A rising count means the default model is struggling.`,
      "",
      "| Seed | Read by | Fields read correctly | Ties out | Findings correct |",
      "| ---: | --- | ---: | --- | ---: |",
      ...reading.rows,
      "",
      "## Proposing mappings for changed layouts",
      "",
      "| Case | Proposal | Maps the changed columns correctly |",
      "| --- | --- | --- |",
      ...proposals.rows,
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

    await mkdir(join("out", "evals"), { recursive: true });
    await writeFile(join("out", "evals", "report.md"), `${report}\n`);
    console.log(report);
    process.exitCode = passed ? 0 : 1;
  }

  /** Field-level reading accuracy, tie-out and end-to-end findings on one PDF statement per seed. */
  private async evaluatePdfReading(tenant: Tenant, calls: ModelUsage[]) {
    const carrier = tenant.carriers.find(entry => entry.format.kind === "pdf");
    if (!carrier || carrier.format.kind !== "pdf") throw new Error("The demo tenant has no PDF carrier");

    const rows: string[] = [];
    const totals = { fieldsRight: 0, fields: 0, tiedOut: 0, findingsRight: 0, findings: 0 };
    let escalations = 0;

    for (const seed of SEEDS) {
      const demo = await generateDemoData({ tenant, period: PERIOD, seed });
      const statement = demo.statements.find(entry => entry.carrierId === carrier.id)!;
      const labels = demo.labels.carriers[carrier.id]!;

      const result = await this.pdfReader.read({
        fileName: statement.fileName,
        data: Buffer.from(statement.content),
        period: PERIOD,
        format: carrier.format
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
          lineToleranceCents: tenant.lineToleranceCents
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
        `| ${seed} | ${readBy} | ${fields.right}/${fields.total} | ${tiesOut ? "yes" : "no"} | ${findingsRight}/${labels.lines.length} |`
      );
    }

    return {
      rows,
      escalations,
      scores: {
        fieldAccuracy: totals.fieldsRight / totals.fields,
        tieOutRate: totals.tiedOut / SEEDS.length,
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
        period: PERIOD
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

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateDemoData } from "../synthetic/generate-demo";
import { PolicyIndex } from "../src/domain/policy-index";
import { reconcileStatement } from "../src/domain/reconcile-statement";
import { tieOut } from "../src/domain/tie-out";
import { extractPdfStatement, type StatementTranscript } from "../src/extraction/pdf-extractor";
import { proposeCsvFormat } from "../src/extraction/propose-format";
import { createModelClient } from "../src/model/create-model-client";
import { MeteredModelClient } from "../src/model/metered-model-client";
import { RecordingMissingError } from "../src/model/recording-model-client";
import { loadTenant } from "../src/tenant/tenant";
import { DRIFT_CASES } from "./drift-cases";
import { LastAnswerModelClient } from "./last-answer-model-client";

/*
 * Measures the model on the two jobs it does, against the answer key, and fails below the floors.
 *
 *   pnpm eval                      uses recordings, asks the model for anything not recorded
 *   MODEL_MODE=replay pnpm eval    recordings only; what CI runs
 *   MODEL_MODE=live pnpm eval      ignores recordings, measures the model as it is today
 */

const PERIOD = "2026-09";
const SEEDS = [42, 7, 2026];
const FLOORS = { fieldAccuracy: 0.99, tieOutRate: 1, findingAccuracy: 1, proposalsVerified: 1 };

try {
  process.loadEnvFile();
} catch {
  // No .env: credentials may come from the environment, or the run replays recordings only.
}

await main().catch((error: unknown) => {
  if (!(error instanceof RecordingMissingError)) throw error;
  console.error(`\n${error.message}\n`);
  process.exitCode = 2;
});

async function main(): Promise<void> {
  const tenant = await loadTenant("tenants/agency-network");
  const model = new MeteredModelClient(createModelClient());
  const pdfCarrier = tenant.carriers.find(carrier => carrier.format.kind === "pdf");
  if (!pdfCarrier || pdfCarrier.format.kind !== "pdf") throw new Error("The demo tenant has no PDF carrier");

  console.log(`\nReading PDF statements (${SEEDS.length} seeds)\n`);
  const pdfRows: string[] = [];
  let fieldsRight = 0;
  let fieldsTotal = 0;
  let tiedOut = 0;
  let findingsRight = 0;
  let findingsTotal = 0;

  for (const seed of SEEDS) {
    const demo = await generateDemoData({ tenant, period: PERIOD, seed });
    const statement = demo.statements.find(s => s.carrierId === pdfCarrier.id)!;
    const labels = demo.labels.carriers[pdfCarrier.id]!;

    const reader = new LastAnswerModelClient(model);
    const extraction = await extractPdfStatement({
      fileName: statement.fileName,
      data: statement.content as Buffer,
      period: PERIOD,
      format: pdfCarrier.format,
      model: reader
    });
    const transcript = reader.lastAnswer as StatementTranscript | null;

    const fieldScore = transcript
      ? scoreTranscript(transcript, labels.transcript!)
      : { right: 0, total: countFields(labels.transcript!) };
    fieldsRight += fieldScore.right;
    fieldsTotal += fieldScore.total;

    let tiesOut = false;
    let findingScore = { right: 0, total: labels.lines.length };
    if (extraction.status === "extracted") {
      tiesOut = tieOut(extraction.statement).tiesOut;
      const reconciliation = reconcileStatement(extraction.statement, new PolicyIndex(demo.policies), {
        rateRules: tenant.rateRules,
        splitRules: tenant.splitRules,
        lineToleranceCents: tenant.lineToleranceCents
      });
      if (reconciliation.status === "reconciled") {
        findingScore = {
          right: reconciliation.lines.filter((line, index) => line.finding === labels.lines[index]?.finding).length,
          total: labels.lines.length
        };
      }
    }
    if (tiesOut) tiedOut += 1;
    findingsRight += findingScore.right;
    findingsTotal += findingScore.total;

    pdfRows.push(
      `| ${seed} | ${extraction.status} | ${fieldScore.right}/${fieldScore.total} | ${tiesOut ? "yes" : "no"} | ${findingScore.right}/${findingScore.total} |`
    );
  }

  console.log(`Proposing mappings for changed layouts (${DRIFT_CASES.length} cases)\n`);
  const driftRows: string[] = [];
  let proposalsVerified = 0;
  const demo = await generateDemoData({ tenant, period: PERIOD, seed: SEEDS[0]! });

  for (const driftCase of DRIFT_CASES) {
    const carrier = tenant.carriers.find(entry => entry.id === driftCase.carrierId)!;
    if (carrier.format.kind !== "csv") throw new Error(`${carrier.id} is not a CSV carrier`);
    const original = demo.statements.find(s => s.carrierId === carrier.id)!.content.toString();

    const proposal = await proposeCsvFormat({
      current: carrier.format,
      fileName: `${carrier.id}.csv`,
      content: driftCase.change(original),
      period: PERIOD,
      model
    });

    const mapped = proposal.status !== "no_answer" && proposal.format !== null ? proposal.format.columns : null;
    const correctColumns = mapped
      ? Object.entries(driftCase.expectedColumns).every(
          ([field, column]) => mapped[field as keyof typeof mapped] === column
        )
      : false;
    if (proposal.status === "verified" && correctColumns) proposalsVerified += 1;

    driftRows.push(`| ${driftCase.name} | ${proposal.status} | ${correctColumns ? "yes" : "no"} |`);
  }

  const scores = {
    fieldAccuracy: fieldsTotal === 0 ? 0 : fieldsRight / fieldsTotal,
    tieOutRate: tiedOut / SEEDS.length,
    findingAccuracy: findingsTotal === 0 ? 0 : findingsRight / findingsTotal,
    proposalsVerified: proposalsVerified / DRIFT_CASES.length
  };
  const passed = (Object.keys(FLOORS) as (keyof typeof FLOORS)[]).every(key => scores[key] >= FLOORS[key]);
  const cost = model.calls.reduce((total, call) => total + (call.estimatedCostUsd ?? 0), 0);
  const sources = [...new Set(model.calls.map(call => call.source))].join(", ");

  const report = [
    `# Model evals, ${new Date().toISOString().slice(0, 10)}`,
    "",
    `Model calls: ${model.calls.length} (${sources}). Estimated cost of the calls: $${cost.toFixed(4)}.`,
    "",
    "## Reading PDF statements",
    "",
    "| Seed | Extraction | Fields read correctly | Ties out | Findings correct |",
    "| ---: | --- | ---: | --- | ---: |",
    ...pdfRows,
    "",
    "## Proposing mappings for changed layouts",
    "",
    "| Case | Proposal | Maps the changed columns correctly |",
    "| --- | --- | --- |",
    ...driftRows,
    "",
    "## Scores against floors",
    "",
    "| Measure | Score | Floor |",
    "| --- | ---: | ---: |",
    ...(Object.keys(FLOORS) as (keyof typeof FLOORS)[]).map(
      key => `| ${key} | ${(scores[key] * 100).toFixed(1)}% | ${(FLOORS[key] * 100).toFixed(0)}% |`
    ),
    "",
    passed ? "**Result: pass.**" : "**Result: FAIL.**"
  ].join("\n");

  await mkdir(join("out", "evals"), { recursive: true });
  await writeFile(join("out", "evals", "report.md"), `${report}\n`);
  console.log(report);
  process.exitCode = passed ? 0 : 1;
}

/** Every field of every line, compared exactly. Policy numbers and names ignore spacing differences. */
function scoreTranscript(actual: StatementTranscript, expected: StatementTranscript): { right: number; total: number } {
  let right = actual.statementTotal === expected.statementTotal ? 1 : 0;
  expected.lines.forEach((line, index) => {
    const read = actual.lines[index];
    for (const field of Object.keys(line) as (keyof typeof line)[]) {
      if (read && normalize(read[field]) === normalize(line[field])) right += 1;
    }
  });
  return { right, total: countFields(expected) };
}

function countFields(transcript: StatementTranscript): number {
  return 1 + transcript.lines.reduce((total, line) => total + Object.keys(line).length, 0);
}

function normalize(value: string | number): string {
  return String(value).replace(/\s+/g, " ").trim();
}

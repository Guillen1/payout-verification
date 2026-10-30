import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Injectable } from "@nestjs/common";
import type { AppPaths } from "../../../libs/app-paths/app-paths";
import type { ModelUsage } from "../../../libs/model-client/contract/model.models";
import { BonusRunsService } from "../../bonus/application/services/bonus-runs.service";
import { PeriodRunsService } from "../../reconciliation/application/services/period-runs.service";
import { READ_PDF_STATEMENT_TASK } from "../../extraction/application/services/pdf-statement-reader.service";
import type { CarrierView, PeriodView } from "../../reconciliation/application/views/period-view";
import { capitalized, type Vocabulary } from "../../reconciliation/domain/vocabulary";
import { loadTenant } from "../../reconciliation/infrastructure/tenant-files";
import { readEvalSummary, type EvalSummary } from "../eval-summary";

export interface ModelUseRow {
  task: string;
  model: string;
  calls: number;
  replayed: number;
  /** Average cost of one call at list prices, as recorded; replaying it costs nothing. */
  costPerCallUsd: number;
}

/** One thing watched every period, and whether it needs a look. */
export interface Signal {
  label: string;
  value: string;
  status: "ok" | "alert";
}

export interface HealthView {
  evals: EvalSummary | null;
  latestPeriod: string | null;
  modelUse: ModelUseRow[];
  /** The latest period's signals that the pipeline is still working, empty before the first run. */
  signals: Signal[];
}

/**
 * Above this share of lines needing a person, something changed: a carrier's documents, the rates on
 * file, or the reading. A fixed limit until there are enough periods for control charts.
 */
const NEEDS_PERSON_LIMIT = 0.15;

/**
 * Whether the reading can still be trusted: the model's eval scores against their floors, how often
 * it needed the stronger model, and what each call costs.
 */
@Injectable()
export class HealthService {
  constructor(
    private readonly periodRuns: PeriodRunsService,
    private readonly bonusRuns: BonusRunsService
  ) {}

  async view(paths: AppPaths): Promise<HealthView> {
    const latest = (await this.periodRuns.periods(paths)).find(entry => entry.hasRun)?.period ?? null;
    const period = latest === null ? null : await this.periodRuns.view(paths, latest);
    const programs = (await this.bonusRuns.programs(paths)).filter(program => program.hasRun);
    const bonusCalls = await Promise.all(
      programs.map(async program => {
        const saved = await readFile(join(paths.out, "bonus", program.id, "result.json"), "utf8");
        return (JSON.parse(saved) as { modelCalls: ModelUsage[] }).modelCalls;
      })
    );

    const tenant = await loadTenant(paths.tenant);

    return {
      evals: await readEvalSummary(paths.evals),
      latestPeriod: latest,
      modelUse: groupCalls([...(period?.modelCalls ?? []), ...bonusCalls.flat()]),
      signals: period === null ? [] : signalsFor(period, tenant.vocabulary)
    };
  }
}

/**
 * What would say the pipeline stopped working or quietly regressed, read from one period's results:
 * statements that do not add up, layouts that changed, senders that went silent, carriers a person
 * switched off, more lines than usual needing a person, and readings the default model got wrong.
 */
export function signalsFor(period: PeriodView, words: Vocabulary): Signal[] {
  const carriers = period.carriers;
  const named = (outcome: CarrierView["outcome"]) =>
    carriers.filter(carrier => carrier.outcome === outcome).map(carrier => carrier.name);
  const listed = (names: string[]): Signal => ({
    label: "",
    value: names.length === 0 ? "None" : names.join(", "),
    status: names.length === 0 ? "ok" : "alert"
  });

  const read = carriers.filter(carrier => carrier.outcome === "processed");
  const tiedOut = read.filter(carrier => carrier.state === "processed");
  const lines = tiedOut.reduce((sum, carrier) => sum + carrier.lines.length, 0);
  const needPerson = tiedOut.reduce(
    (sum, carrier) => sum + carrier.counts.dispute + carrier.counts.review + carrier.counts.missing,
    0
  );
  const pdfsRead = carriers.filter(
    carrier => carrier.fileKind === "pdf" && carrier.outcome !== "statement_missing" && carrier.outcome !== "paused"
  ).length;
  const readings = period.modelCalls.filter(call => call.task === READ_PDF_STATEMENT_TASK).length;
  const retries = Math.max(0, readings - pdfsRead);

  return [
    {
      label: `${capitalized(words.statement)}s that add up to the cent`,
      value: `${tiedOut.length} of ${read.length}`,
      status: tiedOut.length === read.length ? "ok" : "alert"
    },
    { ...listed(named("format_drift")), label: "Layouts that changed" },
    { ...listed(named("statement_missing")), label: `${capitalized(words.counterparties)} that sent nothing` },
    { ...listed(named("paused")), label: "Switched off by a person" },
    {
      label: "Lines that need a person",
      value: `${needPerson} of ${lines}`,
      status: lines > 0 && needPerson / lines > NEEDS_PERSON_LIMIT ? "alert" : "ok"
    },
    {
      label: "Readings retried on the stronger model",
      value: `${retries} of ${pdfsRead}`,
      status: retries === 0 ? "ok" : "alert"
    }
  ];
}

function groupCalls(calls: readonly ModelUsage[]): ModelUseRow[] {
  const groups = Map.groupBy(calls, call => `${call.task}|${call.model}`);
  return [...groups.values()].map(group => ({
    task: group[0]!.task,
    model: group[0]!.model,
    calls: group.length,
    replayed: group.filter(call => call.source === "recording").length,
    costPerCallUsd: group.reduce((sum, call) => sum + (call.estimatedCostUsd ?? 0), 0) / group.length
  }));
}

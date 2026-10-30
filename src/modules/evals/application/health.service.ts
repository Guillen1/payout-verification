import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Injectable } from "@nestjs/common";
import type { AppPaths } from "../../../libs/app-paths/app-paths";
import type { ModelUsage } from "../../../libs/model-client/contract/model.models";
import { BonusRunsService } from "../../bonus/application/services/bonus-runs.service";
import { PeriodRunsService } from "../../reconciliation/application/services/period-runs.service";
import type { EvalSummary } from "../eval-summary";

export interface ModelUseRow {
  task: string;
  model: string;
  calls: number;
  replayed: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface HealthView {
  evals: EvalSummary | null;
  latestPeriod: string | null;
  /** Carriers held in the latest period, with the reason. */
  held: { carrier: string; reason: string }[];
  modelUse: ModelUseRow[];
}

/**
 * The signals that say whether the system still works: the model's eval scores against their
 * floors, which statements were held last run and why, and what the model was asked to do.
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

    return {
      evals: await readEvals(paths),
      latestPeriod: latest,
      held: (period?.carriers ?? [])
        .filter(carrier => carrier.hold !== null)
        .map(carrier => ({ carrier: carrier.name, reason: carrier.hold!.reason })),
      modelUse: groupCalls([...(period?.modelCalls ?? []), ...bonusCalls.flat()])
    };
  }
}

function groupCalls(calls: readonly ModelUsage[]): ModelUseRow[] {
  const rows = new Map<string, ModelUseRow>();
  for (const call of calls) {
    const key = `${call.task}|${call.model}`;
    const row = rows.get(key) ?? {
      task: call.task,
      model: call.model,
      calls: 0,
      replayed: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0
    };
    row.calls += 1;
    row.replayed += call.source === "recording" ? 1 : 0;
    row.inputTokens += call.inputTokens;
    row.outputTokens += call.outputTokens;
    row.costUsd += call.source === "live" ? (call.estimatedCostUsd ?? 0) : 0;
    rows.set(key, row);
  }
  return [...rows.values()];
}

async function readEvals(paths: AppPaths): Promise<EvalSummary | null> {
  try {
    return JSON.parse(await readFile(join(paths.out, "evals", "report.json"), "utf8")) as EvalSummary;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Injectable } from "@nestjs/common";
import type { AppPaths } from "../../../libs/app-paths/app-paths";
import type { ModelUsage } from "../../../libs/model-client/contract/model.models";
import { BonusRunsService } from "../../bonus/application/services/bonus-runs.service";
import { PeriodRunsService } from "../../reconciliation/application/services/period-runs.service";
import { readEvalSummary, type EvalSummary } from "../eval-summary";

export interface ModelUseRow {
  task: string;
  model: string;
  calls: number;
  replayed: number;
  /** Average cost of one call at list prices, as recorded; replaying it costs nothing. */
  costPerCallUsd: number;
}

export interface HealthView {
  evals: EvalSummary | null;
  latestPeriod: string | null;
  modelUse: ModelUseRow[];
}

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

    return {
      evals: await readEvalSummary(paths.out),
      latestPeriod: latest,
      modelUse: groupCalls([...(period?.modelCalls ?? []), ...bonusCalls.flat()])
    };
  }
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

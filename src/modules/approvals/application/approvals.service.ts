import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { Injectable } from "@nestjs/common";
import { stringify as toYaml } from "yaml";
import type { AppPaths } from "../../../libs/app-paths/app-paths";
import type { BonusResult } from "../../bonus/application/services/bonus-verification.service";
import { BonusRunsService } from "../../bonus/application/services/bonus-runs.service";
import type { BonusRules } from "../../bonus/domain/bonus-rules";
import { loadBonusProgram } from "../../bonus/infrastructure/bonus-files";
import type { CsvFormat } from "../../extraction/domain/source-format";
import { PeriodRunsService } from "../../reconciliation/application/services/period-runs.service";
import type { PeriodResult } from "../../reconciliation/application/services/reconcile-period.service";
import { loadTenant } from "../../reconciliation/infrastructure/tenant-files";

/** Something a model proposed that changes config, waiting for a person. */
export type PendingApproval =
  | {
      id: string;
      kind: "layout";
      carrierName: string;
      period: string;
      /** True when the proposal reads every line of the new file and ties out to the cent. */
      verified: boolean;
      explanation: string;
      changes: { field: string; from: string; to: string }[];
    }
  | {
      id: string;
      kind: "bonus_rules";
      carrierName: string;
      programId: string;
      programYear: number;
      rules: BonusRules;
      /** Terms the rules cannot express, for the reviewer to read before approving. */
      notes: string[];
    };

export class ApprovalError extends Error {}

/**
 * Lists model proposals waiting for a person, and applies one when a person approves it.
 *
 * Approving writes the proposal into the tenant's config, which is what makes it take effect, and
 * appends who approved what and when to <tenant>/approvals.jsonl. Nothing a model proposes changes
 * config any other way.
 */
@Injectable()
export class ApprovalsService {
  constructor(
    private readonly periodRuns: PeriodRunsService,
    private readonly bonusRuns: BonusRunsService
  ) {}

  async pending(paths: AppPaths): Promise<PendingApproval[]> {
    return [...(await this.pendingLayouts(paths)), ...(await this.pendingBonusRules(paths))];
  }

  async approve(paths: AppPaths, id: string, approvedBy: string): Promise<{ file: string }> {
    const item = (await this.pending(paths)).find(entry => entry.id === id);
    if (!item) throw new ApprovalError(`Nothing is waiting for approval as "${id}".`);
    const approvedOn = new Date().toISOString();

    const written =
      item.kind === "layout"
        ? await this.applyLayout(paths, item, approvedBy, approvedOn)
        : await this.applyBonusRules(paths, item, approvedBy, approvedOn);
    const file = relative(process.cwd(), written);

    const entry = { approvedAt: approvedOn, approvedBy, kind: item.kind, id, file };
    await appendFile(join(paths.tenant, "approvals.jsonl"), `${JSON.stringify(entry)}\n`);
    return { file };
  }

  private async pendingLayouts(paths: AppPaths): Promise<PendingApproval[]> {
    const tenant = await loadTenant(paths.tenant);
    const pending: PendingApproval[] = [];

    for (const { period, hasRun } of await this.periodRuns.periods(paths)) {
      if (!hasRun) continue;
      const result = JSON.parse(await readFile(join(paths.out, period, "result.json"), "utf8")) as PeriodResult;
      for (const outcome of result.carriers) {
        if (outcome.status !== "format_drift" || outcome.proposal.status === "no_answer") continue;
        const proposed = outcome.proposal.format;
        const current = tenant.carriers.find(carrier => carrier.id === outcome.carrier.id)?.format;
        if (!proposed || current?.kind !== "csv" || current.version >= proposed.version) continue;

        pending.push({
          id: `layout:${period}:${outcome.carrier.id}`,
          kind: "layout",
          carrierName: outcome.carrier.name,
          period,
          verified: outcome.proposal.status === "verified",
          explanation: outcome.proposal.explanation,
          changes: columnChanges(current, proposed)
        });
      }
    }
    return pending;
  }

  private async pendingBonusRules(paths: AppPaths): Promise<PendingApproval[]> {
    const pending: PendingApproval[] = [];
    for (const program of await this.bonusRuns.programs(paths)) {
      if (!program.hasRun) continue;
      const saved = await readFile(join(paths.out, "bonus", program.id, "result.json"), "utf8");
      const { outcome } = JSON.parse(saved) as BonusResult;
      if (outcome.status !== "awaiting_approval" || outcome.draft.status !== "drafted") continue;

      const { approvedRules } = await loadBonusProgram(paths.tenant, program.id);
      if (approvedRules?.agreementSha256 === outcome.draft.rules.agreementSha256) continue;

      pending.push({
        id: `bonus:${program.id}`,
        kind: "bonus_rules",
        carrierName: program.carrierName,
        programId: program.id,
        programYear: program.programYear,
        rules: outcome.draft.rules,
        notes: outcome.draft.notes
      });
    }
    return pending;
  }

  private async applyLayout(
    paths: AppPaths,
    item: Extract<PendingApproval, { kind: "layout" }>,
    approvedBy: string,
    approvedOn: string
  ): Promise<string> {
    if (!item.verified) {
      throw new ApprovalError(
        "Only a proposal that reads every line and ties out can be approved. Edit the format by hand instead."
      );
    }
    const [, period = "", carrierId = ""] = item.id.split(":");
    const result = JSON.parse(await readFile(join(paths.out, period, "result.json"), "utf8")) as PeriodResult;
    const outcome = result.carriers.find(entry => entry.carrier.id === carrierId);
    if (outcome?.status !== "format_drift" || outcome.proposal.status !== "verified") {
      throw new ApprovalError(`The proposal for ${carrierId} is no longer available.`);
    }

    const format = outcome.proposal.format;
    const file = join(paths.tenant, "formats", `${format.id}.yaml`);
    const description = (await readFile(file, "utf8")).split("\n").filter(line => line.startsWith("#"));
    const header = [
      ...description,
      `# Version ${format.version} approved by ${approvedBy} on ${approvedOn.slice(0, 10)}: proposed by a model after`,
      "# the layout changed, and checked to read every line of the new file and tie out to the cent."
    ];
    await writeFile(file, `${header.join("\n")}\n${toYaml(format)}`);
    return file;
  }

  private async applyBonusRules(
    paths: AppPaths,
    item: Extract<PendingApproval, { kind: "bonus_rules" }>,
    approvedBy: string,
    approvedOn: string
  ): Promise<string> {
    const file = join(paths.tenant, "bonus", item.programId, "rules.yaml");
    const header = [
      `# Approved by ${approvedBy} on ${approvedOn.slice(0, 10)}, after checking each rule against the clause it cites.`,
      "# Drafted by a model from the agreement document; tied to that document by its SHA-256.",
      "# notes: terms the rules cannot express, as the model read them, kept with the approval."
    ];
    await writeFile(file, `${header.join("\n")}\n${toYaml({ ...item.rules, notes: item.notes })}`);
    return file;
  }
}

function columnChanges(current: CsvFormat, proposed: CsvFormat): { field: string; from: string; to: string }[] {
  const fields = Object.keys(current.columns) as (keyof CsvFormat["columns"])[];
  const changes: { field: string; from: string; to: string }[] = fields
    .filter(field => current.columns[field] !== proposed.columns[field])
    .map(field => ({ field, from: current.columns[field], to: proposed.columns[field] }));
  if (current.totalRow.amountColumn !== proposed.totalRow.amountColumn) {
    changes.push({ field: "total amount", from: current.totalRow.amountColumn, to: proposed.totalRow.amountColumn });
  }
  return changes;
}

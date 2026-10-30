import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Injectable } from "@nestjs/common";
import type { AppPaths, RunPaths } from "../../../../libs/app-paths/app-paths";
import { renderProposal } from "../../../extraction/application/services/format-proposal.service";
import { isPeriod } from "../../domain/dates";
import { loadPolicyBook } from "../../infrastructure/policy-book-file";
import { loadTenant, type Tenant } from "../../infrastructure/tenant-files";
import { renderCommissionDispute } from "../reports/dispute-letter";
import { renderAgencyPayouts, renderAllocationLines } from "../reports/payout-files";
import { renderRunReport } from "../reports/run-report";
import { toPeriodView, type PeriodView } from "../views/period-view";
import { ReconcilePeriodService, type PeriodResult } from "./reconcile-period.service";

export interface PeriodRun {
  result: PeriodResult;
  tenant: Tenant;
  outDirectory: string;
  /** Files written for a person to act on, by carrier: a proposed mapping, a draft dispute letter. */
  proposals: Record<string, string>;
  disputes: Record<string, string>;
}

/**
 * Runs a period and keeps its results as files, for the command line and the admin alike:
 *
 *   <out>/<period>/report.md, agency-payouts.csv, allocation-lines.csv, result.json
 *   <out>/<period>/proposals/<format id>.yaml    mappings for changed layouts, waiting for approval
 *   <out>/<period>/disputes/<carrier id>.md      draft letters for underpaying carriers
 */
@Injectable()
export class PeriodRunsService {
  constructor(private readonly reconcilePeriod: ReconcilePeriodService) {}

  async run(paths: RunPaths, period: string): Promise<PeriodRun> {
    const tenant = await loadTenant(paths.tenant);
    const result = await this.reconcilePeriod.reconcile({
      tenant,
      policies: await loadPolicyBook(join(paths.data, "book", "policies.csv")),
      inboxDirectory: join(paths.data, "inbox"),
      period
    });

    const outDirectory = join(paths.out, period);
    await mkdir(join(outDirectory, "proposals"), { recursive: true });
    await mkdir(join(outDirectory, "disputes"), { recursive: true });
    await writeFile(join(outDirectory, "report.md"), renderRunReport(result, tenant));
    await writeFile(join(outDirectory, "agency-payouts.csv"), renderAgencyPayouts(result));
    await writeFile(join(outDirectory, "allocation-lines.csv"), renderAllocationLines(result));
    await writeFile(join(outDirectory, "result.json"), `${JSON.stringify(result, null, 2)}\n`);

    const proposals: Record<string, string> = {};
    const disputes: Record<string, string> = {};
    for (const outcome of result.carriers) {
      if (outcome.status === "format_drift" && outcome.proposal.status !== "no_answer" && outcome.proposal.format) {
        const path = join(outDirectory, "proposals", `${outcome.proposal.format.id}.yaml`);
        const verified = outcome.proposal.status === "verified";
        await writeFile(path, renderProposal({ ...outcome.proposal, format: outcome.proposal.format }, verified));
        proposals[outcome.carrier.id] = path;
      }
      const letter = renderCommissionDispute(outcome, period, tenant.name, tenant.vocabulary);
      if (letter) {
        const path = join(outDirectory, "disputes", `${outcome.carrier.id}.md`);
        await writeFile(path, letter);
        disputes[outcome.carrier.id] = path;
      }
    }
    return { result, tenant, outDirectory, proposals, disputes };
  }

  /** The last run of a period as the admin shows it, or null if it has not been run. */
  async view(paths: AppPaths, period: string): Promise<PeriodView | null> {
    const file = join(paths.out, period, "result.json");
    const saved = await readIfPresent(file);
    if (saved === null) return null;
    const ranAt = (await stat(file)).mtime.toISOString();
    return toPeriodView(JSON.parse(saved) as PeriodResult, await loadTenant(paths.tenant), ranAt);
  }

  /** Periods with statements in the inbox, newest first, and whether each has been run. */
  async periods(paths: AppPaths): Promise<{ period: string; hasRun: boolean }[]> {
    const inbox = await readdir(join(paths.data, "inbox")).catch((): string[] => []);
    const periods = inbox.filter(isPeriod).sort().reverse();
    return Promise.all(
      periods.map(async period => ({
        period,
        hasRun: (await readIfPresent(join(paths.out, period, "result.json"))) !== null
      }))
    );
  }

  /** The draft dispute letter for a carrier, or null if there is none. */
  async disputeLetter(paths: AppPaths, period: string, carrierId: string): Promise<string | null> {
    const tenant = await loadTenant(paths.tenant);
    if (!tenant.carriers.some(carrier => carrier.id === carrierId)) return null;
    return readIfPresent(join(paths.out, period, "disputes", `${carrierId}.md`));
  }
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

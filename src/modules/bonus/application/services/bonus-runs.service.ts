import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Injectable } from "@nestjs/common";
import { loadTenant, type Tenant } from "../../../reconciliation/infrastructure/tenant-files";
import type { AppPaths, RunPaths } from "../../../../libs/app-paths/app-paths";
import { loadBonusProgram, loadProduction } from "../../infrastructure/bonus-files";
import { renderBonusDispute, renderBonusReport, renderBonusShares, type Names } from "../reports/bonus-report";
import { toBonusView, type BonusView } from "../views/bonus-view";
import { renderRulesProposal } from "./bonus-terms.service";
import { BonusVerificationService, type BonusResult } from "./bonus-verification.service";

export interface BonusRun {
  result: BonusResult;
  carrierName: string;
  outDirectory: string;
  written: string[];
}

/**
 * Verifies one bonus program year and keeps the results as files, for the command line and the
 * admin alike. Reads <data>/bonus/<program>/ (agreement.pdf, statement.csv, production.csv) and
 * writes <out>/bonus/<program>/ (report.md, result.json, and, when there is one, proposed-rules.yaml,
 * bonus-shares.csv and dispute-letter.md).
 */
@Injectable()
export class BonusRunsService {
  constructor(private readonly bonusVerification: BonusVerificationService) {}

  async run(paths: RunPaths, programId: string): Promise<BonusRun> {
    const tenant = await loadTenant(paths.tenant);
    const { program, approvedRules } = await loadBonusProgram(paths.tenant, await this.knownProgram(paths, programId));
    const names = namesFor(tenant, program.carrierId);

    const inputDirectory = join(paths.data, "bonus", program.id);
    const result = await this.bonusVerification.verify({
      program,
      approvedRules,
      products: [...new Set(tenant.rateRules.map(rule => rule.product))].sort(),
      agreement: { fileName: "agreement.pdf", data: await readFile(join(inputDirectory, "agreement.pdf")) },
      statementCsv: await readFile(join(inputDirectory, "statement.csv"), "utf8"),
      production: await loadProduction(join(inputDirectory, "production.csv"))
    });

    const outDirectory = join(paths.out, "bonus", program.id);
    await mkdir(outDirectory, { recursive: true });
    const written: string[] = [];
    const write = async (file: string, content: string) => {
      await writeFile(join(outDirectory, file), content);
      written.push(join(outDirectory, file));
    };

    await write("report.md", renderBonusReport(result, names));
    await write("result.json", `${JSON.stringify(result, null, 2)}\n`);
    const { outcome } = result;
    if (outcome.status === "awaiting_approval" && outcome.draft.status === "drafted") {
      await write("proposed-rules.yaml", renderRulesProposal(outcome.draft));
    }
    if (outcome.status === "checked") await write("bonus-shares.csv", renderBonusShares(result));
    const dispute = renderBonusDispute(result, names);
    if (dispute) await write("dispute-letter.md", dispute);

    return { result, carrierName: names.carrier, outDirectory, written };
  }

  /** The last run of a program as the admin shows it, or null if it has not been run. */
  async view(paths: AppPaths, programId: string): Promise<BonusView | null> {
    const saved = await this.result(paths, programId);
    if (saved === null) return null;
    const names = namesFor(await loadTenant(paths.tenant), saved.result.program.carrierId);
    const { approvedRules, approvedNotes } = await loadBonusProgram(paths.tenant, programId);
    const reading = approvedRules && { rules: approvedRules, notes: approvedNotes };
    return toBonusView(saved.result, names, saved.ranAt, reading);
  }

  /** The agreement document the rules were read from, or null if there is none. */
  async agreement(paths: AppPaths, programId: string): Promise<Buffer | null> {
    const file = join(paths.data, "bonus", await this.knownProgram(paths, programId), "agreement.pdf");
    try {
      return await readFile(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  /** The last run's result as written, or null if the program has not been run. */
  async result(paths: AppPaths, programId: string): Promise<{ result: BonusResult; ranAt: string } | null> {
    const file = join(paths.out, "bonus", await this.knownProgram(paths, programId), "result.json");
    const saved = await readIfPresent(file);
    if (saved === null) return null;
    return { result: JSON.parse(saved) as BonusResult, ranAt: (await stat(file)).mtime.toISOString() };
  }

  /** The tenant's bonus programs, and whether each has been run. */
  async programs(
    paths: AppPaths
  ): Promise<{ id: string; carrierName: string; programYear: number; hasRun: boolean }[]> {
    const tenant = await loadTenant(paths.tenant);
    const ids = (await readdir(join(paths.tenant, "bonus")).catch((): string[] => [])).sort();
    return Promise.all(
      ids.map(async id => {
        const { program } = await loadBonusProgram(paths.tenant, id);
        return {
          id,
          carrierName: namesFor(tenant, program.carrierId).carrier,
          programYear: program.programYear,
          hasRun: (await readIfPresent(join(paths.out, "bonus", id, "result.json"))) !== null
        };
      })
    );
  }

  /** The draft dispute letter for a program, or null if there is none. */
  async disputeLetter(paths: AppPaths, programId: string): Promise<string | null> {
    return readIfPresent(join(paths.out, "bonus", await this.knownProgram(paths, programId), "dispute-letter.md"));
  }

  /** Only a program configured for the tenant can be named, so a request cannot reach other files. */
  private async knownProgram(paths: RunPaths, programId: string): Promise<string> {
    const ids = await readdir(join(paths.tenant, "bonus")).catch((): string[] => []);
    if (!ids.includes(programId)) throw new UnknownProgramError(programId);
    return programId;
  }
}

export class UnknownProgramError extends Error {
  constructor(programId: string) {
    super(`No bonus program "${programId}" is configured.`);
  }
}

function namesFor(tenant: Tenant, carrierId: string): Names {
  const agencyNames = new Map(tenant.agencies.map(agency => [agency.agencyId, agency.name]));
  return {
    network: tenant.name,
    carrier: tenant.carriers.find(carrier => carrier.id === carrierId)?.name ?? carrierId,
    agency: agencyId => agencyNames.get(agencyId) ?? agencyId
  };
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

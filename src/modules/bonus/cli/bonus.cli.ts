import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Command, CommandRunner, Option } from "nest-commander";
import { formatMoney } from "../../reconciliation/domain/money";
import { loadTenant } from "../../reconciliation/infrastructure/tenant-files";
import { renderBonusDispute, renderBonusReport, renderBonusShares } from "../application/reports/bonus-report";
import { renderRulesProposal } from "../application/services/bonus-terms.service";
import { BonusVerificationService, type BonusResult } from "../application/services/bonus-verification.service";
import { loadBonusProgram, loadProduction } from "../infrastructure/bonus-files";

interface BonusOptions {
  program: string;
  tenant: string;
  data: string;
  out: string;
}

/**
 * `bonus`: verifies one program year's profit-sharing bonus.
 *
 * Reads <data>/bonus/<program>/: agreement.pdf, statement.csv (the carrier's) and production.csv
 * (the network's own records).
 */
@Command({ name: "bonus", description: "Verify a profit-sharing bonus against its agreement" })
export class BonusCli extends CommandRunner {
  constructor(private readonly bonusVerification: BonusVerificationService) {
    super();
  }

  async run(_arguments: string[], options: BonusOptions): Promise<void> {
    const tenant = await loadTenant(options.tenant);
    const { program, approvedRules } = await loadBonusProgram(options.tenant, options.program);
    const carrier = tenant.carriers.find(entry => entry.id === program.carrierId);
    if (!carrier)
      throw new Error(`Program ${program.id} names carrier "${program.carrierId}", which the tenant does not have`);

    const inputDirectory = join(options.data, "bonus", program.id);
    const result = await this.bonusVerification.verify({
      program,
      approvedRules,
      products: [...new Set(tenant.rateRules.map(rule => rule.product))].sort(),
      agreement: { fileName: "agreement.pdf", data: await readFile(join(inputDirectory, "agreement.pdf")) },
      statementCsv: await readFile(join(inputDirectory, "statement.csv"), "utf8"),
      production: await loadProduction(join(inputDirectory, "production.csv"))
    });

    const agencyNames = new Map(tenant.agencies.map(agency => [agency.agencyId, agency.name]));
    const names = {
      network: tenant.name,
      carrier: carrier.name,
      agency: (agencyId: string) => agencyNames.get(agencyId) ?? agencyId
    };

    const outDirectory = join(options.out, "bonus", program.id);
    await mkdir(outDirectory, { recursive: true });
    const write = async (file: string, content: string) => {
      await writeFile(join(outDirectory, file), content);
      console.log(`  wrote ${join(outDirectory, file)}`);
    };

    console.log(`\n${carrier.name}, profit sharing ${program.programYear}: ${summarize(result)}\n`);
    await write("report.md", renderBonusReport(result, names));
    await write("result.json", `${JSON.stringify(result, null, 2)}\n`);

    const { outcome } = result;
    if (outcome.status === "awaiting_approval" && outcome.draft.status === "drafted") {
      await write("proposed-rules.yaml", renderRulesProposal(outcome.draft));
    }
    if (outcome.status === "checked") await write("bonus-shares.csv", renderBonusShares(result));
    const dispute = renderBonusDispute(result, names);
    if (dispute) await write("dispute-letter.md", dispute);
    console.log("");
  }

  @Option({ flags: "--program <id>", description: "Bonus program to verify", defaultValue: "northwind-2025" })
  parseProgram(value: string): string {
    return value;
  }

  @Option({
    flags: "--tenant <directory>",
    description: "Tenant config directory",
    defaultValue: "tenants/agency-network"
  })
  parseTenant(value: string): string {
    return value;
  }

  @Option({ flags: "--data <directory>", description: "Where the bonus files are", defaultValue: "data/demo" })
  parseData(value: string): string {
    return value;
  }

  @Option({ flags: "--out <directory>", description: "Where to write the report", defaultValue: "out" })
  parseOut(value: string): string {
    return value;
  }
}

function summarize(result: BonusResult): string {
  const { outcome } = result;
  switch (outcome.status) {
    case "awaiting_approval":
      return `HELD, ${outcome.reason}`;
    case "statement_invalid":
      return `HELD, the statement could not be read (${outcome.problems.length} problem(s))`;
    case "checked": {
      const { check } = outcome;
      return (
        `${check.disposition.toUpperCase()}, paid ${formatMoney(check.paidCents)}, expected ` +
        `${formatMoney(check.expected.bonusCents)}, ${check.findings.length} finding(s)`
      );
    }
  }
}

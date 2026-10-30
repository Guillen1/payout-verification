import { Command, CommandRunner, Option } from "nest-commander";
import { formatMoney } from "../../reconciliation/domain/money";
import { BonusRunsService } from "../application/services/bonus-runs.service";
import type { BonusResult } from "../application/services/bonus-verification.service";

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
  constructor(private readonly bonusRuns: BonusRunsService) {
    super();
  }

  async run(_arguments: string[], options: BonusOptions): Promise<void> {
    const { result, carrierName, written } = await this.bonusRuns.run(
      { tenant: options.tenant, data: options.data, out: options.out },
      options.program
    );
    console.log(`\n${carrierName}, profit sharing ${result.program.programYear}: ${summarize(result)}\n`);
    for (const path of written) console.log(`  wrote ${path}`);
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

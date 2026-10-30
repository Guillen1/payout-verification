import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Command, CommandRunner, Option } from "nest-commander";
import { isPeriod } from "../../reconciliation/domain/dates";
import { renderPolicyBook } from "../../reconciliation/infrastructure/policy-book-file";
import { loadTenant } from "../../reconciliation/infrastructure/tenant-files";
import { loadBonusProgram } from "../../bonus/infrastructure/bonus-files";
import { generateBonusDemo } from "../synthetic/bonus-scenario";
import { generateDemoData } from "../synthetic/generate-demo";

interface SeedOptions {
  tenant: string;
  data: string;
  period: string;
  seed: number;
}

/** `seed`: writes a synthetic policy book, carrier statements, bonus files and their answer keys. */
@Command({ name: "seed", description: "Write one period of synthetic demo data" })
export class SeedCli extends CommandRunner {
  async run(_arguments: string[], options: SeedOptions): Promise<void> {
    const tenant = await loadTenant(options.tenant);
    const demo = await generateDemoData({ tenant, period: options.period, seed: options.seed });

    const write = async (path: string, content: string | Buffer) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
      console.log(`  wrote ${path}`);
    };

    console.log(`Seeding ${tenant.name} for ${options.period} (seed ${options.seed})`);
    await write(join(options.data, "book", "policies.csv"), renderPolicyBook(demo.policies));
    for (const statement of demo.statements) {
      await write(join(options.data, "inbox", options.period, statement.fileName), statement.content);
    }
    await write(join(options.data, "labels", `${options.period}.json`), `${JSON.stringify(demo.labels, null, 2)}\n`);

    for (const programId of await bonusProgramIds(options.tenant)) {
      const { program } = await loadBonusProgram(options.tenant, programId);
      const carrierName = tenant.carriers.find(carrier => carrier.id === program.carrierId)?.name ?? program.carrierId;
      const bonus = await generateBonusDemo({ tenant, program, carrierName, seed: options.seed });
      const directory = join(options.data, "bonus", programId);
      await write(join(directory, "agreement.pdf"), bonus.agreement);
      await write(join(directory, "statement.csv"), bonus.statement);
      await write(join(directory, "production.csv"), bonus.production);
      await write(
        join(options.data, "labels", `bonus-${programId}.json`),
        `${JSON.stringify(bonus.labels, null, 2)}\n`
      );
    }
  }

  @Option({ flags: "--period <period>", description: "Period to generate, like 2026-09", defaultValue: "2026-09" })
  parsePeriod(value: string): string {
    if (!isPeriod(value)) throw new Error(`--period must look like 2026-09, got "${value}"`);
    return value;
  }

  @Option({ flags: "--seed <number>", description: "Same seed, same data", defaultValue: 42 })
  parseSeed(value: string): number {
    return Number(value);
  }

  @Option({
    flags: "--tenant <directory>",
    description: "Tenant config directory",
    defaultValue: "tenants/agency-network"
  })
  parseTenant(value: string): string {
    return value;
  }

  @Option({ flags: "--data <directory>", description: "Where to write the data", defaultValue: "data/demo" })
  parseData(value: string): string {
    return value;
  }
}

/** The tenant's bonus programs, one directory each under bonus/. A tenant may have none. */
async function bonusProgramIds(tenantDirectory: string): Promise<string[]> {
  return (await readdir(join(tenantDirectory, "bonus")).catch((): string[] => [])).sort();
}

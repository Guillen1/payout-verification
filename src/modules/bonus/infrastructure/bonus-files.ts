import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { moneyField, parseCsvRecords } from "../../reconciliation/infrastructure/csv-records";
import { BonusProgramSchema, type BonusProgram } from "../domain/bonus-program";
import { BonusRulesSchema, type BonusRules } from "../domain/bonus-rules";
import type { ProductionRow } from "../domain/compute-bonus";

/**
 * Loads a bonus program from <tenant>/bonus/<program id>/:
 *
 *   program.yaml   the network's side: carrier, year, network share, producer codes, statement layout
 *   rules.yaml     the approved rules from the agreement; absent until a person approves a draft
 */
export async function loadBonusProgram(
  tenantDirectory: string,
  programId: string
): Promise<{ program: BonusProgram; approvedRules: BonusRules | null }> {
  const directory = join(tenantDirectory, "bonus", programId);
  const program = BonusProgramSchema.parse(parseYaml(await readFile(join(directory, "program.yaml"), "utf8")));
  if (program.id !== programId) throw new Error(`${directory}/program.yaml describes program "${program.id}"`);

  const rulesText = await readIfPresent(join(directory, "rules.yaml"));
  const approvedRules = rulesText === null ? null : BonusRulesSchema.parse(parseYaml(rulesText));
  if (approvedRules && approvedRules.programId !== programId) {
    throw new Error(`${directory}/rules.yaml describes program "${approvedRules.programId}"`);
  }
  return { program, approvedRules };
}

const ProductionRecord = z
  .object({ agency_id: z.string().min(1), product: z.string().min(1), written_premium: moneyField })
  .transform((row): ProductionRow => ({
    agencyId: row.agency_id,
    product: row.product,
    writtenPremiumCents: row.written_premium
  }));

/** The network's production report: written premium by agency and product for the program year. */
export async function loadProduction(path: string): Promise<ProductionRow[]> {
  return parseProduction(await readFile(path, "utf8"), path);
}

export function parseProduction(content: string, source: string): ProductionRow[] {
  return parseCsvRecords(content, ProductionRecord, source);
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

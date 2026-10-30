import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { RateRule, SplitRule } from "../domain/types";
import { VocabularySchema, type Vocabulary } from "../domain/vocabulary";
import { SourceFormatSchema, type SourceFormat } from "../../extraction/domain/source-format";
import { parseCsvRecords } from "./csv-records";

export interface Agency {
  agencyId: string;
  name: string;
  state: string;
}

export interface CarrierConfig {
  id: string;
  name: string;
  format: SourceFormat;
}

/** Everything that describes one tenant: who they work with and the rules money follows. */
export interface Tenant {
  id: string;
  name: string;
  lineToleranceCents: number;
  vocabulary: Vocabulary;
  carriers: CarrierConfig[];
  agencies: Agency[];
  rateRules: RateRule[];
  splitRules: SplitRule[];
}

const TenantFileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lineToleranceCents: z.number().int().nonnegative(),
  vocabulary: VocabularySchema.default(VocabularySchema.parse({})),
  carriers: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), format: z.string().min(1) })).min(1)
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const optionalIsoDate = z.union([isoDate, z.literal("").transform(() => null)]);
const basisPoints = z.coerce.number().int().min(0).max(10_000);

const AgencyRow = z
  .object({ agency_id: z.string().min(1), name: z.string().min(1), state: z.string().length(2) })
  .transform(row => ({ agencyId: row.agency_id, name: row.name, state: row.state }));

const RateRow = z
  .object({
    carrier_id: z.string().min(1),
    product: z.string().min(1),
    term: z.enum(["new", "renewal"]),
    rate_bps: basisPoints,
    effective_from: isoDate,
    effective_to: optionalIsoDate
  })
  .transform((row): RateRule => ({
    carrierId: row.carrier_id,
    product: row.product,
    term: row.term,
    rateBps: row.rate_bps,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to
  }));

const SplitRow = z
  .object({
    agency_id: z.string().min(1),
    product: z.string().min(1),
    agency_share_bps: basisPoints,
    effective_from: isoDate,
    effective_to: optionalIsoDate
  })
  .transform((row): SplitRule => ({
    agencyId: row.agency_id,
    product: row.product,
    agencyShareBps: row.agency_share_bps,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to
  }));

/**
 * Loads a tenant directory:
 *
 *   tenant.yaml        carriers, settings and the tenant's words for things
 *   agencies.csv       agencies in the network
 *   rates.csv          effective-dated commission rates by carrier, product and term
 *   splits.csv         effective-dated agency shares
 *   formats/*.yaml     one statement format per carrier
 *
 * Everything is validated on load, so a typo in config fails here with its file and row,
 * not later as a wrong number in a payout.
 */
export async function loadTenant(directory: string): Promise<Tenant> {
  const read = (file: string) => readFile(join(directory, file), "utf8");

  const settings = TenantFileSchema.parse(parseYaml(await read("tenant.yaml")));
  const carriers = await Promise.all(
    settings.carriers.map(async carrier => ({
      id: carrier.id,
      name: carrier.name,
      format: await loadFormat(join(directory, "formats", `${carrier.format}.yaml`), carrier.id)
    }))
  );

  return {
    id: settings.id,
    name: settings.name,
    lineToleranceCents: settings.lineToleranceCents,
    vocabulary: settings.vocabulary,
    carriers,
    agencies: parseCsvRecords(await read("agencies.csv"), AgencyRow, "agencies.csv"),
    rateRules: parseCsvRecords(await read("rates.csv"), RateRow, "rates.csv"),
    splitRules: parseCsvRecords(await read("splits.csv"), SplitRow, "splits.csv")
  };
}

async function loadFormat(path: string, carrierId: string): Promise<SourceFormat> {
  const format = SourceFormatSchema.parse(parseYaml(await readFile(path, "utf8")));
  if (format.carrierId !== carrierId) {
    throw new Error(`${path} describes carrier "${format.carrierId}" but is configured for "${carrierId}"`);
  }
  return format;
}

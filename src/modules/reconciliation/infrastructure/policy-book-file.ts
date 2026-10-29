import { readFile } from "node:fs/promises";
import { stringify } from "csv-stringify/sync";
import { z } from "zod";
import { formatMoneyPlain } from "../domain/money";
import type { Policy } from "../domain/types";
import { moneyField, parseCsvRecords } from "./csv-records";

/**
 * The system of record, read from an agency management system export. The demo reads a CSV
 * written by the synthetic generator; a production adapter reads the real export.
 */
const PolicyRow = z
  .object({
    policy_number: z.string().min(1),
    carrier_id: z.string().min(1),
    agency_id: z.string().min(1),
    product: z.string().min(1),
    term: z.enum(["new", "renewal"]),
    insured_name: z.string().min(1),
    effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    premium: moneyField
  })
  .transform((row): Policy => ({
    policyNumber: row.policy_number,
    carrierId: row.carrier_id,
    agencyId: row.agency_id,
    product: row.product,
    term: row.term,
    insuredName: row.insured_name,
    effectiveDate: row.effective_date,
    premiumCents: row.premium
  }));

export async function loadPolicyBook(path: string): Promise<Policy[]> {
  return parseCsvRecords(await readFile(path, "utf8"), PolicyRow, path);
}

export function renderPolicyBook(policies: readonly Policy[]): string {
  return stringify(
    policies.map(policy => ({
      policy_number: policy.policyNumber,
      carrier_id: policy.carrierId,
      agency_id: policy.agencyId,
      product: policy.product,
      term: policy.term,
      insured_name: policy.insuredName,
      effective_date: policy.effectiveDate,
      premium: formatMoneyPlain(policy.premiumCents)
    })),
    { header: true }
  );
}

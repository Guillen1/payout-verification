import { z } from "zod";

const clause = z.string().min(1);
const cents = z.number().int().nonnegative();

const LossRatioBandSchema = z.object({
  /** The band applies to a loss ratio at or below this. */
  upToLossRatioBps: z.number().int().positive(),
  rateBps: z.number().int().min(0).max(10_000)
});

/**
 * The terms of one carrier's profit-sharing agreement, as rules code can apply.
 *
 * A model drafts them from the agreement document and a person approves them, once per document.
 * Every rule names the clause it comes from, so every number in a bonus report traces back to the
 * contract.
 */
export const BonusRulesSchema = z.object({
  programId: z.string().min(1),
  carrierId: z.string().min(1),
  programYear: z.number().int(),
  /** The document these rules were read from. A different document needs a new approval. */
  agreementSha256: z.string().regex(/^[0-9a-f]{64}$/),
  eligibleProducts: z.object({ products: z.array(z.string().min(1)).min(1), clause }),
  minimumPremium: z.object({ cents, clause }),
  /** In increasing order. A loss ratio above the last band earns nothing. */
  lossRatioBands: z.object({
    bands: z
      .array(LossRatioBandSchema)
      .min(1)
      .refine(
        bands =>
          bands.every((band, index) => index === 0 || band.upToLossRatioBps > bands[index - 1]!.upToLossRatioBps),
        "Loss ratio bands must be in increasing order"
      ),
    clause
  }),
  maximumBonus: z.object({ cents, clause }).nullable()
});

export type BonusRules = z.infer<typeof BonusRulesSchema>;

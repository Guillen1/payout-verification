import { z } from "zod";

/**
 * How the network runs one carrier's profit-sharing program: the network's own side of it, not
 * the carrier's terms (those are the bonus rules, read from the agreement).
 */
export const BonusProgramSchema = z.object({
  id: z.string().min(1),
  carrierId: z.string().min(1),
  programYear: z.number().int(),
  /** The share of a bonus the network keeps. The rest goes to agencies by eligible premium. */
  networkShareBps: z.number().int().min(0).max(10_000),
  /** Differences up to this amount are treated as rounding, not findings. */
  toleranceCents: z.number().int().nonnegative(),
  /** The carrier's producer code for each agency in the network. */
  producerCodes: z.record(z.string(), z.string()),
  /** Column and row names in the carrier's bonus statement. */
  statement: z.object({
    columns: z.object({
      producerCode: z.string(),
      writtenPremium: z.string(),
      earnedPremium: z.string(),
      incurredLosses: z.string()
    }),
    totalLabel: z.string(),
    lossRatioLabel: z.string(),
    bonusRateLabel: z.string(),
    bonusPaidLabel: z.string()
  })
});

export type BonusProgram = z.infer<typeof BonusProgramSchema>;

import type { BonusProgram } from "../../domain/bonus-program";
import type { BonusRules } from "../../domain/bonus-rules";

/** Bands: 4% up to 40%, 3% up to 50%, 1.5% up to 60%. Minimum $500,000, maximum $60,000. */
export function rules(overrides: Partial<BonusRules> = {}): BonusRules {
  return {
    programId: "test-2025",
    carrierId: "northwind",
    programYear: 2025,
    agreementSha256: "0".repeat(64),
    eligibleProducts: { products: ["auto", "home"], clause: "3.2" },
    minimumPremium: { cents: 50_000_000, clause: "4.1" },
    lossRatioBands: {
      bands: [
        { upToLossRatioBps: 4_000, rateBps: 400 },
        { upToLossRatioBps: 5_000, rateBps: 300 },
        { upToLossRatioBps: 6_000, rateBps: 150 }
      ],
      clause: "5.1"
    },
    maximumBonus: { cents: 6_000_000, clause: "5.3" },
    ...overrides
  };
}

export function program(overrides: Partial<BonusProgram> = {}): BonusProgram {
  return {
    id: "test-2025",
    carrierId: "northwind",
    programYear: 2025,
    networkShareBps: 2_000,
    toleranceCents: 100,
    producerCodes: { "NW-1": "ag-1", "NW-2": "ag-2" },
    statement: {
      columns: {
        producerCode: "Producer Code",
        writtenPremium: "Written Premium",
        earnedPremium: "Earned Premium",
        incurredLosses: "Incurred Losses"
      },
      totalLabel: "Total",
      lossRatioLabel: "Loss Ratio",
      bonusRateLabel: "Bonus Rate",
      bonusPaidLabel: "Bonus Payable"
    },
    ...overrides
  };
}

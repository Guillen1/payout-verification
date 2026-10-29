import { createHash } from "node:crypto";
import { en, Faker } from "@faker-js/faker";
import { stringify } from "csv-stringify/sync";
import type { AgreementTerms } from "../../bonus/application/services/bonus-terms.service";
import type { BonusProgram } from "../../bonus/domain/bonus-program";
import type { BonusRules } from "../../bonus/domain/bonus-rules";
import type { BonusFinding } from "../../bonus/domain/check-bonus";
import type { Cents } from "../../reconciliation/domain/money";
import type { Tenant } from "../../reconciliation/infrastructure/tenant-files";
import { renderAgreement } from "./agreement-pdf";
import { commissionAt } from "./commission";

/** Written premium ranges in whole dollars for one agency's year, by product. */
const ANNUAL_PREMIUM: Record<string, [number, number]> = {
  auto: [60_000, 220_000],
  home: [40_000, 160_000],
  umbrella: [3_000, 12_000]
};
const ELIGIBLE = ["auto", "home"];

/** The answer key for one bonus program year. */
export interface BonusLabels {
  programId: string;
  /** Exactly what a perfect reader would report from the agreement, apart from the notes. */
  terms: AgreementTerms;
  /** The rules a reviewer should approve. */
  rules: BonusRules;
  expectedBonusCents: Cents;
  paidCents: Cents;
  findings: BonusFinding["kind"][];
}

export interface BonusDemo {
  agreement: Buffer;
  statement: string;
  production: string;
  labels: BonusLabels;
}

/**
 * One program year of bonus data, with two planted errors in the carrier's statement:
 *
 * - One agency's premium is left out entirely, as happens when a producer code is mapped wrong.
 * - The loss ratio lands exactly on a band boundary, and the carrier applies the next band's lower
 *   rate, reading "up to and including" as "below".
 *
 * The math here is written separately from the bonus module, so the module is checked against
 * numbers it did not produce.
 */
export async function generateBonusDemo(input: {
  tenant: Tenant;
  program: BonusProgram;
  carrierName: string;
  seed: number;
}): Promise<BonusDemo> {
  const { tenant, program } = input;
  const faker = new Faker({ locale: [en] });
  faker.seed(input.seed);

  const boundaries = faker.helpers.arrayElement([
    [4_000, 5_000, 6_000],
    [4_500, 5_500, 6_500],
    [3_500, 5_000, 6_500]
  ]);
  const rates = faker.helpers.arrayElement([
    [400, 300, 150],
    [500, 350, 200],
    [350, 250, 100]
  ]);
  const bands = boundaries.map((upToLossRatioBps, index) => ({ upToLossRatioBps, rateBps: rates[index]! }));
  const minimumPremiumCents = faker.helpers.arrayElement([400_000, 500_000, 750_000]) * 100;
  const maximumBonusCents = faker.helpers.arrayElement([150_000, 200_000]) * 100;

  const production = tenant.agencies.flatMap(agency =>
    Object.entries(ANNUAL_PREMIUM).map(([product, [low, high]]) => ({
      agencyId: agency.agencyId,
      product,
      writtenPremiumCents: faker.number.int({ min: low * 100, max: high * 100 })
    }))
  );
  const eligibleByAgency = new Map<string, Cents>();
  for (const row of production.filter(entry => ELIGIBLE.includes(entry.product))) {
    eligibleByAgency.set(row.agencyId, (eligibleByAgency.get(row.agencyId) ?? 0) + row.writtenPremiumCents);
  }

  // The carrier's statement: every agency but one, with earned premium a little under written.
  const codeOf = new Map(Object.entries(program.producerCodes).map(([code, agencyId]) => [agencyId, code]));
  const omittedAgencyId = faker.helpers.arrayElement(tenant.agencies).agencyId;
  const lines = tenant.agencies
    .filter(agency => agency.agencyId !== omittedAgencyId)
    .map(agency => {
      const written = eligibleByAgency.get(agency.agencyId)!;
      return {
        code: codeOf.get(agency.agencyId)!,
        name: agency.name,
        written,
        earned: Math.round((written * faker.number.int({ min: 8_800, max: 9_700 })) / 10_000),
        incurred: 0
      };
    });

  // Losses chosen so the loss ratio lands exactly on the middle band's upper boundary.
  const boundary = bands[1]!;
  const earnedTotal = sum(lines.map(line => line.earned));
  const incurredTotal = Math.round((earnedTotal * boundary.upToLossRatioBps) / 10_000);
  const weights = lines.map(line => line.earned * faker.number.int({ min: 40, max: 160 }));
  const weightTotal = sum(weights);
  lines.forEach((line, index) => (line.incurred = Math.floor((incurredTotal * weights[index]!) / weightTotal)));
  lines[lines.length - 1]!.incurred += incurredTotal - sum(lines.map(line => line.incurred));

  const writtenTotal = sum(lines.map(line => line.written));
  const appliedRate = bands[2]!.rateBps; // the planted error: the next band's rate
  const paidCents = Math.min(commissionAt(writtenTotal, appliedRate), maximumBonusCents);
  const eligibleTotal = sum([...eligibleByAgency.values()]);
  const expectedBonusCents =
    eligibleTotal >= minimumPremiumCents
      ? Math.min(commissionAt(eligibleTotal, boundary.rateBps), maximumBonusCents)
      : 0;

  const money = (cents: Cents) =>
    (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const percent = (bps: number) => `${(bps / 100).toFixed(2)}%`;
  const statement = stringify([
    ["Producer Code", "Producer Name", "Eligible Written Premium", "Earned Premium", "Incurred Losses"],
    ...lines.map(line => [line.code, line.name, money(line.written), money(line.earned), money(line.incurred)]),
    ["Total", "", money(writtenTotal), money(earnedTotal), money(incurredTotal)],
    ["Loss Ratio", percent(boundary.upToLossRatioBps)],
    ["Bonus Rate", percent(appliedRate)],
    ["Bonus Payable", money(paidCents)]
  ]);

  const agreement = await renderAgreement({
    carrierName: input.carrierName,
    networkName: tenant.name,
    programYear: program.programYear,
    minimumPremiumCents,
    bands,
    maximumBonusCents
  });

  const plain = (cents: Cents) => (cents / 100).toFixed(2);
  return {
    agreement,
    statement,
    production: stringify([
      ["agency_id", "product", "written_premium"],
      ...production.map(row => [row.agencyId, row.product, plain(row.writtenPremiumCents)])
    ]),
    labels: {
      programId: program.id,
      terms: {
        programYear: program.programYear,
        eligibleProducts: { products: ELIGIBLE, clause: "3.2" },
        minimumPremium: { amount: plain(minimumPremiumCents), clause: "4.1" },
        lossRatioBands: {
          bands: bands.map(band => ({
            lossRatioUpTo: percent(band.upToLossRatioBps),
            bonusRate: percent(band.rateBps)
          })),
          clause: "5.1"
        },
        maximumBonus: { amount: plain(maximumBonusCents), clause: "5.3" },
        notes: ["No bonus is payable if the agency agreement is terminated before the payment date (6.3)."]
      },
      rules: {
        programId: program.id,
        carrierId: program.carrierId,
        programYear: program.programYear,
        agreementSha256: createHash("sha256").update(agreement).digest("hex"),
        eligibleProducts: { products: ELIGIBLE, clause: "3.2" },
        minimumPremium: { cents: minimumPremiumCents, clause: "4.1" },
        lossRatioBands: { bands, clause: "5.1" },
        maximumBonus: { cents: maximumBonusCents, clause: "5.3" }
      },
      expectedBonusCents,
      paidCents,
      findings: ["premium_difference", "rate_differs"]
    }
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

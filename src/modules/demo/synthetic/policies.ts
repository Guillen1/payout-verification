import { en, Faker } from "@faker-js/faker";
import { toIsoDate, type Period } from "../../reconciliation/domain/dates";
import type { Policy, PolicyTerm, Product } from "../../reconciliation/domain/types";

/** Premium ranges in whole dollars, by product. */
const PREMIUM_RANGES: Record<Product, [number, number]> = {
  auto: [900, 2_600],
  home: [1_200, 4_200],
  umbrella: [250, 600]
};

/**
 * Makes invented policies with a seeded Faker, so the same seed always produces the same book.
 * Policy numbers and insured names are never repeated.
 */
export function createPolicyMaker(seed: number, agencyIds: readonly string[]) {
  const faker = new Faker({ locale: [en] });
  faker.seed(seed);
  const usedNumbers = new Set<string>();
  const usedNames = new Set<string>();

  const unique = (used: Set<string>, make: () => string): string => {
    for (;;) {
      const value = make();
      if (!used.has(value)) {
        used.add(value);
        return value;
      }
    }
  };

  return function makePolicy(
    carrierId: string,
    numberPrefix: string,
    period: Period,
    overrides: Partial<Pick<Policy, "product" | "term">> = {}
  ): Policy {
    const product: Product =
      overrides.product ??
      faker.helpers.weightedArrayElement([
        { weight: 55, value: "auto" },
        { weight: 35, value: "home" },
        { weight: 10, value: "umbrella" }
      ]);
    const term: PolicyTerm = overrides.term ?? (faker.datatype.boolean({ probability: 0.6 }) ? "renewal" : "new");
    const [minimum, maximum] = PREMIUM_RANGES[product] ?? [500, 1_500];
    const [year, month] = period.split("-").map(Number) as [number, number];
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    return {
      policyNumber: unique(usedNumbers, () => `${numberPrefix}${faker.string.numeric(6)}`),
      carrierId,
      agencyId: faker.helpers.arrayElement(agencyIds),
      product,
      term,
      insuredName: unique(usedNames, () => `${faker.person.firstName()} ${faker.person.lastName()}`),
      effectiveDate: toIsoDate(year, month, faker.number.int({ min: 1, max: daysInMonth })),
      premiumCents: faker.number.int({ min: minimum * 100, max: maximum * 100 })
    };
  };
}

export type PolicyMaker = ReturnType<typeof createPolicyMaker>;

export function previousPeriod(period: Period): Period {
  const [year, month] = period.split("-").map(Number) as [number, number];
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

export function times<T>(count: number, make: () => T): T[] {
  return Array.from({ length: count }, make);
}

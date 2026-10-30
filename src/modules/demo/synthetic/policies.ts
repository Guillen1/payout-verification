import { en, Faker } from "@faker-js/faker";
import { toIsoDate, type Period } from "../../reconciliation/domain/dates";
import type { Policy, PolicyTerm, Product } from "../../reconciliation/domain/types";

/** What a tenant's records look like: which products, what amounts, and how names read. */
export interface RecordProfile {
  /** Products and how often each appears. */
  products: { weight: number; value: Product }[];
  /** Amount ranges in whole dollars, by product. */
  amountRanges: Record<Product, [number, number]>;
  name: (faker: Faker) => string;
  /** The partner a record belongs to; by default one picked at random. */
  partnerFor?: (product: Product) => string;
}

/** An agency network's policies: personal auto, home and umbrella, insured people. */
export const POLICY_PROFILE: RecordProfile = {
  products: [
    { weight: 55, value: "auto" },
    { weight: 35, value: "home" },
    { weight: 10, value: "umbrella" }
  ],
  amountRanges: { auto: [900, 2_600], home: [1_200, 4_200], umbrella: [250, 600] },
  name: faker => `${faker.person.firstName()} ${faker.person.lastName()}`
};

/**
 * A beauty brand group's invoices to retail stores. Each brand sells one category; a "new" term is
 * a new item's first order and a "renewal" a reorder, which carry different trade terms.
 */
export const INVOICE_PROFILE: RecordProfile = {
  products: [
    { weight: 40, value: "lash" },
    { weight: 35, value: "hair" },
    { weight: 25, value: "skin" }
  ],
  amountRanges: { lash: [1_500, 9_000], hair: [2_000, 12_000], skin: [1_000, 7_000] },
  name: faker => `${faker.location.city()} #${faker.string.numeric(4)}`,
  partnerFor: product => `br-${product}`
};

/**
 * Makes invented records with a seeded Faker, so the same seed always produces the same book.
 * Numbers and names are never repeated.
 */
export function createPolicyMaker(seed: number, agencyIds: readonly string[], profile: RecordProfile = POLICY_PROFILE) {
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
    const product: Product = overrides.product ?? faker.helpers.weightedArrayElement(profile.products);
    const term: PolicyTerm = overrides.term ?? (faker.datatype.boolean({ probability: 0.6 }) ? "renewal" : "new");
    const [minimum, maximum] = profile.amountRanges[product] ?? [500, 1_500];
    const [year, month] = period.split("-").map(Number) as [number, number];
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    return {
      policyNumber: unique(usedNumbers, () => `${numberPrefix}${faker.string.numeric(6)}`),
      carrierId,
      agencyId: profile.partnerFor?.(product) ?? faker.helpers.arrayElement(agencyIds),
      product,
      term,
      insuredName: unique(usedNames, () => profile.name(faker)),
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

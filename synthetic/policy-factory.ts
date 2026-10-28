import { toIsoDate, type Period } from "../src/domain/dates";
import type { Policy, PolicyTerm, Product } from "../src/domain/types";
import type { NamePool } from "./people";
import type { SeededRandom } from "./random";

/** Premium ranges in whole dollars, by product. */
const PREMIUM_RANGES: Record<Product, [number, number]> = {
  auto: [900, 2_600],
  home: [1_200, 4_200],
  umbrella: [250, 600]
};

export interface PolicyFactoryOptions {
  random: SeededRandom;
  names: NamePool;
  agencyIds: readonly string[];
}

/** Makes realistic-looking invented policies. Attributes not given are chosen at random. */
export class PolicyFactory {
  private readonly usedNumbers = new Set<string>();

  constructor(private readonly options: PolicyFactoryOptions) {}

  make(
    carrierId: string,
    numberPrefix: string,
    period: Period,
    overrides: Partial<Pick<Policy, "product" | "term">> = {}
  ): Policy {
    const { random, names, agencyIds } = this.options;
    const product = overrides.product ?? random.weighted<Product>({ auto: 55, home: 35, umbrella: 10 });
    const term: PolicyTerm = overrides.term ?? (random.next() < 0.6 ? "renewal" : "new");
    const [minimum, maximum] = PREMIUM_RANGES[product] ?? [500, 1_500];
    const { first, last } = names.next();

    return {
      policyNumber: this.uniqueNumber(numberPrefix),
      carrierId,
      agencyId: random.pick(agencyIds),
      product,
      term,
      insuredName: `${first} ${last}`,
      effectiveDate: randomDateIn(random, period),
      premiumCents: random.int(minimum * 100, maximum * 100)
    };
  }

  private uniqueNumber(prefix: string): string {
    for (;;) {
      const number = `${prefix}${this.options.random.int(0, 999_999).toString().padStart(6, "0")}`;
      if (!this.usedNumbers.has(number)) {
        this.usedNumbers.add(number);
        return number;
      }
    }
  }
}

function randomDateIn(random: SeededRandom, period: Period): string {
  const [year, month] = period.split("-").map(Number) as [number, number];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return toIsoDate(year, month, random.int(1, daysInMonth));
}

export function previousPeriod(period: Period): Period {
  const [year, month] = period.split("-").map(Number) as [number, number];
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

export function times<T>(count: number, make: () => T): T[] {
  return Array.from({ length: count }, make);
}

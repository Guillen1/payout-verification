import type { IsoDate } from "./dates";

/**
 * A rule that applies for a span of dates. Rates and agency splits change over time, and a line
 * must be judged by the rule that was in effect on the policy's effective date, not today's.
 */
export interface EffectiveDated {
  effectiveFrom: IsoDate;
  /** Last day the rule applies, inclusive. Null means open-ended. */
  effectiveTo: IsoDate | null;
}

export type RuleLookup<T> = { status: "found"; rule: T } | { status: "none" } | { status: "conflict"; rules: T[] };

export function isEffectiveOn(rule: EffectiveDated, date: IsoDate): boolean {
  return rule.effectiveFrom <= date && (rule.effectiveTo === null || date <= rule.effectiveTo);
}

/**
 * Finds the one rule in effect on a date among those that apply. Two overlapping rules are a
 * configuration error, so the lookup reports a conflict instead of silently picking one.
 */
export function findEffectiveRule<T extends EffectiveDated>(
  rules: readonly T[],
  date: IsoDate,
  applies: (rule: T) => boolean
): RuleLookup<T> {
  const inEffect = rules.filter(rule => applies(rule) && isEffectiveOn(rule, date));
  const [only] = inEffect;
  if (only === undefined) return { status: "none" };
  if (inEffect.length > 1) return { status: "conflict", rules: inEffect };
  return { status: "found", rule: only };
}

import { findEffectiveRule } from "./effective-dated";
import type { LineResult } from "./line-result";
import { applyRate, formatMoney, formatRate, type Cents } from "./money";
import type { MatchMethod, MatchResult } from "./policy-index";
import type { Policy, RateRule, SplitRule, StatementLine } from "./types";
import { capitalized, DEFAULT_VOCABULARY, type Vocabulary } from "./vocabulary";

export interface ClassificationRules {
  rateRules: readonly RateRule[];
  splitRules: readonly SplitRule[];
  /** Per-line difference accepted as carrier rounding. */
  lineToleranceCents: Cents;
  /** The tenant's words for explanations; the agency network's by default. */
  words?: Vocabulary;
}

export interface LineToClassify {
  carrierId: string;
  line: StatementLine;
  match: MatchResult;
  isDuplicate: boolean;
}

/**
 * Decides what one statement line is and what happens to its money.
 *
 * The checks run from "we cannot trust this line at all" to "the amount is off". The first one
 * that applies decides the outcome, so every line gets exactly one finding.
 */
export function classifyLine(input: LineToClassify, rules: ClassificationRules): LineResult {
  const { line, match } = input;
  const words = rules.words ?? DEFAULT_VOCABULARY;
  const unresolved: LineResult = {
    line,
    finding: "ok",
    disposition: "clear",
    explanation: "",
    policy: null,
    matchMethod: null,
    expectedCents: null,
    varianceCents: null,
    agencySplit: null
  };

  if (input.isDuplicate) {
    return {
      ...unresolved,
      finding: "duplicate",
      disposition: "review",
      explanation: `Same ${words.item}, transaction and amounts as an earlier line on this statement.`
    };
  }

  if (match.status === "ambiguous") {
    const numbers = match.candidates.map(policy => policy.policyNumber).join(", ");
    return {
      ...unresolved,
      finding: "ambiguous_match",
      disposition: "review",
      explanation: `Matches ${match.candidates.length} ${words.items} by ${describeMethod(match.method, words)}: ${numbers}.`
    };
  }

  if (match.status === "unmatched") {
    return {
      ...unresolved,
      finding: "unmatched",
      disposition: "review",
      explanation: `No ${words.item} in the book has this ${words.item} number, or this ${words.customer} and ${words.date}.`
    };
  }

  const { policy } = match;
  const matched: LineResult = { ...unresolved, policy, matchMethod: match.method };

  const rate = findRateRule(rules.rateRules, input.carrierId, policy);
  if (rate === null) {
    return {
      ...matched,
      finding: "no_rate_rule",
      disposition: "review",
      explanation: `No single rate rule for ${input.carrierId} ${policy.product} ${policy.term} on ${policy.effectiveDate}.`
    };
  }

  const split = findSplitRule(rules.splitRules, policy);
  if (split === null) {
    return {
      ...matched,
      finding: "no_split_rule",
      disposition: "review",
      explanation: `No single split rule for ${words.partner} ${policy.agencyId} ${policy.product} on ${policy.effectiveDate}.`
    };
  }

  const priced: LineResult = { ...matched, agencySplit: split };
  const tolerance = rules.lineToleranceCents;

  if (line.transactionType === "cancellation") {
    const expected = applyRate(line.premiumCents, rate.rateBps);
    const variance = line.commissionCents - expected;
    if (Math.abs(variance) <= tolerance) {
      return {
        ...priced,
        finding: "chargeback",
        disposition: "clear",
        expectedCents: expected,
        varianceCents: variance,
        explanation: `${capitalized(words.reversal)} at ${formatRate(rate.rateBps)}.`
      };
    }
    return {
      ...priced,
      finding: "rate_variance",
      disposition: "dispute",
      expectedCents: expected,
      varianceCents: variance,
      explanation: describeRateGap(line, rate, expected)
    };
  }

  const premiumGap = line.premiumCents - policy.premiumCents;
  if (Math.abs(premiumGap) > tolerance) {
    const expected = applyRate(policy.premiumCents, rate.rateBps);
    return {
      ...priced,
      finding: "premium_variance",
      disposition: "review",
      expectedCents: expected,
      varianceCents: line.commissionCents - expected,
      explanation:
        `${capitalized(words.counterparty)} reports ${words.amount} ${formatMoney(line.premiumCents)} but the book has ` +
        `${formatMoney(policy.premiumCents)}. Either the book or the ${words.counterparty} is out of date.`
    };
  }

  const expected = applyRate(line.premiumCents, rate.rateBps);
  const variance = line.commissionCents - expected;
  if (Math.abs(variance) > tolerance) {
    return {
      ...priced,
      finding: "rate_variance",
      disposition: "dispute",
      expectedCents: expected,
      varianceCents: variance,
      explanation: describeRateGap(line, rate, expected)
    };
  }

  return {
    ...priced,
    finding: "ok",
    disposition: "clear",
    expectedCents: expected,
    varianceCents: variance,
    explanation: `Paid as expected at ${formatRate(rate.rateBps)}.`
  };
}

function findRateRule(rules: readonly RateRule[], carrierId: string, policy: Policy): RateRule | null {
  const lookup = findEffectiveRule(
    rules,
    policy.effectiveDate,
    rule => rule.carrierId === carrierId && rule.product === policy.product && rule.term === policy.term
  );
  return lookup.status === "found" ? lookup.rule : null;
}

/** A product-specific split wins over the agency's "*" default. */
function findSplitRule(rules: readonly SplitRule[], policy: Policy): SplitRule | null {
  const forAgency = (product: string) => (rule: SplitRule) =>
    rule.agencyId === policy.agencyId && rule.product === product;

  const specific = findEffectiveRule(rules, policy.effectiveDate, forAgency(policy.product));
  if (specific.status === "found") return specific.rule;
  if (specific.status === "conflict") return null;

  const fallback = findEffectiveRule(rules, policy.effectiveDate, forAgency("*"));
  return fallback.status === "found" ? fallback.rule : null;
}

/** The reason only: the amounts paid and expected are on the line beside it, in reports and letters alike. */
function describeRateGap(line: StatementLine, rate: RateRule, expected: Cents): string {
  const direction = line.commissionCents < expected ? "Underpaid" : "Overpaid";
  return `${direction}: the rate in effect is ${formatRate(rate.rateBps)}, since ${rate.effectiveFrom}.`;
}

function describeMethod(method: MatchMethod, words: Vocabulary): string {
  return method === "policy_number" ? `${words.item} number` : `${words.customer} and ${words.date}`;
}

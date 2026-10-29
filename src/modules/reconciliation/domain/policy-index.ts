import { normalizeInsuredName, normalizePolicyNumber } from "./normalize";
import type { Policy, StatementLine } from "./types";

export type MatchMethod = "policy_number" | "insured_and_date";

export type MatchResult =
  | { status: "matched"; policy: Policy; method: MatchMethod }
  | { status: "ambiguous"; method: MatchMethod; candidates: Policy[] }
  | { status: "unmatched" };

/**
 * Finds the policy a statement line refers to, using deterministic rules in order of strength:
 *
 *   1. Same carrier and same policy number (after normalization).
 *   2. Same carrier, same insured name and same effective date. Covers blank or mistyped numbers.
 *
 * A rule that finds more than one candidate stops the search and reports the ambiguity. Picking
 * one would be a guess, and a confident wrong match is worse than a line sent to review.
 */
export class PolicyIndex {
  private readonly byPolicyNumber = new Map<string, Policy[]>();
  private readonly byInsuredAndDate = new Map<string, Policy[]>();
  private readonly byCarrier = new Map<string, Policy[]>();

  constructor(policies: readonly Policy[]) {
    for (const policy of policies) {
      addTo(this.byPolicyNumber, policyNumberKey(policy.carrierId, policy.policyNumber), policy);
      addTo(this.byInsuredAndDate, insuredKey(policy.carrierId, policy.insuredName, policy.effectiveDate), policy);
      addTo(this.byCarrier, policy.carrierId, policy);
    }
  }

  match(carrierId: string, line: StatementLine): MatchResult {
    if (line.policyNumber !== null) {
      const byNumber = this.byPolicyNumber.get(policyNumberKey(carrierId, line.policyNumber)) ?? [];
      const result = toMatchResult(byNumber, "policy_number");
      if (result.status !== "unmatched") return result;
    }

    const byInsured = this.byInsuredAndDate.get(insuredKey(carrierId, line.insuredName, line.effectiveDate)) ?? [];
    return toMatchResult(byInsured, "insured_and_date");
  }

  policiesFor(carrierId: string): readonly Policy[] {
    return this.byCarrier.get(carrierId) ?? [];
  }
}

function toMatchResult(candidates: Policy[], method: MatchMethod): MatchResult {
  const [only] = candidates;
  if (only === undefined) return { status: "unmatched" };
  if (candidates.length > 1) return { status: "ambiguous", method, candidates };
  return { status: "matched", policy: only, method };
}

function policyNumberKey(carrierId: string, policyNumber: string): string {
  return `${carrierId}|${normalizePolicyNumber(policyNumber)}`;
}

function insuredKey(carrierId: string, insuredName: string, effectiveDate: string): string {
  return `${carrierId}|${normalizeInsuredName(insuredName)}|${effectiveDate}`;
}

function addTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

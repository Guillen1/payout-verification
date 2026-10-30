/*
 * The admin API's responses, mirroring the server's view models and its health and approvals
 * services. Amounts are integer cents; rates are basis points.
 */

export type Disposition = "clear" | "dispute" | "review";

export interface ModelCall {
  task: string;
  model: string;
  source: "live" | "recording" | "scripted";
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCostUsd: number | null;
}

export interface Hold {
  reason: string;
  details: string[];
}

export interface LineView {
  row: number;
  page: number | null;
  policyNumber: string | null;
  insuredName: string;
  agency: string | null;
  product: string;
  transaction: string;
  finding: string;
  disposition: Disposition;
  explanation: string;
  paidCents: number;
  expectedCents: number | null;
  varianceCents: number | null;
}

export interface MissingView {
  policyNumber: string;
  insuredName: string;
  agency: string;
  effectiveDate: string;
  expectedCents: number | null;
}

export interface StatementTotals {
  paidCents: number;
  toAgenciesCents: number;
  toNetworkCents: number;
  heldCents: number;
  disputedVarianceCents: number;
  missingExpectedCents: number;
}

export interface CarrierView {
  id: string;
  name: string;
  fileKind: "csv" | "pdf";
  state: "processed" | "held" | "not_received";
  hold: Hold | null;
  totals: StatementTotals | null;
  counts: { clear: number; dispute: number; review: number; missing: number };
  owedCents: number;
  lines: LineView[];
  missing: MissingView[];
}

export interface PeriodView {
  tenantName: string;
  period: string;
  ranAt: string;
  totals: { paidCents: number; toAgenciesCents: number; toNetworkCents: number; heldCents: number; owedCents: number };
  carriers: CarrierView[];
  modelCalls: ModelCall[];
}

export interface PeriodSummary {
  period: string;
  hasRun: boolean;
}

export interface CalculationStep {
  step: string;
  value: string;
  clause: string | null;
}

export interface BonusRules {
  programId: string;
  carrierId: string;
  programYear: number;
  agreementSha256: string;
  eligibleProducts: { products: string[]; clause: string };
  minimumPremium: { cents: number; clause: string };
  lossRatioBands: { bands: { upToLossRatioBps: number; rateBps: number }[]; clause: string };
  maximumBonus: { cents: number; clause: string } | null;
}

export interface BonusView {
  programId: string;
  programYear: number;
  carrierName: string;
  ranAt: string;
  status: "awaiting_approval" | "statement_invalid" | "checked";
  hold: Hold | null;
  draft: { rules: BonusRules; notes: string[] } | null;
  check: {
    disposition: Disposition;
    paidCents: number;
    expectedCents: number;
    varianceCents: number;
    lossRatioBps: number;
    rateBps: number;
    steps: CalculationStep[];
    findings: { kind: string; clause: string; description: string }[];
  } | null;
  allocation: {
    networkShareBps: number;
    networkCents: number;
    agencies: { agencyId: string; name: string; eligiblePremiumCents: number; agencyCents: number }[];
  } | null;
}

export interface BonusProgramSummary {
  id: string;
  carrierName: string;
  programYear: number;
  hasRun: boolean;
}

export type PendingApproval =
  | {
      id: string;
      kind: "layout";
      carrierName: string;
      period: string;
      verified: boolean;
      explanation: string;
      changes: { field: string; from: string; to: string }[];
    }
  | {
      id: string;
      kind: "bonus_rules";
      carrierName: string;
      programId: string;
      programYear: number;
      rules: BonusRules;
      notes: string[];
    };

export interface EvalSummary {
  ranAt: string;
  passed: boolean;
  scores: { measure: string; label: string; score: number; floor: number }[];
  escalations: number;
  statements: number;
  calls: number;
  replayed: number;
  costUsd: number;
}

export interface HealthView {
  evals: EvalSummary | null;
  latestPeriod: string | null;
  held: { carrier: string; reason: string }[];
  modelUse: {
    task: string;
    model: string;
    calls: number;
    replayed: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }[];
}

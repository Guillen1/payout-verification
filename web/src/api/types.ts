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
  outcome: string;
  csvColumns: string[] | null;
  hold: Hold | null;
  totals: StatementTotals | null;
  counts: { clear: number; dispute: number; review: number; missing: number };
  owedCents: number;
  lines: LineView[];
  missing: MissingView[];
}

export interface PeriodView {
  payouts: { agency: string; lines: number; paidCents: number; agencyCents: number; networkCents: number }[];
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
  picture: {
    bands: { upToLossRatioBps: number; rateBps: number }[];
    bandsClause: string;
    lossRatioBps: number;
    agreementRateBps: number;
    paidRateBps: number;
    agencies: { name: string; networkCents: number; statementCents: number }[];
  } | null;
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

export interface Signal {
  label: string;
  value: string;
  status: "ok" | "alert";
}

export interface HealthView {
  evals: EvalSummary | null;
  latestPeriod: string | null;
  modelUse: { task: string; model: string; calls: number; replayed: number; costPerCallUsd: number }[];
  signals: Signal[];
}

export type Target = { kind: "carrier"; period: string; carrierId: string } | { kind: "bonus"; programId: string };

/** The tenant's words for the same money flow: carriers and policies, or retailers and invoices. */
export interface Words {
  counterparty: string;
  counterparties: string;
  statement: string;
  payment: string;
  payments: string;
  item: string;
  items: string;
  customer: string;
  date: string;
  reversal: string;
  book: string;
  amount: string;
  partner: string;
  partners: string;
  organization: string;
  rates: string;
  disputeDesk: string;
  documentForModel: string;
}

export interface OverviewView {
  tenantName: string;
  words: Words;
  period: string | null;
  foundCents: number;
  found: { target: Target; carrierName: string; subject: string; cents: number; reasons: string[] }[];
  checked: {
    statements: number;
    processed: number;
    readByModel: number;
    lines: number;
    needsPerson: number;
    bonusPrograms: number;
  };
  waiting: { target: Target; title: string; detail: string }[];
  accuracy: { passed: boolean; lowestScore: number; readingsTested: number; retries: number } | null;
  costPerStatementUsd: number | null;
  scale: {
    name: string;
    counterparties: number;
    bonusPrograms: number;
    source: string;
    statementsPerYear: number;
    readingCostPerYearUsd: number | null;
  } | null;
}

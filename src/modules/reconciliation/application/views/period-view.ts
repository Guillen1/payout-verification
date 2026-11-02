import type { FormatProposal } from "../../../extraction/application/services/format-proposal.service";
import type { ModelUsage } from "../../../../libs/model-client/contract/model.models";
import { carrierClaims } from "../../domain/carrier-claims";
import type { Disposition } from "../../domain/line-result";
import { formatMoney, sumCents, type Cents } from "../../domain/money";
import type { StatementTotals } from "../../domain/reconcile-statement";
import type { Vocabulary } from "../../domain/vocabulary";
import type { Tenant } from "../../infrastructure/tenant-files";
import type { CarrierOutcome, PeriodResult } from "../services/reconcile-period.service";

/*
 * What the admin shows for a period: the result reshaped for reading, with names resolved and every
 * total already computed. The page formats numbers; it never adds them up.
 */

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
  paidCents: Cents;
  expectedCents: Cents | null;
  varianceCents: Cents | null;
}

export interface MissingView {
  policyNumber: string;
  insuredName: string;
  agency: string;
  effectiveDate: string;
  expectedCents: Cents | null;
}

export interface CarrierView {
  id: string;
  name: string;
  fileKind: "csv" | "pdf";
  state: "processed" | "held" | "not_received";
  /**
   * For a CSV, the columns worth showing beside a finding, in the carrier's own names: number,
   * name, date, amount and what was paid, the last one being what was paid.
   */
  csvColumns: string[] | null;
  /** What happened to the statement, for monitoring: "processed", "format_drift", "paused" and so on. */
  outcome: CarrierOutcome["status"];
  /** Why the statement was not processed, in one sentence, with any detail below it. */
  hold: Hold | null;
  totals: StatementTotals | null;
  counts: { clear: number; dispute: number; review: number; missing: number };
  owedCents: Cents;
  lines: LineView[];
  missing: MissingView[];
}

export interface PeriodView {
  tenantName: string;
  /** The tenant's words, for whatever describes the period. */
  words: Vocabulary;
  period: string;
  ranAt: string;
  totals: { paidCents: Cents; toAgenciesCents: Cents; toNetworkCents: Cents; heldCents: Cents; owedCents: Cents };
  carriers: CarrierView[];
  modelCalls: ModelUsage[];
}

export interface Hold {
  reason: string;
  details: string[];
}

export function toPeriodView(result: PeriodResult, tenant: Tenant, ranAt: string): PeriodView {
  const agencyName = (agencyId: string) =>
    tenant.agencies.find(agency => agency.agencyId === agencyId)?.name ?? agencyId;
  const carriers = result.carriers.map(outcome => toCarrierView(outcome, agencyName));
  const sum = (pick: (carrier: CarrierView) => Cents) => sumCents(carriers.map(pick));

  return {
    tenantName: tenant.name,
    words: tenant.vocabulary,
    period: result.period,
    ranAt,
    totals: {
      paidCents: sum(carrier => carrier.totals?.paidCents ?? 0),
      toAgenciesCents: sum(carrier => carrier.totals?.toAgenciesCents ?? 0),
      toNetworkCents: sum(carrier => carrier.totals?.toNetworkCents ?? 0),
      heldCents: sum(carrier => carrier.totals?.heldCents ?? 0),
      owedCents: sum(carrier => carrier.owedCents)
    },
    carriers,
    modelCalls: result.modelCalls
  };
}

function toCarrierView(outcome: CarrierOutcome, agencyName: (agencyId: string) => string): CarrierView {
  const base = {
    id: outcome.carrier.id,
    name: outcome.carrier.name,
    fileKind: outcome.carrier.format.kind,
    csvColumns:
      outcome.carrier.format.kind === "csv"
        ? [
            outcome.carrier.format.columns.policyNumber,
            outcome.carrier.format.columns.insuredName,
            outcome.carrier.format.columns.effectiveDate,
            outcome.carrier.format.columns.premium,
            outcome.carrier.format.columns.commission
          ]
        : null,
    outcome: outcome.status,
    hold: describeHold(outcome),
    totals: null,
    counts: { clear: 0, dispute: 0, review: 0, missing: 0 },
    owedCents: 0,
    lines: [],
    missing: []
  };
  if (outcome.status === "statement_missing") return { ...base, state: "not_received" };
  if (outcome.status !== "processed" || outcome.reconciliation.status !== "reconciled")
    return { ...base, state: "held" };

  const { lines, missing, totals } = outcome.reconciliation;
  const count = (disposition: Disposition) => lines.filter(line => line.disposition === disposition).length;
  return {
    ...base,
    state: "processed",
    totals,
    counts: { clear: count("clear"), dispute: count("dispute"), review: count("review"), missing: missing.length },
    owedCents: carrierClaims(outcome.reconciliation).owedCents,
    lines: lines.map(result => ({
      row: result.line.source.row,
      page: result.line.source.page ?? null,
      policyNumber: result.policy?.policyNumber ?? result.line.policyNumber,
      insuredName: result.line.insuredName,
      agency: result.policy ? agencyName(result.policy.agencyId) : null,
      product: result.line.product,
      transaction: result.line.transactionType,
      finding: result.finding,
      disposition: result.disposition,
      explanation: result.explanation,
      paidCents: result.line.commissionCents,
      expectedCents: result.expectedCents,
      varianceCents: result.varianceCents
    })),
    missing: missing.map(({ policy, expectedCents }) => ({
      policyNumber: policy.policyNumber,
      insuredName: policy.insuredName,
      agency: agencyName(policy.agencyId),
      effectiveDate: policy.effectiveDate,
      expectedCents
    }))
  };
}

/** Why a carrier's statement was not processed, or null when it was. Shared by the report and the admin. */
export function describeHold(outcome: CarrierOutcome): Hold | null {
  switch (outcome.status) {
    case "processed": {
      if (outcome.reconciliation.status === "reconciled") return null;
      const { extractedTotalCents, statedTotalCents } = outcome.reconciliation.tieOut;
      return {
        reason: "The lines do not add up to the statement total. Nothing was allocated.",
        details: [
          `Lines add up to ${formatMoney(extractedTotalCents)}; the statement total is ${formatMoney(statedTotalCents)}.`
        ]
      };
    }
    case "statement_missing":
      return { reason: "No statement received.", details: [`Expected at ${outcome.file}.`] };
    case "paused":
      return {
        reason: `Paused by a person: ${outcome.reason}`,
        details: ["Nothing is read or paid until it is turned back on in the tenant's config."]
      };
    case "format_drift":
      return {
        reason: "The statement layout changed, so it was not processed.",
        details: [
          `Missing columns: ${list(outcome.headerCheck.missing)}. New columns: ${list(outcome.headerCheck.unexpected)}.`,
          describeProposal(outcome.proposal)
        ]
      };
    case "invalid_lines":
      return {
        reason: `${outcome.problems.length} unreadable value(s), so it was not processed.`,
        details: outcome.problems.map(problem => `${problem.location}, ${problem.field}: ${problem.message}`)
      };
    case "unreadable":
      return { reason: "The statement could not be read.", details: [outcome.reason] };
    case "model_unavailable":
      return { reason: "Not processed because the model was unavailable.", details: [outcome.reason] };
  }
}

function describeProposal(proposal: FormatProposal): string {
  switch (proposal.status) {
    case "verified":
      return `A model proposed an updated mapping that reads all ${proposal.lineCount} lines and ties out to the cent. It is waiting for approval.`;
    case "unverified":
      return `A model proposed a mapping, but it failed the check: ${proposal.reason} It is not usable as is.`;
    case "no_answer":
      return `No mapping was proposed: ${proposal.reason}`;
  }
}

function list(items: readonly string[]): string {
  return items.length === 0 ? "none" : items.map(item => `"${item}"`).join(", ");
}

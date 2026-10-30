import { Injectable } from "@nestjs/common";
import type { AppPaths } from "../../../libs/app-paths/app-paths";
import { ApprovalsService } from "../../approvals/application/approvals.service";
import { BonusRunsService } from "../../bonus/application/services/bonus-runs.service";
import type { BonusFinding } from "../../bonus/domain/check-bonus";
import { readEvalSummary } from "../../evals/eval-summary";
import { PeriodRunsService } from "../../reconciliation/application/services/period-runs.service";
import type { CarrierView, PeriodView } from "../../reconciliation/application/views/period-view";
import { formatMoney, formatRate, sumCents, type Cents } from "../../reconciliation/domain/money";
import { loadTenant } from "../../reconciliation/infrastructure/tenant-files";

export type Target = { kind: "carrier"; period: string; carrierId: string } | { kind: "bonus"; programId: string };

/** Money a carrier owes the network, with the reasons in plain words. */
export interface MoneyFound {
  target: Target;
  carrierName: string;
  subject: string;
  cents: Cents;
  reasons: string[];
}

/** Something that cannot go further without a person. */
export interface Waiting {
  target: Target;
  title: string;
  detail: string;
}

export interface OverviewView {
  tenantName: string;
  period: string | null;
  foundCents: Cents;
  found: MoneyFound[];
  checked: { statements: number; processed: number; lines: number; needsPerson: number; bonusPrograms: number };
  waiting: Waiting[];
  accuracy: { passed: boolean; lowestScore: number; readingsTested: number; retries: number } | null;
  /** What reading one PDF statement costs at list prices, from the recorded calls. */
  costPerStatementUsd: number | null;
}

/**
 * The first screen: how much money the checks found, where it is, what is waiting for a person, and
 * how far the reading can be trusted. Every amount is summed here, not on the page.
 */
@Injectable()
export class OverviewService {
  constructor(
    private readonly periodRuns: PeriodRunsService,
    private readonly bonusRuns: BonusRunsService,
    private readonly approvals: ApprovalsService
  ) {}

  async view(paths: AppPaths): Promise<OverviewView> {
    const tenant = await loadTenant(paths.tenant);
    const latest = (await this.periodRuns.periods(paths)).find(entry => entry.hasRun)?.period ?? null;
    const period = latest === null ? null : await this.periodRuns.view(paths, latest);
    const pending = await this.approvals.pending(paths);
    const agencyName = (agencyId: string) =>
      tenant.agencies.find(agency => agency.agencyId === agencyId)?.name ?? agencyId;

    const found: MoneyFound[] = [];
    for (const carrier of period?.carriers ?? []) {
      if (carrier.owedCents > 0) found.push(commissionFound(period!, carrier));
    }

    const waiting: Waiting[] = pending.map(item =>
      item.kind === "layout"
        ? {
            target: { kind: "carrier", period: item.period, carrierId: carrierIdOf(item.id) },
            title: `${item.carrierName} changed its statement layout`,
            detail: item.verified
              ? "A new mapping is ready. It reads every line and ties out to the cent."
              : "A new mapping was proposed but failed its check. It needs fixing by hand."
          }
        : {
            target: { kind: "bonus", programId: item.programId },
            title: `${item.carrierName} ${item.programYear} bonus rules are ready to check`,
            detail: "Drafted from the agreement, each rule with the clause it comes from."
          }
    );
    for (const carrier of period?.carriers ?? []) {
      const coveredByApproval = waiting.some(
        item => item.target.kind === "carrier" && item.target.carrierId === carrier.id
      );
      if (carrier.hold && !coveredByApproval) {
        waiting.push({
          target: { kind: "carrier", period: period!.period, carrierId: carrier.id },
          title: `${carrier.name}: ${carrier.hold.reason}`,
          detail: carrier.hold.details[0] ?? ""
        });
      }
    }

    const programs = await this.bonusRuns.programs(paths);
    for (const program of programs) {
      const saved = await this.bonusRuns.result(paths, program.id);
      if (saved?.result.outcome.status !== "checked") continue;
      const { check } = saved.result.outcome;
      if (check.disposition !== "dispute") continue;
      found.push({
        target: { kind: "bonus", programId: program.id },
        carrierName: program.carrierName,
        subject: `${program.programYear} profit-sharing bonus`,
        cents: -check.varianceCents,
        reasons: check.findings.map(finding => bonusReason(finding, agencyName))
      });
    }
    found.sort((a, b) => b.cents - a.cents);

    const processed = (period?.carriers ?? []).filter(carrier => carrier.state === "processed");
    const readings = (period?.modelCalls ?? []).filter(call => call.task === "read-pdf-statement");
    const evals = await readEvalSummary(paths.out);

    return {
      tenantName: tenant.name,
      period: latest,
      foundCents: sumCents(found.map(entry => entry.cents)),
      found,
      checked: {
        statements: period?.carriers.length ?? 0,
        processed: processed.length,
        lines: total(processed.map(carrier => carrier.lines.length)),
        needsPerson: total(
          processed.map(carrier => carrier.counts.dispute + carrier.counts.review + carrier.counts.missing)
        ),
        bonusPrograms: programs.length
      },
      waiting,
      accuracy: evals && {
        passed: evals.passed,
        lowestScore: Math.min(...evals.scores.map(score => score.score)),
        readingsTested: evals.statements,
        retries: evals.escalations
      },
      costPerStatementUsd:
        readings.length === 0
          ? null
          : readings.reduce((total, call) => total + (call.estimatedCostUsd ?? 0), 0) / readings.length
    };
  }
}

function commissionFound(period: PeriodView, carrier: CarrierView): MoneyFound {
  const underpaid = carrier.lines.filter(
    line => line.disposition === "dispute" && line.varianceCents !== null && line.varianceCents < 0
  ).length;
  const unpaid = carrier.missing.filter(entry => entry.expectedCents !== null).length;
  const reasons = [
    underpaid > 0 && `${count(underpaid, "policy", "policies")} paid below the agreed rate`,
    unpaid > 0 && `${count(unpaid, "policy", "policies")} never paid`
  ].filter((reason): reason is string => typeof reason === "string");
  return {
    target: { kind: "carrier", period: period.period, carrierId: carrier.id },
    carrierName: carrier.name,
    subject: `${monthName(period.period)} commissions`,
    cents: carrier.owedCents,
    reasons
  };
}

function bonusReason(finding: BonusFinding, agencyName: (agencyId: string) => string): string {
  switch (finding.kind) {
    case "rate_differs":
      return `Paid at ${formatRate(finding.statedBps)} instead of ${formatRate(finding.agreementBps)}`;
    case "premium_difference":
      return finding.statementCents === 0
        ? `${agencyName(finding.agencyId)} left out`
        : `${agencyName(finding.agencyId)} counted at ${formatMoney(finding.statementCents)}, not ${formatMoney(finding.networkCents)}`;
    case "loss_ratio_differs":
      return `Loss ratio stated as ${formatRate(finding.statedBps)}, but its own figures give ${formatRate(finding.computedBps)}`;
  }
}

/** "2026-09" as "September 2026". */
function monthName(period: string): string {
  const [year, month] = period.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

function total(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

function count(amount: number, one: string, many: string): string {
  return `${amount} ${amount === 1 ? one : many}`;
}

function carrierIdOf(approvalId: string): string {
  return approvalId.split(":")[2] ?? "";
}

import { Injectable } from "@nestjs/common";
import type { ModelUsage } from "../../../../libs/model-client/contract/model.models";
import { allocateBonus, type BonusAllocation } from "../../domain/allocate-bonus";
import type { BonusProgram } from "../../domain/bonus-program";
import type { BonusRules } from "../../domain/bonus-rules";
import { readBonusStatement } from "../../domain/bonus-statement";
import { checkBonus, type BonusCheck } from "../../domain/check-bonus";
import type { ProductionRow } from "../../domain/compute-bonus";
import { agreementSha256, BonusTermsService, type BonusTermsDraft } from "./bonus-terms.service";

export type BonusOutcome =
  | { status: "awaiting_approval"; reason: string; draft: BonusTermsDraft }
  | { status: "statement_invalid"; problems: string[] }
  | { status: "checked"; check: BonusCheck; allocation: BonusAllocation };

export interface BonusResult {
  program: BonusProgram;
  outcome: BonusOutcome;
  modelCalls: ModelUsage[];
}

/**
 * Verifies one program year's bonus.
 *
 * Nothing is computed until the agreement's rules are approved for this exact document. Without
 * them, the model drafts rules and the run stops there for a person to review. With them, the
 * statement is checked by code only and the bonus that was paid is split.
 */
@Injectable()
export class BonusVerificationService {
  constructor(private readonly terms: BonusTermsService) {}

  async verify(input: {
    program: BonusProgram;
    approvedRules: BonusRules | null;
    products: string[];
    agreement: { fileName: string; data: Buffer };
    statementCsv: string;
    production: ProductionRow[];
  }): Promise<BonusResult> {
    const { program, approvedRules } = input;

    if (approvedRules === null || approvedRules.agreementSha256 !== agreementSha256(input.agreement.data)) {
      const reason =
        approvedRules === null
          ? "The agreement's rules have not been approved yet."
          : "The agreement document changed since its rules were approved.";
      const { draft, modelCalls } = await this.draftRules(input);
      return { program, outcome: { status: "awaiting_approval", reason, draft }, modelCalls };
    }

    const reading = readBonusStatement(input.statementCsv, program);
    if (reading.status === "invalid") {
      return { program, outcome: { status: "statement_invalid", problems: reading.problems }, modelCalls: [] };
    }

    const check = checkBonus({
      rules: approvedRules,
      production: input.production,
      statement: reading.statement,
      toleranceCents: program.toleranceCents
    });
    const allocation = allocateBonus(check.paidCents, program.networkShareBps, check.expected.eligiblePremiumByAgency);
    return { program, outcome: { status: "checked", check, allocation }, modelCalls: [] };
  }

  private async draftRules(input: {
    program: BonusProgram;
    products: string[];
    agreement: { fileName: string; data: Buffer };
  }): Promise<{ draft: BonusTermsDraft; modelCalls: ModelUsage[] }> {
    try {
      const { draft, usage } = await this.terms.draft({
        program: input.program,
        products: input.products,
        fileName: input.agreement.fileName,
        agreement: input.agreement.data
      });
      return { draft, modelCalls: [usage] };
    } catch (error) {
      // A model outage leaves the program waiting, the same as a draft nobody has approved.
      return { draft: { status: "no_answer", reason: (error as Error).message }, modelCalls: [] };
    }
  }
}

import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { stringify as toYaml } from "yaml";
import { z } from "zod";
import { ModelAbstractClient } from "../../../../libs/model-client/contract/model.abstract-client";
import type { ModelUsage } from "../../../../libs/model-client/contract/model.models";
import { parseMoney, parsePercent } from "../../../reconciliation/domain/money";
import type { BonusProgram } from "../../domain/bonus-program";
import { BonusRulesSchema, type BonusRules } from "../../domain/bonus-rules";

export const READ_BONUS_AGREEMENT_TASK = "read-bonus-agreement";
const PROMPT_VERSION = 1;

const termWithClause = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ ...shape, clause: z.string().describe("The clause number only, such as 3.2") });

/** What the model returns: the agreement's terms as written, with amounts and rates as text. */
export const AgreementTermsSchema = z.object({
  programYear: z.number().int(),
  eligibleProducts: termWithClause({ products: z.array(z.string()) }),
  minimumPremium: termWithClause({ amount: z.string() }),
  lossRatioBands: termWithClause({
    bands: z.array(z.object({ lossRatioUpTo: z.string(), bonusRate: z.string() }))
  }),
  maximumBonus: termWithClause({ amount: z.string() }).nullable(),
  notes: z.array(z.string()).describe("Terms that could change the bonus but do not fit the fields above")
});

export type AgreementTerms = z.infer<typeof AgreementTermsSchema>;

/**
 * - drafted:   rules that pass every check, ready for a person to review and approve.
 * - invalid:   the model answered, but its terms do not make valid rules.
 * - no_answer: the model did not answer.
 *
 * Notes are terms the rules cannot express. The reviewer must read them before approving.
 */
export type BonusTermsDraft =
  | { status: "drafted"; rules: BonusRules; notes: string[] }
  | { status: "invalid"; reason: string; notes: string[] }
  | { status: "no_answer"; reason: string };

/** Asks the model to read a profit-sharing agreement into rules, which a person then approves. */
@Injectable()
export class BonusTermsService {
  constructor(private readonly model: ModelAbstractClient) {}

  async draft(input: {
    program: BonusProgram;
    products: string[];
    fileName: string;
    agreement: Buffer;
  }): Promise<{ draft: BonusTermsDraft; usage: ModelUsage }> {
    const answer = await this.model.ask({
      task: READ_BONUS_AGREEMENT_TASK,
      promptVersion: PROMPT_VERSION,
      instructions: INSTRUCTIONS,
      inputs: [
        { type: "text", text: `The network's product names: ${input.products.join(", ")}.` },
        { type: "pdf", name: input.fileName, data: input.agreement }
      ],
      schema: AgreementTermsSchema
    });
    if (answer.status !== "answered")
      return { draft: { status: "no_answer", reason: answer.reason }, usage: answer.usage };

    return { draft: toBonusRules(answer.output, input), usage: answer.usage };
  }
}

/** Turns the model's reading into rules, rejecting anything that does not fit the program. */
export function toBonusRules(
  terms: AgreementTerms,
  input: { program: BonusProgram; products: string[]; agreement: Buffer }
): BonusTermsDraft {
  const { program } = input;
  const invalid = (reason: string): BonusTermsDraft => ({ status: "invalid", reason, notes: terms.notes });

  if (terms.programYear !== program.programYear) {
    return invalid(`The agreement is for ${terms.programYear}, but the program is for ${program.programYear}.`);
  }
  const unknown = terms.eligibleProducts.products.filter(product => !input.products.includes(product));
  if (unknown.length > 0) return invalid(`Unknown product names: ${unknown.join(", ")}.`);

  try {
    const parsed = BonusRulesSchema.safeParse({
      programId: program.id,
      carrierId: program.carrierId,
      programYear: terms.programYear,
      agreementSha256: agreementSha256(input.agreement),
      eligibleProducts: terms.eligibleProducts,
      minimumPremium: { cents: parseMoney(terms.minimumPremium.amount), clause: terms.minimumPremium.clause },
      lossRatioBands: {
        bands: terms.lossRatioBands.bands.map(band => ({
          upToLossRatioBps: parsePercent(band.lossRatioUpTo),
          rateBps: parsePercent(band.bonusRate)
        })),
        clause: terms.lossRatioBands.clause
      },
      maximumBonus: terms.maximumBonus && {
        cents: parseMoney(terms.maximumBonus.amount),
        clause: terms.maximumBonus.clause
      }
    });
    if (!parsed.success) return invalid(parsed.error.issues.map(issue => issue.message).join("; "));
    return { status: "drafted", rules: parsed.data, notes: terms.notes };
  } catch (error) {
    return invalid((error as Error).message);
  }
}

export function agreementSha256(agreement: Buffer): string {
  return createHash("sha256").update(agreement).digest("hex");
}

/** The drafted rules as a file, with a header saying what it is and how to approve it. */
export function renderRulesProposal(draft: { rules: BonusRules; notes: string[] }): string {
  const header = [
    "# PROPOSED by a model from the agreement document. Not in use until a person approves it.",
    "# To approve, check every rule against the clause it cites, then save this file as rules.yaml",
    "# in the program's tenant directory.",
    ...(draft.notes.length > 0
      ? [
          "#",
          "# Terms the rules cannot express. Read these before approving:",
          ...draft.notes.map(note => `#   - ${note}`)
        ]
      : [])
  ].join("\n");
  return `${header}\n${toYaml(draft.rules)}`;
}

const INSTRUCTIONS = `You are reading an insurance carrier's profit-sharing (contingent bonus) agreement so that code can check the bonus the carrier pays.

Report the terms exactly as the agreement states them. Do not compute anything.

- programYear: the calendar year the bonus is earned in.
- eligibleProducts: the lines of business whose premium counts, using the network's product names given to you. Leave out excluded lines.
- minimumPremium: the eligible written premium needed to qualify for any bonus.
- lossRatioBands: one band per bonus rate, in increasing order of loss ratio. lossRatioUpTo is the highest loss ratio the band covers. Do not include a band that pays nothing.
- maximumBonus: the cap on the bonus, or null if there is none.
- Write amounts as plain decimals such as 500000.00, and percentages such as 45.00%.
- clause: the number of the clause the term comes from, such as 5.1.
- notes: any other term that could change the amount or whether it is paid (conditions, forfeiture, offsets), one short sentence each with its clause number. Leave out definitions and payment logistics that do not change the amount.`;

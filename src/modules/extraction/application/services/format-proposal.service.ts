import { Injectable } from "@nestjs/common";
import { parse } from "csv-parse/sync";
import { stringify as toYaml } from "yaml";
import { z } from "zod";
import type { Period } from "../../../reconciliation/domain/dates";
import { tieOut } from "../../../reconciliation/domain/tie-out";
import type { Vocabulary } from "../../../reconciliation/domain/vocabulary";
import { ModelAbstractClient } from "../../../../libs/model-client/contract/model.abstract-client";
import type { ModelUsage } from "../../../../libs/model-client/contract/model.models";
import { extractCsvStatement } from "../../domain/csv-extractor";
import { CsvFormatSchema, type CsvFormat } from "../../domain/source-format";

export const PROPOSE_FORMAT_TASK = "propose-csv-format";
const PROMPT_VERSION = 1;
const SAMPLE_ROWS = 10;

const ProposalSchema = z.object({
  columns: z.object({
    policyNumber: z.string(),
    insuredName: z.string(),
    product: z.string(),
    transactionType: z.string(),
    effectiveDate: z.string(),
    premium: z.string(),
    commission: z.string()
  }),
  totalRow: z.object({ labelColumn: z.string(), label: z.string(), amountColumn: z.string() }),
  explanation: z.string()
});

/**
 * - verified:   the proposed mapping reads every line of the file and ties out to the cent.
 * - unverified: the model proposed something, but it does not survive that check.
 * - no_answer:  the model did not produce a proposal.
 *
 * A proposal is never applied automatically. A person reviews it and copies it into the tenant's
 * config, which is the approval.
 */
export type FormatProposal =
  | { status: "verified"; format: CsvFormat; explanation: string; lineCount: number }
  | { status: "unverified"; format: CsvFormat | null; explanation: string; reason: string }
  | { status: "no_answer"; reason: string };

/** Asks the model how a carrier's changed CSV layout maps onto the current format, then checks the answer. */
@Injectable()
export class FormatProposalService {
  constructor(private readonly model: ModelAbstractClient) {}

  async propose(input: {
    current: CsvFormat;
    fileName: string;
    content: string;
    period: Period;
    vocabulary: Vocabulary;
  }): Promise<{ proposal: FormatProposal; usage: ModelUsage }> {
    const answer = await this.model.ask({
      task: PROPOSE_FORMAT_TASK,
      promptVersion: PROMPT_VERSION,
      instructions: instructionsFor(input.vocabulary),
      inputs: [
        { type: "text", text: `Current mapping:\n\n${toYaml(input.current)}` },
        { type: "text", text: `New file, header and first rows:\n\n${sampleOf(input.content, SAMPLE_ROWS)}` }
      ],
      schema: ProposalSchema
    });
    if (answer.status !== "answered")
      return { proposal: { status: "no_answer", reason: answer.reason }, usage: answer.usage };

    return { proposal: checkProposal(answer.output, input), usage: answer.usage };
  }
}

/** A proposal is only "verified" if it reads every line of the new file and ties out to the cent. */
function checkProposal(
  answer: z.infer<typeof ProposalSchema>,
  input: { current: CsvFormat; fileName: string; content: string; period: Period }
): FormatProposal {
  const [header = []]: string[][] = parse(input.content, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true
  });
  const { columns, totalRow, explanation } = answer;

  const candidate = CsvFormatSchema.safeParse({
    ...input.current,
    version: input.current.version + 1,
    headers: header.map(name => name.trim()),
    columns,
    totalRow
  });
  if (!candidate.success) {
    return { status: "unverified", format: null, explanation, reason: candidate.error.issues[0]?.message ?? "invalid" };
  }

  const extraction = extractCsvStatement({ ...input, format: candidate.data });
  if (extraction.status !== "extracted") {
    return {
      status: "unverified",
      format: candidate.data,
      explanation,
      reason: `It does not read the file (${extraction.status}).`
    };
  }
  if (!tieOut(extraction.statement).tiesOut) {
    return {
      status: "unverified",
      format: candidate.data,
      explanation,
      reason: "The lines it reads do not add up to the statement total."
    };
  }
  return { status: "verified", format: candidate.data, explanation, lineCount: extraction.statement.lines.length };
}

/** The proposal as a format file, with a header saying what it is and how to approve it. */
export function renderProposal(proposal: { format: CsvFormat; explanation: string }, verified: boolean): string {
  const header = [
    `# PROPOSED by a model. Not in use until a person approves it.`,
    `# ${verified ? "Checked: it reads every line of the new file and ties out to the cent." : "NOT checked: it does not read the new file cleanly."}`,
    `# To approve, review it and copy it over the carrier's format in the tenant directory.`,
    `#`,
    ...proposal.explanation.split("\n").map(line => `# ${line}`)
  ].join("\n");
  return `${header}\n${toYaml(proposal.format)}`;
}

function sampleOf(content: string, rows: number): string {
  return content
    .split("\n")
    .slice(0, rows + 1)
    .join("\n");
}

/** With the default vocabulary the text is the agency network's. */
const instructionsFor = (
  words: Vocabulary
) => `A ${words.counterparty} changed the layout of its ${words.statement} file, so the file no longer matches the mapping used to read it. Propose an updated mapping.

You get the current mapping and the new file's header row with its first rows. For each field under columns and totalRow, name the column in the new file that holds the same information. Use column names exactly as they appear in the new header row. Fields whose column did not change keep their current value.

In explanation, say in one sentence per change what changed and how you know, citing a sample value where it helps. If a field has no clear match, give your best candidate and say you are unsure: the proposal is checked against the whole file and reviewed by a person before it is used.`;

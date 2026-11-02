import { basename } from "node:path";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import type { Period } from "../../../reconciliation/domain/dates";
import { parseMoney } from "../../../reconciliation/domain/money";
import { tieOut } from "../../../reconciliation/domain/tie-out";
import type { StatementLine } from "../../../reconciliation/domain/types";
import type { Vocabulary } from "../../../reconciliation/domain/vocabulary";
import { ModelAbstractClient } from "../../../../libs/model-client/contract/model.abstract-client";
import type { ModelUsage } from "../../../../libs/model-client/contract/model.models";
import type { ExtractionResult } from "../../domain/extraction-result";
import type { PdfFormat } from "../../domain/source-format";
import { readPrintedLine, type LineProblem } from "../../domain/statement-line-reader";

export const READ_PDF_STATEMENT_TASK = "read-pdf-statement";
const PROMPT_VERSION = 1;

/** What the model returns: a transcription, not an interpretation. */
export const StatementTranscriptSchema = z.object({
  statementTotal: z.string().describe("The statement's grand total commission, as a signed decimal"),
  lines: z.array(
    z.object({
      page: z.number().int(),
      policyNumber: z.string(),
      insuredName: z.string(),
      productCode: z.string(),
      transactionCode: z.string(),
      effectiveDate: z.string(),
      premium: z.string(),
      commission: z.string()
    })
  )
});

export type StatementTranscript = z.infer<typeof StatementTranscriptSchema>;

export interface PdfReading {
  extraction: ExtractionResult;
  /** What the model transcribed, kept so the evals can score the reading itself. */
  transcript: StatementTranscript | null;
  /** One call, or two when the reading was retried on the escalation model. */
  modelCalls: ModelUsage[];
}

/**
 * Reads a PDF commission statement.
 *
 * The model transcribes the printed lines. Everything after that is the same code that reads a
 * CSV: codes are mapped with the carrier's format, values are parsed, and the statement must tie
 * out to its printed total before reconciliation. A misread amount therefore holds the statement
 * instead of reaching a payout.
 *
 * The default model reads first. If its reading does not tie out, the stronger escalation model
 * reads the statement once more, and whatever it returns goes on to reconciliation, where a
 * statement that still does not tie out is held for a person.
 */
@Injectable()
export class PdfStatementReaderService {
  constructor(private readonly model: ModelAbstractClient) {}

  async read(input: PdfInput): Promise<PdfReading> {
    const first = await this.readOnce(input, false);
    if (first.extraction.status === "extracted" && tieOut(first.extraction.statement).tiesOut) return first;

    const second = await this.readOnce(input, true);
    return { ...second, modelCalls: [...first.modelCalls, ...second.modelCalls] };
  }

  private async readOnce(input: PdfInput, escalate: boolean): Promise<PdfReading> {
    const answer = await this.model.ask({
      task: READ_PDF_STATEMENT_TASK,
      promptVersion: PROMPT_VERSION,
      instructions: instructionsFor(input.format, input.vocabulary),
      inputs: [{ type: "pdf", name: basename(input.fileName), data: input.data }],
      schema: StatementTranscriptSchema,
      escalate
    });

    if (answer.status !== "answered") {
      return {
        extraction: { status: "unreadable", reason: answer.reason },
        transcript: null,
        modelCalls: [answer.usage]
      };
    }
    return { extraction: readTranscript(answer.output, input), transcript: answer.output, modelCalls: [answer.usage] };
  }
}

type PdfInput = { fileName: string; data: Buffer; period: Period; format: PdfFormat; vocabulary: Vocabulary };

/** Turns a transcript into a statement. Separate from the model call so it can be tested on its own. */
export function readTranscript(
  transcript: StatementTranscript,
  input: { fileName: string; period: Period; format: PdfFormat }
): ExtractionResult {
  const lines: StatementLine[] = [];
  const problems: LineProblem[] = [];

  transcript.lines.forEach((printed, index) => {
    const result = readPrintedLine(
      { ...printed, source: { file: input.fileName, row: index + 1, page: printed.page } },
      input.format,
      "YYYY-MM-DD"
    );
    if ("line" in result) lines.push(result.line);
    else problems.push(...result.problems);
  });

  let statedTotalCents: number | null = null;
  try {
    statedTotalCents = parseMoney(transcript.statementTotal);
  } catch (error) {
    problems.push({ location: "statement", field: "statement total", message: (error as Error).message });
  }

  if (problems.length > 0 || statedTotalCents === null) return { status: "invalid_lines", problems };

  return {
    status: "extracted",
    statement: {
      carrierId: input.format.carrierId,
      period: input.period,
      formatId: input.format.id,
      statedTotalCents,
      lines
    }
  };
}

/** The words come from the tenant's vocabulary; with the default vocabulary the text is the agency network's. */
function instructionsFor(format: PdfFormat, words: Vocabulary): string {
  const notes = format.readingNotes.trim();
  return `You are transcribing ${words.documentForModel} so that code can check it.

Transcribe; do not interpret. Report every ${words.payment} line in the order it is printed. Copy ${words.item} numbers, ${words.customer} names, product codes and transaction codes exactly as printed. Do not correct, merge or drop lines that look wrong or repeated: finding those is the next step's job, and it can only find what you report.

- Skip column headers, page subtotals and running totals. They are not ${words.payment} lines.
- Report the statement's grand total ${words.payment} as statementTotal.
- Write dates as YYYY-MM-DD.
- Write amounts as plain signed decimals such as 1234.56 or -12.30, without currency symbols or thousands separators. Credits and chargebacks are negative.
- If a line has no ${words.item} number, use an empty string.
- page is the page the line is printed on, starting at 1.${notes ? `\n\nAbout this ${words.counterparty}'s layout:\n${notes}` : ""}`;
}

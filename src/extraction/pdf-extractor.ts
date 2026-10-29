import { basename } from "node:path";
import { z } from "zod";
import type { Period } from "../domain/dates";
import { parseMoney } from "../domain/money";
import type { StatementLine } from "../domain/types";
import type { ModelClient } from "../model/model-client";
import type { ExtractionResult } from "./extraction-result";
import type { PdfFormat } from "./source-format";
import { readPrintedLine, type LineProblem } from "./statement-line-reader";

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

/**
 * Reads a PDF commission statement.
 *
 * The model transcribes the printed lines. Everything after that is the same code that reads a
 * CSV: codes are mapped with the carrier's format, values are parsed, and the statement must tie
 * out to its printed total before reconciliation. A misread amount therefore holds the statement
 * instead of reaching a payout.
 */
export async function extractPdfStatement(input: {
  fileName: string;
  data: Buffer;
  period: Period;
  format: PdfFormat;
  model: ModelClient;
}): Promise<ExtractionResult> {
  const { format } = input;
  const answer = await input.model.ask({
    task: READ_PDF_STATEMENT_TASK,
    promptVersion: PROMPT_VERSION,
    instructions: instructionsFor(format),
    inputs: [{ type: "pdf", name: basename(input.fileName), data: input.data }],
    schema: StatementTranscriptSchema
  });
  if (answer.status !== "answered") return { status: "unreadable", reason: answer.reason };

  return readTranscript(answer.output, { ...input });
}

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

function instructionsFor(format: PdfFormat): string {
  const notes = format.readingNotes.trim();
  return `You are transcribing an insurance carrier's commission statement so that code can check it.

Transcribe; do not interpret. Report every commission line in the order it is printed. Copy policy numbers, insured names, product codes and transaction codes exactly as printed. Do not correct, merge or drop lines that look wrong or repeated: finding those is the next step's job, and it can only find what you report.

- Skip column headers, page subtotals and running totals. They are not commission lines.
- Report the statement's grand total commission as statementTotal.
- Write dates as YYYY-MM-DD.
- Write amounts as plain signed decimals such as 1234.56 or -12.30, without currency symbols or thousands separators. Credits and chargebacks are negative.
- If a line has no policy number, use an empty string.
- page is the page the line is printed on, starting at 1.${notes ? `\n\nAbout this carrier's layout:\n${notes}` : ""}`;
}

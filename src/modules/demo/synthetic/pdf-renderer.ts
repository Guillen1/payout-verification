import PDFDocument from "pdfkit";
import type { StatementTranscript } from "../../extraction/application/services/pdf-statement-reader.service";
import type { PlannedLine } from "./planned-line";

const LINES_PER_PAGE = 18;
const COLUMNS = [
  { title: "Policy", x: 40, width: 72 },
  { title: "Insured", x: 112, width: 120 },
  { title: "Line", x: 232, width: 40 },
  { title: "Trans", x: 272, width: 40 },
  { title: "Eff. Date", x: 312, width: 78 },
  { title: "Premium", x: 390, width: 80, right: true },
  { title: "Comm.", x: 470, width: 80, right: true }
] as const;

const PRODUCTS: Record<string, string> = { auto: "AUTO", home: "HOME", umbrella: "UMBR" };
const TRANSACTIONS: Record<string, string> = { new: "NEW", renewal: "REN", cancellation: "CXL" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Harbor & Pine prints its statement as a PDF: a header block, a table split across pages with a
 * subtotal at the bottom of each page, credits written as "123.45 CR", and the grand total on the
 * last page only.
 *
 * Returns the PDF and the transcript a perfect reader would produce from it, which the evals use
 * to score the model field by field.
 */
export async function renderHarborPineStatement(
  lines: readonly PlannedLine[],
  context: { period: string; networkName: string }
): Promise<{ pdf: Buffer; transcript: StatementTranscript }> {
  const document = new PDFDocument({
    size: "LETTER",
    margin: 40,
    info: {
      Title: "Agency Commission Statement",
      Author: "Harbor & Pine Casualty",
      CreationDate: new Date(Date.UTC(2026, 9, 5))
    }
  });
  const chunks: Buffer[] = [];
  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<void>(resolve => document.on("end", () => resolve()));

  const pages = chunk(lines, LINES_PER_PAGE);
  const transcript: StatementTranscript = { statementTotal: "", lines: [] };
  let grandTotal = 0;

  pages.forEach((pageLines, pageIndex) => {
    if (pageIndex > 0) document.addPage();
    drawHeader(document, context, pageIndex + 1, pages.length);

    let y = 170;
    for (const line of pageLines) {
      const printed = {
        policyNumber: line.showPolicyNumber ? line.policy.policyNumber.replace("-", " ") : "",
        insuredName: line.policy.insuredName,
        productCode: PRODUCTS[line.policy.product] ?? line.policy.product,
        transactionCode: TRANSACTIONS[line.transactionType] ?? line.transactionType,
        effectiveDate: line.policy.effectiveDate
      };
      drawRow(document, y, [
        printed.policyNumber,
        printed.insuredName,
        printed.productCode,
        printed.transactionCode,
        longDate(printed.effectiveDate),
        printedAmount(line.premiumCents),
        printedAmount(line.commissionCents)
      ]);
      transcript.lines.push({
        page: pageIndex + 1,
        ...printed,
        premium: plainAmount(line.premiumCents),
        commission: plainAmount(line.commissionCents)
      });
      y += 18;
    }

    const pageTotal = pageLines.reduce((sum, line) => sum + line.commissionCents, 0);
    grandTotal += pageTotal;
    document.font("Helvetica-Bold").fontSize(9);
    document.text("Page subtotal", COLUMNS[0].x, y + 6);
    document.text(printedAmount(pageTotal), COLUMNS[6].x, y + 6, { width: COLUMNS[6].width, align: "right" });

    if (pageIndex === pages.length - 1) {
      document.fontSize(11).text("Statement total commission", COLUMNS[0].x, y + 36);
      document.text(printedAmount(grandTotal), COLUMNS[6].x - 40, y + 36, {
        width: COLUMNS[6].width + 40,
        align: "right"
      });
    }
  });

  transcript.statementTotal = plainAmount(grandTotal);
  document.end();
  await finished;
  return { pdf: Buffer.concat(chunks), transcript };
}

function drawHeader(
  document: PDFKit.PDFDocument,
  context: { period: string; networkName: string },
  page: number,
  pages: number
) {
  const [year, month] = context.period.split("-").map(Number) as [number, number];
  document.font("Helvetica-Bold").fontSize(16).text("HARBOR & PINE CASUALTY", 40, 40);
  document.font("Helvetica").fontSize(10);
  document.text("Agency Commission Statement", 40, 62);
  document.text(`Producer: ${context.networkName}    Producer code 77-1042`, 40, 78);
  document.text(`Statement period: ${MONTHS[month - 1]} ${year}`, 40, 94);
  document.text(`Page ${page} of ${pages}`, 470, 40, { width: 80, align: "right" });

  document.font("Helvetica-Bold").fontSize(9);
  for (const column of COLUMNS) {
    document.text(column.title, column.x, 140, { width: column.width, align: "right" in column ? "right" : "left" });
  }
  document.moveTo(40, 154).lineTo(550, 154).stroke();
  document.font("Helvetica").fontSize(9);
}

function drawRow(document: PDFKit.PDFDocument, y: number, cells: string[]) {
  COLUMNS.forEach((column, index) => {
    document.text(cells[index] ?? "", column.x, y, {
      width: column.width,
      align: "right" in column ? "right" : "left",
      lineBreak: false
    });
  });
}

/** "2026-09-03" as "Sep 03, 2026". */
function longDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${MONTHS[Number(month) - 1]} ${day}, ${year}`;
}

/** "1,234.56", or "1,234.56 CR" for credits. */
function printedAmount(cents: number): string {
  const formatted = (Math.abs(cents) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return cents < 0 ? `${formatted} CR` : formatted;
}

/** The plain signed decimal a perfect transcription contains. */
function plainAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) result.push(items.slice(start, start + size));
  return result;
}

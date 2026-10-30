import PDFDocument from "pdfkit";
import type { StatementTranscript } from "../../extraction/application/services/pdf-statement-reader.service";
import type { PlannedLine } from "./planned-line";

const LINES_PER_PAGE = 18;
const COLUMN_GEOMETRY = [
  { x: 40, width: 72 },
  { x: 112, width: 120 },
  { x: 232, width: 40 },
  { x: 272, width: 40 },
  { x: 312, width: 78 },
  { x: 390, width: 80, right: true },
  { x: 470, width: 80, right: true }
] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** What one sender's printed statement says around the same seven-column table. */
export interface PrintedLayout {
  sender: string;
  documentTitle: string;
  /** The line naming who the statement is for. */
  recipientLine: (recipientName: string) => string;
  periodLabel: string;
  /** Column titles, in table order. */
  columnTitles: [string, string, string, string, string, string, string];
  products: Record<string, string>;
  transactions: Record<string, string>;
  totalLabel: string;
}

export const HARBOR_PINE_LAYOUT: PrintedLayout = {
  sender: "Harbor & Pine Casualty",
  documentTitle: "Agency Commission Statement",
  recipientLine: name => `Producer: ${name}    Producer code 77-1042`,
  periodLabel: "Statement period",
  columnTitles: ["Policy", "Insured", "Line", "Trans", "Eff. Date", "Premium", "Comm."],
  products: { auto: "AUTO", home: "HOME", umbrella: "UMBR" },
  transactions: { new: "NEW", renewal: "REN", cancellation: "CXL" },
  totalLabel: "Statement total commission"
};

export const COASTAL_LAYOUT: PrintedLayout = {
  sender: "Coastal Beauty Supply",
  documentTitle: "Vendor Remittance Advice",
  recipientLine: name => `Vendor: ${name}    Vendor no. 40-2213`,
  periodLabel: "Payment period",
  columnTitles: ["Invoice", "Store", "Cat.", "Type", "Inv. Date", "Inv. Amount", "Paid"],
  products: { lash: "LASH", hair: "HAIR", skin: "SKIN" },
  transactions: { new: "NI", renewal: "RO", cancellation: "RTN" },
  totalLabel: "Total remitted"
};

/** Harbor & Pine's commission statement. */
export function renderHarborPineStatement(
  lines: readonly PlannedLine[],
  context: { period: string; networkName: string }
) {
  return renderPrintedStatement(lines, context, HARBOR_PINE_LAYOUT);
}

/** Coastal's remittance advice: the same kind of printed table, in a retailer's words. */
export function renderCoastalStatement(
  lines: readonly PlannedLine[],
  context: { period: string; networkName: string }
) {
  return renderPrintedStatement(lines, context, COASTAL_LAYOUT);
}

/**
 * A printed statement as a PDF: a header block, a table split across pages with a subtotal at the
 * bottom of each page, credits written as "123.45 CR", and the grand total on the last page only.
 *
 * Returns the PDF and the transcript a perfect reader would produce from it, which the evals use
 * to score the model field by field.
 */
async function renderPrintedStatement(
  lines: readonly PlannedLine[],
  context: { period: string; networkName: string },
  layout: PrintedLayout
): Promise<{ pdf: Buffer; transcript: StatementTranscript }> {
  const document = new PDFDocument({
    size: "LETTER",
    margin: 40,
    info: {
      Title: layout.documentTitle,
      Author: layout.sender,
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
    drawHeader(document, layout, context, pageIndex + 1, pages.length);

    let y = 170;
    for (const line of pageLines) {
      const printed = {
        policyNumber: line.showPolicyNumber ? line.policy.policyNumber.replace("-", " ") : "",
        insuredName: line.policy.insuredName,
        productCode: layout.products[line.policy.product] ?? line.policy.product,
        transactionCode: layout.transactions[line.transactionType] ?? line.transactionType,
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
    document.text("Page subtotal", COLUMN_GEOMETRY[0].x, y + 6);
    document.text(printedAmount(pageTotal), COLUMN_GEOMETRY[6].x, y + 6, {
      width: COLUMN_GEOMETRY[6].width,
      align: "right"
    });

    if (pageIndex === pages.length - 1) {
      document.fontSize(11).text(layout.totalLabel, COLUMN_GEOMETRY[0].x, y + 36);
      document.text(printedAmount(grandTotal), COLUMN_GEOMETRY[6].x - 40, y + 36, {
        width: COLUMN_GEOMETRY[6].width + 40,
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
  layout: PrintedLayout,
  context: { period: string; networkName: string },
  page: number,
  pages: number
) {
  const [year, month] = context.period.split("-").map(Number) as [number, number];
  document.font("Helvetica-Bold").fontSize(16).text(layout.sender.toUpperCase(), 40, 40);
  document.font("Helvetica").fontSize(10);
  document.text(layout.documentTitle, 40, 62);
  document.text(layout.recipientLine(context.networkName), 40, 78);
  document.text(`${layout.periodLabel}: ${MONTHS[month - 1]} ${year}`, 40, 94);
  document.text(`Page ${page} of ${pages}`, 470, 40, { width: 80, align: "right" });

  document.font("Helvetica-Bold").fontSize(9);
  COLUMN_GEOMETRY.forEach((column, index) => {
    document.text(layout.columnTitles[index]!, column.x, 140, {
      width: column.width,
      align: "right" in column ? "right" : "left"
    });
  });
  document.moveTo(40, 154).lineTo(550, 154).stroke();
  document.font("Helvetica").fontSize(9);
}

function drawRow(document: PDFKit.PDFDocument, y: number, cells: string[]) {
  COLUMN_GEOMETRY.forEach((column, index) => {
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

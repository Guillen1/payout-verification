import PDFDocument from "pdfkit";

export interface AgreementContent {
  carrierName: string;
  networkName: string;
  programYear: number;
  minimumPremiumCents: number;
  bands: { upToLossRatioBps: number; rateBps: number }[];
  maximumBonusCents: number;
}

/**
 * A profit-sharing agreement as a carrier would write it: numbered clauses in prose, the bonus
 * schedule as a small table, and terms that matter (exclusions, a cap, a forfeiture condition)
 * mixed in with ones that do not.
 */
export async function renderAgreement(content: AgreementContent): Promise<Buffer> {
  const { carrierName, networkName, programYear: year } = content;
  const document = new PDFDocument({
    size: "LETTER",
    margin: 60,
    info: {
      Title: "Agency Profit Sharing Agreement",
      Author: carrierName,
      CreationDate: new Date(Date.UTC(2024, 11, 2))
    }
  });
  const chunks: Buffer[] = [];
  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<void>(resolve => document.on("end", () => resolve()));

  const heading = (text: string) => document.moveDown(0.8).font("Helvetica-Bold").fontSize(11).text(text).moveDown(0.3);
  const clause = (number: string, text: string) =>
    document.font("Helvetica").fontSize(10).text(`${number}  ${text}`, { align: "justify" }).moveDown(0.4);

  document.font("Helvetica-Bold").fontSize(15).text(carrierName.toUpperCase(), { align: "center" });
  document.fontSize(12).text(`Agency Profit Sharing Agreement, Program Year ${year}`, { align: "center" });
  document.moveDown();
  document
    .font("Helvetica")
    .fontSize(10)
    .text(
      `This agreement is made between ${carrierName} (the "Company") and ${networkName} (the "Producer"), on behalf of the member agencies listed in Schedule A. It supplements and does not replace the agency agreement between the parties.`,
      { align: "justify" }
    );

  heading("1. Definitions");
  clause(
    "1.1",
    `"Written Premium" means direct premium written by the Producer and its member agencies, net of cancellations and return premium.`
  );
  clause(
    "1.2",
    `"Earned Premium" means the portion of Written Premium earned during the Program Year, as recorded by the Company.`
  );
  clause(
    "1.3",
    `"Incurred Losses" means paid losses plus the change in case reserves, including allocated loss adjustment expense, as recorded by the Company.`
  );
  clause(
    "1.4",
    `"Loss Ratio" means Incurred Losses divided by Earned Premium, expressed as a percentage to two decimal places.`
  );

  heading("2. Term");
  clause(
    "2.1",
    `This agreement covers business written from January 1, ${year} through December 31, ${year} (the "Program Year").`
  );

  heading("3. Eligible Business");
  clause("3.1", "Business counts toward this agreement only when written under a producer code listed in Schedule A.");
  clause(
    "3.2",
    "Eligible lines of business are Personal Auto and Homeowners. Personal Umbrella, all commercial lines, and business placed through any residual market mechanism are excluded."
  );

  heading("4. Qualification");
  clause(
    "4.1",
    `No bonus is payable unless eligible Written Premium for the Program Year is at least ${dollars(content.minimumPremiumCents)}.`
  );
  clause("4.2", "Eligible Written Premium of all member agencies is combined for the purpose of qualification.");

  heading("5. Bonus Calculation");
  clause(
    "5.1",
    "The bonus equals eligible Written Premium for the Program Year multiplied by the bonus rate for the Producer's Loss Ratio, as set out below."
  );
  let lower = 0;
  for (const band of content.bands) {
    const range =
      lower === 0
        ? `${percent(band.upToLossRatioBps)} or less`
        : `Over ${percent(lower)} up to and including ${percent(band.upToLossRatioBps)}`;
    document
      .font("Helvetica")
      .fontSize(10)
      .text(`        Loss Ratio ${range}`, { continued: true })
      .text(`    ${percent(band.rateBps)}`, { align: "right" });
    lower = band.upToLossRatioBps;
  }
  document
    .text(`        Loss Ratio over ${percent(lower)}`, { continued: true })
    .text("    No bonus", { align: "right" });
  document.moveDown(0.4);
  clause("5.2", `Earned Premium and Incurred Losses are valued as of February 28, ${year + 1}.`);
  clause("5.3", `The bonus for the Program Year shall not exceed ${dollars(content.maximumBonusCents)}.`);

  heading("6. Payment");
  clause(
    "6.1",
    `The Company will pay any bonus due by March 31, ${year + 1}, with a statement showing its calculation.`
  );
  clause("6.2", "The Producer is responsible for any division of the bonus among its member agencies.");
  clause(
    "6.3",
    "No bonus is payable for the Program Year if the agency agreement between the parties is terminated before the payment date."
  );

  document.end();
  await finished;
  return Buffer.concat(chunks);
}

/** 50000000 as "$500,000". */
function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/** 5000 as "50.00%". */
function percent(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

import { describe, expect, it } from "vitest";
import { ScriptedModelClient } from "../model/scripted-model-client";
import { extractPdfStatement, readTranscript, type StatementTranscript } from "./pdf-extractor";
import type { PdfFormat } from "./source-format";

const format: PdfFormat = {
  id: "test-pdf",
  version: 1,
  carrierId: "harbor-pine",
  kind: "pdf",
  products: { AUTO: "auto", HOME: "home" },
  transactionTypes: { NEW: "new", REN: "renewal", CXL: "cancellation" },
  readingNotes: "Credits are printed with a trailing CR."
};

const transcript: StatementTranscript = {
  statementTotal: "111.66",
  lines: [
    {
      page: 1,
      policyNumber: "HP 3000001",
      insuredName: "Maria Lopez",
      productCode: "AUTO",
      transactionCode: "NEW",
      effectiveDate: "2026-09-03",
      premium: "1550.80",
      commission: "201.60"
    },
    {
      page: 2,
      policyNumber: "HP 3000002",
      insuredName: "James Carter",
      productCode: "HOME",
      transactionCode: "CXL",
      effectiveDate: "2026-08-29",
      premium: "-817.67",
      commission: "-89.94"
    }
  ]
};

const input = { fileName: "harbor-pine.pdf", period: "2026-09", format };

describe("readTranscript", () => {
  it("maps codes and parses values with the carrier's format", () => {
    const result = readTranscript(transcript, input);
    expect(result.status).toBe("extracted");
    if (result.status !== "extracted") return;

    expect(result.statement.statedTotalCents).toBe(11_166);
    expect(result.statement.lines[1]).toMatchObject({
      policyNumber: "HP 3000002",
      transactionType: "cancellation",
      premiumCents: -81_767,
      commissionCents: -8_994,
      source: { file: "harbor-pine.pdf", row: 2, page: 2 }
    });
  });

  it("reports codes the format does not know, with their page and line", () => {
    const unknown = { ...transcript, lines: [{ ...transcript.lines[0]!, productCode: "BOAT" }] };
    expect(readTranscript(unknown, input)).toEqual({
      status: "invalid_lines",
      problems: [{ location: "page 1, line 1", field: "product", message: 'Unknown product code "BOAT"' }]
    });
  });
});

describe("extractPdfStatement", () => {
  it("sends the PDF and the carrier's reading notes to the model", async () => {
    const model = new ScriptedModelClient(() => ({ output: transcript }));
    await extractPdfStatement({ ...input, data: Buffer.from("%PDF"), model });

    const [request] = model.requests;
    expect(request?.inputs).toEqual([{ type: "pdf", name: "harbor-pine.pdf", data: Buffer.from("%PDF") }]);
    expect(request?.instructions).toContain("Credits are printed with a trailing CR.");
  });

  it("reports the statement as unreadable when the model does not answer", async () => {
    const model = new ScriptedModelClient(() => ({ declined: "The model declined (unspecified)." }));
    const result = await extractPdfStatement({ ...input, data: Buffer.from("%PDF"), model });
    expect(result).toEqual({ status: "unreadable", reason: "The model declined (unspecified)." });
  });
});

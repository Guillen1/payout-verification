import { describe, expect, it } from "vitest";
import { ScriptedModelClient } from "../../../../libs/model-client/testing/scripted-model.client";
import { FormatProposalService, renderProposal } from "../../application/services/format-proposal.service";
import type { CsvFormat } from "../../domain/source-format";
import { DEFAULT_VOCABULARY } from "../../../reconciliation/domain/vocabulary";

const current: CsvFormat = {
  id: "test-csv",
  version: 1,
  carrierId: "bluestem",
  kind: "csv",
  headers: ["POLICY_NO", "NAMED_INSURED", "PRODUCT_CD", "TXN_CD", "EFF_DT", "PREMIUM", "COMM_AMT"],
  columns: {
    policyNumber: "POLICY_NO",
    insuredName: "NAMED_INSURED",
    product: "PRODUCT_CD",
    transactionType: "TXN_CD",
    effectiveDate: "EFF_DT",
    premium: "PREMIUM",
    commission: "COMM_AMT"
  },
  dateFormat: "MM/DD/YYYY",
  products: { PA: "auto" },
  transactionTypes: { NB: "new" },
  totalRow: { labelColumn: "POLICY_NO", label: "TOTAL", amountColumn: "COMM_AMT" }
};

const changedFile = [
  "POLICY_NO,NAMED_INSURED,PRODUCT_CD,TXN_CD,EFF_DT,PREMIUM,COMMISSION",
  `BS-1,"LOPEZ, MARIA",PA,NB,09/03/2026,"$1,000.00",$125.00`,
  `TOTAL,,,,,,$125.00`
].join("\n");

const answerWith = (commissionColumn: string) => ({
  output: {
    columns: { ...current.columns, commission: commissionColumn },
    totalRow: { ...current.totalRow, amountColumn: commissionColumn },
    explanation: `COMM_AMT was renamed ${commissionColumn}.`
  }
});

async function propose(model: ScriptedModelClient) {
  const { proposal } = await new FormatProposalService(model).propose({
    current,
    fileName: "bluestem.csv",
    content: changedFile,
    period: "2026-09",
    vocabulary: DEFAULT_VOCABULARY
  });
  return proposal;
}

describe("FormatProposalService", () => {
  it("verifies a proposal that reads the whole file and ties out", async () => {
    const proposal = await propose(new ScriptedModelClient(() => answerWith("COMMISSION")));
    expect(proposal).toMatchObject({
      status: "verified",
      lineCount: 1,
      format: {
        version: 2,
        headers: [...current.headers.slice(0, 6), "COMMISSION"],
        columns: { commission: "COMMISSION" }
      }
    });
  });

  it("rejects a proposal that names a column the file does not have", async () => {
    const proposal = await propose(new ScriptedModelClient(() => answerWith("COMM")));
    expect(proposal).toMatchObject({ status: "unverified", format: null });
  });

  it("rejects a proposal that reads the wrong column as commission", async () => {
    const premiumAsCommission = {
      output: {
        columns: { ...current.columns, commission: "PREMIUM" },
        totalRow: { ...current.totalRow, amountColumn: "COMMISSION" },
        explanation: "Guessed that PREMIUM holds the commission."
      }
    };
    const proposal = await propose(new ScriptedModelClient(() => premiumAsCommission));
    expect(proposal).toMatchObject({
      status: "unverified",
      reason: "The lines it reads do not add up to the statement total."
    });
  });

  it("reports when the model gives no proposal", async () => {
    const proposal = await propose(new ScriptedModelClient(() => ({ declined: "No answer." })));
    expect(proposal).toEqual({ status: "no_answer", reason: "No answer." });
  });

  it("marks a rendered proposal as not in use until approved", () => {
    const rendered = renderProposal({ format: current, explanation: "One change." }, true);
    expect(rendered).toMatch(/^# PROPOSED by a model\. Not in use until a person approves it\./);
    expect(rendered).toContain("id: test-csv");
  });
});

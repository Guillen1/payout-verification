import { describe, expect, it } from "vitest";
import { ScriptedModelClient } from "../../../../libs/model-client/testing/scripted-model.client";
import {
  agreementSha256,
  BonusTermsService,
  renderRulesProposal,
  toBonusRules,
  type AgreementTerms
} from "../../application/services/bonus-terms.service";
import { program } from "../support/bonus-builders";

const terms: AgreementTerms = {
  programYear: 2025,
  eligibleProducts: { products: ["auto", "home"], clause: "3.2" },
  minimumPremium: { amount: "500000.00", clause: "4.1" },
  lossRatioBands: {
    bands: [
      { lossRatioUpTo: "40.00%", bonusRate: "4.00%" },
      { lossRatioUpTo: "50.00%", bonusRate: "3.00%" }
    ],
    clause: "5.1"
  },
  maximumBonus: null,
  notes: ["Forfeited if the agency agreement ends before payment (6.3)."]
};
const agreement = Buffer.from("%PDF agreement");
const input = { program: program(), products: ["auto", "home", "umbrella"], agreement };

describe("toBonusRules", () => {
  it("turns the model's text into rules tied to the exact document", () => {
    const draft = toBonusRules(terms, input);
    expect(draft.status).toBe("drafted");
    if (draft.status !== "drafted") return;
    expect(draft.rules).toMatchObject({
      programId: "test-2025",
      agreementSha256: agreementSha256(agreement),
      minimumPremium: { cents: 50_000_000, clause: "4.1" },
      lossRatioBands: {
        bands: [
          { upToLossRatioBps: 4_000, rateBps: 400 },
          { upToLossRatioBps: 5_000, rateBps: 300 }
        ]
      },
      maximumBonus: null
    });
  });

  it("rejects an agreement for a different year", () => {
    expect(toBonusRules({ ...terms, programYear: 2024 }, input)).toMatchObject({
      status: "invalid",
      reason: "The agreement is for 2024, but the program is for 2025."
    });
  });

  it("rejects products the network does not have", () => {
    const draft = toBonusRules({ ...terms, eligibleProducts: { products: ["boat"], clause: "3.2" } }, input);
    expect(draft).toMatchObject({ status: "invalid", reason: "Unknown product names: boat." });
  });

  it("rejects bands out of order", () => {
    const bands = [...terms.lossRatioBands.bands].reverse();
    const draft = toBonusRules({ ...terms, lossRatioBands: { bands, clause: "5.1" } }, input);
    expect(draft).toMatchObject({ status: "invalid", reason: "Loss ratio bands must be in increasing order" });
  });

  it("rejects an amount it cannot read", () => {
    const draft = toBonusRules({ ...terms, minimumPremium: { amount: "half a million", clause: "4.1" } }, input);
    expect(draft).toMatchObject({ status: "invalid", reason: 'Not a money amount: "half a million"' });
  });
});

describe("BonusTermsService", () => {
  it("sends the agreement and the network's product names to the model", async () => {
    const model = new ScriptedModelClient(() => ({ output: terms }));
    const { draft } = await new BonusTermsService(model).draft({ ...input, fileName: "agreement.pdf" });

    expect(draft.status).toBe("drafted");
    expect(model.requests[0]?.inputs).toEqual([
      { type: "text", text: "The network's product names: auto, home, umbrella." },
      { type: "pdf", name: "agreement.pdf", data: agreement }
    ]);
  });
});

describe("renderRulesProposal", () => {
  it("puts the notes where a reviewer will read them", () => {
    const draft = toBonusRules(terms, input);
    if (draft.status !== "drafted") throw new Error("expected a draft");
    const text = renderRulesProposal(draft);
    expect(text).toContain("# PROPOSED by a model");
    expect(text).toContain("#   - Forfeited if the agency agreement ends before payment (6.3).");
  });
});

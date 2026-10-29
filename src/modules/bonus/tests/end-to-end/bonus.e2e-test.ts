import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { ModelAbstractClient } from "../../../../libs/model-client/contract/model.abstract-client";
import { ScriptedModelClient } from "../../../../libs/model-client/testing/scripted-model.client";
import { generateBonusDemo, type BonusDemo } from "../../../demo/synthetic/bonus-scenario";
import { loadTenant } from "../../../reconciliation/infrastructure/tenant-files";
import { renderBonusDispute } from "../../application/reports/bonus-report";
import { BonusVerificationService } from "../../application/services/bonus-verification.service";
import { BonusModule } from "../../bonus.module";
import type { BonusRules } from "../../domain/bonus-rules";
import { loadBonusProgram, parseProduction } from "../../infrastructure/bonus-files";

/*
 * Verifies a whole program year through the real Nest module, with only the model swapped for a
 * stand-in that reads the agreement perfectly, and checks the result against the answer key.
 */

const TENANT = "tenants/agency-network";
const names = { network: "Network", carrier: "Northwind Mutual", agency: (agencyId: string) => agencyId };

async function verify(demo: BonusDemo, approvedRules: BonusRules | null, model?: ModelAbstractClient) {
  const app = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), BonusModule]
  })
    .overrideProvider(ModelAbstractClient)
    .useValue(model ?? new ScriptedModelClient(() => ({ output: demo.labels.terms })))
    .compile();

  const { program } = await loadBonusProgram(TENANT, "northwind-2025");
  const production = parseProduction(demo.production, "production.csv");
  return app.get(BonusVerificationService).verify({
    program,
    approvedRules,
    products: ["auto", "home", "umbrella"],
    agreement: { fileName: "agreement.pdf", data: demo.agreement },
    statementCsv: demo.statement,
    production
  });
}

describe.each([42, 7, 2026])("bonus verification, seed %i", seed => {
  async function demo() {
    const tenant = await loadTenant(TENANT);
    const { program } = await loadBonusProgram(TENANT, "northwind-2025");
    return generateBonusDemo({ tenant, program, carrierName: "Northwind Mutual", seed });
  }

  it("drafts the rules from the agreement and stops there until they are approved", async () => {
    const data = await demo();
    const result = await verify(data, null);

    expect(result.outcome.status).toBe("awaiting_approval");
    if (result.outcome.status !== "awaiting_approval") return;
    expect(result.outcome.draft).toMatchObject({ status: "drafted", rules: data.labels.rules });
  });

  it("finds the planted errors and the exact underpayment once the rules are approved", async () => {
    const data = await demo();
    const model = new ScriptedModelClient(() => ({ declined: "not expected" }));
    const result = await verify(data, data.labels.rules, model);

    expect(model.requests).toHaveLength(0);
    expect(result.outcome.status).toBe("checked");
    if (result.outcome.status !== "checked") return;
    const { check, allocation } = result.outcome;
    expect(check.expected.bonusCents).toBe(data.labels.expectedBonusCents);
    expect(check.paidCents).toBe(data.labels.paidCents);
    expect(check.disposition).toBe("dispute");
    expect(check.findings.map(finding => finding.kind).sort()).toEqual(data.labels.findings);

    const shared = allocation.networkCents + allocation.agencies.reduce((sum, share) => sum + share.agencyCents, 0);
    expect(shared).toBe(check.paidCents);

    const letter = renderBonusDispute(result, names);
    expect(letter).toContain(
      `$${((data.labels.expectedBonusCents - data.labels.paidCents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} is still owed`
    );
  });

  it("asks for a new approval when the agreement document changes", async () => {
    const data = await demo();
    const stale = { ...data.labels.rules, agreementSha256: "f".repeat(64) };
    const result = await verify(data, stale);

    expect(result.outcome).toMatchObject({
      status: "awaiting_approval",
      reason: "The agreement document changed since its rules were approved."
    });
  });
});

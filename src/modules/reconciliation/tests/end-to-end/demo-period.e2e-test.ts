import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { beforeAll, describe, expect, it } from "vitest";
import { generateDemoData, type DemoData } from "../../../demo/synthetic/generate-demo";
import { ReconcilePeriodService, type PeriodResult } from "../../application/services/reconcile-period.service";
import { ReconciliationModule } from "../../reconciliation.module";
import { ModelAbstractClient } from "../../../../libs/model-client/contract/model.abstract-client";
import { ScriptedModelClient } from "../../../../libs/model-client/testing/scripted-model.client";
import { loadTenant, type Tenant } from "../../infrastructure/tenant-files";
import { answerKeyModel } from "../../../demo/testing/answer-key-model";

/*
 * Runs the whole period from files on disk, as the CLI does, and checks every line against the
 * answer key the generator wrote alongside the data.
 */

const PERIOD = "2026-09";

type Transform = (carrierId: string, content: string | Buffer) => string | Buffer;

async function writeInbox(demo: DemoData, transform: Transform = (_, content) => content) {
  const inbox = await mkdtemp(join(tmpdir(), "payout-verification-"));
  await mkdir(join(inbox, PERIOD));
  for (const statement of demo.statements) {
    await writeFile(join(inbox, PERIOD, statement.fileName), transform(statement.carrierId, statement.content));
  }
  return inbox;
}

/** The real Nest module, with only the model swapped for a stand-in. */
async function runPeriod(demo: DemoData, tenant: Tenant, model: ModelAbstractClient, transform?: Transform) {
  const app = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), ReconciliationModule]
  })
    .overrideProvider(ModelAbstractClient)
    .useValue(model)
    .compile();

  return app.get(ReconcilePeriodService).reconcile({
    tenant,
    policies: demo.policies,
    inboxDirectory: await writeInbox(demo, transform),
    period: PERIOD
  });
}

/*
 * The second tenant is a beauty brand group checking retailer remittances. It runs on the same
 * code with only its own tenant directory, which is the claim these cases hold the code to.
 */
const TENANTS = ["agency-network", "brand-group"];
const CASES = TENANTS.flatMap(tenantId => [42, 7, 2026].map(seed => ({ tenantId, seed })));

describe.each(CASES)("demo period for $tenantId with seed $seed", ({ tenantId, seed }) => {
  let tenant: Tenant;
  let demo: DemoData;
  let result: PeriodResult;

  beforeAll(async () => {
    tenant = await loadTenant(`tenants/${tenantId}`);
    demo = await generateDemoData({ tenant, period: PERIOD, seed });
    result = await runPeriod(demo, tenant, answerKeyModel(demo.labels));
  });

  it("processes every statement, including the PDF", () => {
    expect(result.carriers.map(outcome => [outcome.carrier.id, outcome.status])).toEqual(
      tenant.carriers.map(carrier => [carrier.id, "processed"])
    );
  });

  it("explains every line in the tenant's own words", () => {
    const explanations = result.carriers.flatMap(outcome =>
      outcome.status === "processed" && outcome.reconciliation.status === "reconciled"
        ? outcome.reconciliation.lines.map(line => line.explanation)
        : []
    );
    const otherTenantsWords = tenant.vocabulary.item === "policy" ? /invoice|retailer/i : /policy|premium|carrier/i;
    expect(explanations.filter(text => otherTenantsWords.test(text))).toEqual([]);
  });

  it("reaches the expected finding and policy on every line", () => {
    for (const outcome of result.carriers) {
      if (outcome.status !== "processed" || outcome.reconciliation.status !== "reconciled") continue;

      const actual = outcome.reconciliation.lines.map(line => ({
        row: line.line.source.row,
        finding: line.finding,
        policyNumber: line.finding === "duplicate" ? null : (line.policy?.policyNumber ?? null)
      }));
      expect(actual).toEqual(demo.labels.carriers[outcome.carrier.id]?.lines);
    }
  });

  it("finds exactly the policies the carriers never paid", () => {
    for (const outcome of result.carriers) {
      if (outcome.status !== "processed" || outcome.reconciliation.status !== "reconciled") continue;
      const missing = outcome.reconciliation.missing.map(item => item.policy.policyNumber);
      expect(missing).toEqual(demo.labels.carriers[outcome.carrier.id]?.missingPolicyNumbers);
    }
  });

  it("says what each policy never paid was due, from the agreed rate on its date", () => {
    for (const outcome of result.carriers) {
      if (outcome.status !== "processed" || outcome.reconciliation.status !== "reconciled") continue;
      for (const { policy, rateBps, expectedCents } of outcome.reconciliation.missing) {
        expect(rateBps).not.toBeNull();
        expect(expectedCents).toBe(Math.round((policy.premiumCents * rateBps!) / 10_000));
      }
    }
  });

  it("accounts for every cent each carrier paid", () => {
    for (const outcome of result.carriers) {
      if (outcome.status !== "processed" || outcome.reconciliation.status !== "reconciled") continue;
      const { paidCents, toAgenciesCents, toNetworkCents, heldCents } = outcome.reconciliation.totals;
      expect(toAgenciesCents + toNetworkCents + heldCents).toBe(paidCents);
    }
  });
});

describe("when something goes wrong with one carrier, the others still close", () => {
  let tenant: Tenant;
  let demo: DemoData;

  beforeAll(async () => {
    tenant = await loadTenant("tenants/agency-network");
    demo = await generateDemoData({ tenant, period: PERIOD, seed: 42 });
  });

  const statusOf = (result: PeriodResult) =>
    Object.fromEntries(result.carriers.map(outcome => [outcome.carrier.id, outcome]));

  it("holds a changed layout and attaches a verified proposal for the new one", async () => {
    const renameColumn: Transform = (carrierId, content) =>
      carrierId === "bluestem" ? content.toString().replace("COMM_AMT", "COMMISSION_AMOUNT") : content;
    const model = answerKeyModel(demo.labels, {
      "bluestem-csv": {
        columns: {
          policyNumber: "POLICY_NO",
          insuredName: "NAMED_INSURED",
          product: "PRODUCT_CD",
          transactionType: "TXN_CD",
          effectiveDate: "EFF_DT",
          premium: "PREMIUM",
          commission: "COMMISSION_AMOUNT"
        },
        totalRow: { labelColumn: "POLICY_NO", label: "TOTAL", amountColumn: "COMMISSION_AMOUNT" },
        explanation: "COMM_AMT was renamed COMMISSION_AMOUNT."
      }
    });

    const status = statusOf(await runPeriod(demo, tenant, model, renameColumn));

    expect(status.northwind?.status).toBe("processed");
    expect(status["harbor-pine"]?.status).toBe("processed");
    expect(status.bluestem).toMatchObject({
      status: "format_drift",
      headerCheck: { missing: ["COMM_AMT"], unexpected: ["COMMISSION_AMOUNT"] },
      proposal: { status: "verified", format: { version: 2, columns: { commission: "COMMISSION_AMOUNT" } } }
    });
  });

  it("does not read a carrier a person paused, and closes the others", async () => {
    const paused = {
      ...tenant,
      carriers: tenant.carriers.map(carrier =>
        carrier.id === "harbor-pine" ? { ...carrier, paused: "Disputed statements under review" } : carrier
      )
    };
    const model = answerKeyModel(demo.labels);
    const result = await runPeriod(demo, paused, model);
    const status = statusOf(result);

    expect(status["harbor-pine"]).toMatchObject({ status: "paused", reason: "Disputed statements under review" });
    expect(status.northwind?.status).toBe("processed");
    expect(status.bluestem?.status).toBe("processed");
    expect(result.modelCalls).toEqual([]);
  });

  it("reports a carrier that sent nothing", async () => {
    const onlyTwo = { ...demo, statements: demo.statements.filter(s => s.carrierId !== "bluestem") };
    const status = statusOf(await runPeriod(onlyTwo, tenant, answerKeyModel(demo.labels)));
    expect(status.bluestem?.status).toBe("statement_missing");
    expect(status.northwind?.status).toBe("processed");
  });

  it("reports a malformed CSV as unreadable, not as a model outage", async () => {
    const breakQuote: Transform = (carrierId, content) =>
      carrierId === "bluestem" ? `${content.toString()}"BS-9,unclosed quote\n` : content;
    const status = statusOf(await runPeriod(demo, tenant, answerKeyModel(demo.labels), breakQuote));

    expect(status.bluestem).toMatchObject({ status: "unreadable" });
    expect(status.northwind?.status).toBe("processed");
  });

  it("holds the PDF carrier when the model is unavailable", async () => {
    const unavailable = new ScriptedModelClient(() => {
      throw new Error("Model service is down");
    });
    const status = statusOf(await runPeriod(demo, tenant, unavailable));
    expect(status["harbor-pine"]?.status).toBe("model_unavailable");
    expect(status.northwind?.status).toBe("processed");
    expect(status.bluestem?.status).toBe("processed");
  });

  it("holds the PDF statement when a misread amount breaks the tie-out", async () => {
    const transcript = demo.labels.carriers["harbor-pine"]!.transcript!;
    const [first, ...rest] = transcript.lines;
    const misread = { ...transcript, lines: [{ ...first!, commission: "999.99" }, ...rest] };
    const labels = {
      ...demo.labels,
      carriers: {
        ...demo.labels.carriers,
        "harbor-pine": { ...demo.labels.carriers["harbor-pine"]!, transcript: misread }
      }
    };

    const status = statusOf(await runPeriod(demo, tenant, answerKeyModel(labels)));
    expect(status["harbor-pine"]).toMatchObject({
      status: "processed",
      reconciliation: { status: "held", reason: "does_not_tie_out" }
    });
  });
});

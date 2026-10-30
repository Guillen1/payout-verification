import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ModelAbstractClient } from "../../../../libs/model-client/contract/model.abstract-client";
import { BonusModule } from "../../../bonus/bonus.module";
import { loadBonusProgram } from "../../../bonus/infrastructure/bonus-files";
import { generateBonusDemo, type BonusDemo } from "../../../demo/synthetic/bonus-scenario";
import { generateDemoData } from "../../../demo/synthetic/generate-demo";
import { answerKeyModel } from "../../../demo/testing/answer-key-model";
import { EvalsModule } from "../../../evals/evals.module";
import { ReconciliationModule } from "../../../reconciliation/reconciliation.module";
import { renderPolicyBook } from "../../../reconciliation/infrastructure/policy-book-file";
import { loadTenant } from "../../../reconciliation/infrastructure/tenant-files";
import type { BonusView } from "../../../bonus/application/views/bonus-view";
import type { PeriodView } from "../../../reconciliation/application/views/period-view";
import type { HealthView } from "../../../evals/application/health.service";
import type { PendingApproval } from "../../application/approvals.service";
import { ApprovalsModule } from "../../approvals.module";

/*
 * The admin API end to end, as a reviewer would use it: run a period in which one carrier changed
 * its layout and a bonus agreement has no approved rules yet, approve both proposals, run again, and
 * check that both now go through. Real modules and files; only the model is a stand-in.
 */

const PERIOD = "2026-09";
const PROGRAM = "northwind-2025";

const bluestemMapping = {
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
};

describe("admin API: run, approve, run again", () => {
  let app: INestApplication;
  let root: string;
  let bonus: BonusDemo;
  const api = () => request(app.getHttpServer() as Parameters<typeof request>[0]);

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "admin-"));
    const paths = { TENANT_DIR: join(root, "tenant"), DATA_DIR: join(root, "data"), OUT_DIR: join(root, "out") };

    await cp("tenants/agency-network", paths.TENANT_DIR, { recursive: true });
    await rm(join(paths.TENANT_DIR, "bonus", PROGRAM, "rules.yaml"));

    const tenant = await loadTenant(paths.TENANT_DIR);
    const demo = await generateDemoData({ tenant, period: PERIOD, seed: 42 });
    const { program } = await loadBonusProgram(paths.TENANT_DIR, PROGRAM);
    bonus = await generateBonusDemo({ tenant, program, carrierName: "Northwind Mutual", seed: 42 });

    await mkdir(join(paths.DATA_DIR, "book"), { recursive: true });
    await mkdir(join(paths.DATA_DIR, "inbox", PERIOD), { recursive: true });
    await mkdir(join(paths.DATA_DIR, "bonus", PROGRAM), { recursive: true });
    await writeFile(join(paths.DATA_DIR, "book", "policies.csv"), renderPolicyBook(demo.policies));
    for (const statement of demo.statements) {
      const content =
        statement.carrierId === "bluestem"
          ? statement.content.toString().replace("COMM_AMT", "COMMISSION_AMOUNT")
          : statement.content;
      await writeFile(join(paths.DATA_DIR, "inbox", PERIOD, statement.fileName), content);
    }
    await writeFile(join(paths.DATA_DIR, "bonus", PROGRAM, "agreement.pdf"), bonus.agreement);
    await writeFile(join(paths.DATA_DIR, "bonus", PROGRAM, "statement.csv"), bonus.statement);
    await writeFile(join(paths.DATA_DIR, "bonus", PROGRAM, "production.csv"), bonus.production);

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => paths] }),
        ReconciliationModule,
        BonusModule,
        ApprovalsModule,
        EvalsModule
      ]
    })
      .overrideProvider(ModelAbstractClient)
      .useValue(answerKeyModel(demo.labels, { "bluestem-csv": bluestemMapping }, bonus.labels.terms))
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
  });

  afterAll(() => app.close());

  it("reports a period that has not been run yet", async () => {
    await api().get(`/api/periods/${PERIOD}`).expect(404);
  });

  it("runs the period, holding only the carrier whose layout changed", async () => {
    const view = body<PeriodView>(await api().post(`/api/periods/${PERIOD}/runs`).expect(201));
    const states = Object.fromEntries(view.carriers.map(carrier => [carrier.id, carrier.state]));
    expect(states).toEqual({ "northwind": "processed", "bluestem": "held", "harbor-pine": "processed" });
  });

  it("runs the bonus check, which waits for its rules to be approved", async () => {
    const view = body<BonusView>(await api().post(`/api/bonus/${PROGRAM}/runs`).expect(201));
    expect(view).toMatchObject({ status: "awaiting_approval", draft: { rules: bonus.labels.rules } });
  });

  it("lists both model proposals for approval", async () => {
    const pending = body<PendingApproval[]>(await api().get("/api/approvals").expect(200));
    expect(pending).toEqual([
      expect.objectContaining({ id: `layout:${PERIOD}:bluestem`, verified: true }),
      expect.objectContaining({ id: `bonus:${PROGRAM}` })
    ]);
  });

  it("refuses an approval without a name", async () => {
    await api()
      .post(`/api/approvals/${encodeURIComponent(`bonus:${PROGRAM}`)}`)
      .send({})
      .expect(400);
  });

  it("applies each approval to the config and logs who approved it", async () => {
    for (const id of [`layout:${PERIOD}:bluestem`, `bonus:${PROGRAM}`]) {
      await api()
        .post(`/api/approvals/${encodeURIComponent(id)}`)
        .send({ approvedBy: "Test Reviewer" })
        .expect(201);
    }

    const log = (await readFile(join(root, "tenant", "approvals.jsonl"), "utf8")).trim().split("\n");
    expect(log.map(line => JSON.parse(line) as { approvedBy: string })).toEqual([
      expect.objectContaining({ approvedBy: "Test Reviewer", kind: "layout" }),
      expect.objectContaining({ approvedBy: "Test Reviewer", kind: "bonus_rules" })
    ]);
    expect(body<PendingApproval[]>(await api().get("/api/approvals"))).toEqual([]);
  });

  it("processes both once run again, with the planted bonus underpayment found", async () => {
    const period = body<PeriodView>(await api().post(`/api/periods/${PERIOD}/runs`).expect(201));
    expect(period.carriers.every(carrier => carrier.state === "processed")).toBe(true);

    const program = body<BonusView>(await api().post(`/api/bonus/${PROGRAM}/runs`).expect(201));
    expect(program.check).toMatchObject({
      disposition: "dispute",
      paidCents: bonus.labels.paidCents,
      expectedCents: bonus.labels.expectedBonusCents
    });
  });

  it("serves the draft dispute letters, and nothing outside the configured names", async () => {
    const letter = body<{ markdown: string }>(await api().get(`/api/periods/${PERIOD}/disputes/northwind`).expect(200));
    expect(letter.markdown).toContain("is still owed");
    await api().get(`/api/periods/${PERIOD}/disputes/..%2F..%2Fetc`).expect(404);
    await api().get("/api/bonus/..%2Fsecrets").expect(404);
    await api().get("/api/periods/not-a-period").expect(400);
  });

  it("reports health from the latest run", async () => {
    const health = body<HealthView>(await api().get("/api/health").expect(200));
    expect(health).toMatchObject({ latestPeriod: PERIOD, held: [] });
  });
});

function body<T>(response: { body: unknown }): T {
  return response.body as T;
}

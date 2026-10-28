import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { generateDemoData, type DemoData } from "../synthetic/generate-demo";
import { reconcilePeriod, type PeriodResult } from "../src/application/reconcile-period";
import { loadTenant, type Tenant } from "../src/tenant/tenant";

/*
 * Runs the whole period from files on disk, exactly as the CLI does, and checks every line
 * against the answer key the generator wrote alongside the data.
 */

const PERIOD = "2026-09";

async function writeInbox(demo: DemoData, transform: (carrierId: string, content: string) => string = (_, c) => c) {
  const inbox = await mkdtemp(join(tmpdir(), "payout-verification-"));
  await mkdir(join(inbox, PERIOD));
  for (const statement of demo.statements) {
    await writeFile(join(inbox, PERIOD, statement.fileName), transform(statement.carrierId, statement.content));
  }
  return inbox;
}

describe.each([42, 7, 2026])("demo period with seed %i", seed => {
  let tenant: Tenant;
  let demo: DemoData;
  let result: PeriodResult;

  beforeAll(async () => {
    tenant = await loadTenant("tenants/agency-network");
    demo = generateDemoData({ tenant, period: PERIOD, seed });
    result = await reconcilePeriod({
      tenant,
      policies: demo.policies,
      inboxDirectory: await writeInbox(demo),
      period: PERIOD
    });
  });

  it("reaches the expected finding and policy on every line", () => {
    for (const outcome of result.carriers) {
      expect(outcome.status).toBe("processed");
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

  it("accounts for every cent each carrier paid", () => {
    for (const outcome of result.carriers) {
      if (outcome.status !== "processed" || outcome.reconciliation.status !== "reconciled") continue;
      const { paidCents, toAgenciesCents, toNetworkCents, heldCents } = outcome.reconciliation.totals;
      expect(toAgenciesCents + toNetworkCents + heldCents).toBe(paidCents);
    }
  });
});

describe("when a carrier changes its layout", () => {
  it("holds that carrier's statement and still closes the others", async () => {
    const tenant = await loadTenant("tenants/agency-network");
    const demo = generateDemoData({ tenant, period: PERIOD, seed: 42 });
    const renameColumn = (carrierId: string, content: string) =>
      carrierId === "bluestem" ? content.replace("COMM_AMT", "COMMISSION_AMOUNT") : content;

    const result = await reconcilePeriod({
      tenant,
      policies: demo.policies,
      inboxDirectory: await writeInbox(demo, renameColumn),
      period: PERIOD
    });

    const status = Object.fromEntries(result.carriers.map(outcome => [outcome.carrier.id, outcome]));
    expect(status.northwind?.status).toBe("processed");
    expect(status.bluestem).toMatchObject({
      status: "format_drift",
      headerCheck: { missing: ["COMM_AMT"], unexpected: ["COMMISSION_AMOUNT"] }
    });
  });

  it("reports a carrier that sent nothing", async () => {
    const tenant = await loadTenant("tenants/agency-network");
    const demo = generateDemoData({ tenant, period: PERIOD, seed: 42 });
    const onlyNorthwind = { ...demo, statements: demo.statements.filter(s => s.carrierId === "northwind") };

    const result = await reconcilePeriod({
      tenant,
      policies: demo.policies,
      inboxDirectory: await writeInbox(onlyNorthwind),
      period: PERIOD
    });

    expect(result.carriers.find(outcome => outcome.carrier.id === "bluestem")?.status).toBe("statement_missing");
  });
});

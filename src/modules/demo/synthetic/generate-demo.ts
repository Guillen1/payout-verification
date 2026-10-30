import type { Period } from "../../reconciliation/domain/dates";
import type { Policy } from "../../reconciliation/domain/types";
import type { StatementTranscript } from "../../extraction/application/services/pdf-statement-reader.service";
import type { Tenant } from "../../reconciliation/infrastructure/tenant-files";
import type { PeriodLabels, PlannedLine } from "./planned-line";
import { renderCoastalStatement, renderHarborPineStatement } from "./pdf-renderer";
import { createPolicyMaker, INVOICE_PROFILE, POLICY_PROFILE, type RecordProfile } from "./policies";
import {
  renderBluestemStatement,
  renderBrightlineStatement,
  renderMapleMainStatement,
  renderNorthwindStatement
} from "./renderers";
import { brightlineScenario, coastalScenario, mapleMainScenario } from "./retail-scenarios";
import { bluestemScenario, harborPineScenario, northwindScenario, type CarrierScenario } from "./scenarios";

export interface DemoStatement {
  carrierId: string;
  fileName: string;
  content: string | Buffer;
}

export interface DemoData {
  policies: Policy[];
  statements: DemoStatement[];
  labels: PeriodLabels;
}

interface RenderedStatement {
  extension: "csv" | "pdf";
  content: string | Buffer;
  transcript?: StatementTranscript;
}

type Render = (
  lines: readonly PlannedLine[],
  context: { period: string; networkName: string }
) => Promise<RenderedStatement>;

const csv =
  (render: (lines: readonly PlannedLine[]) => string): Render =>
  lines =>
    Promise.resolve({ extension: "csv", content: render(lines) });

const pdf =
  (render: typeof renderHarborPineStatement): Render =>
  async (lines, context) => {
    const { pdf: content, transcript } = await render(lines, context);
    return { extension: "pdf", content, transcript };
  };

/** Each demo tenant: what its records look like, and how each of its counterparties behaves and prints. */
const DEMO_TENANTS: Record<
  string,
  { profile: RecordProfile; carriers: Record<string, { scenario: typeof northwindScenario; render: Render }> }
> = {
  "agency-network": {
    profile: POLICY_PROFILE,
    carriers: {
      "northwind": { scenario: northwindScenario, render: csv(renderNorthwindStatement) },
      "bluestem": { scenario: bluestemScenario, render: csv(renderBluestemStatement) },
      "harbor-pine": { scenario: harborPineScenario, render: pdf(renderHarborPineStatement) }
    }
  },
  "brand-group": {
    profile: INVOICE_PROFILE,
    carriers: {
      "brightline": { scenario: brightlineScenario, render: csv(renderBrightlineStatement) },
      "maple-main": { scenario: mapleMainScenario, render: csv(renderMapleMainStatement) },
      "coastal": { scenario: coastalScenario, render: pdf(renderCoastalStatement) }
    }
  }
};

/**
 * Builds one period of demo data for a tenant: the book of record, each counterparty's statement file,
 * and the answer key. The same seed always produces the same data, byte for byte.
 */
export async function generateDemoData(input: { tenant: Tenant; period: Period; seed: number }): Promise<DemoData> {
  const demoTenant = DEMO_TENANTS[input.tenant.id];
  if (!demoTenant) throw new Error(`No demo data for tenant "${input.tenant.id}"`);
  const makePolicy = createPolicyMaker(
    input.seed,
    input.tenant.agencies.map(agency => agency.agencyId),
    demoTenant.profile
  );

  const policies: Policy[] = [];
  const statements: DemoStatement[] = [];
  const labels: PeriodLabels = { period: input.period, carriers: {} };

  for (const carrier of input.tenant.carriers) {
    const generator = demoTenant.carriers[carrier.id];
    if (!generator) throw new Error(`No demo scenario for carrier "${carrier.id}"`);

    const scenario: CarrierScenario = generator.scenario({
      makePolicy,
      rates: input.tenant.rateRules,
      period: input.period
    });
    const rendered = await generator.render(scenario.lines, { period: input.period, networkName: input.tenant.name });
    const fileName = `${carrier.id}.${rendered.extension}`;
    const firstRow = rendered.extension === "csv" ? 2 : 1; // CSV rows count the header; PDF lines count from 1

    policies.push(...scenario.book);
    statements.push({ carrierId: carrier.id, fileName, content: rendered.content });
    labels.carriers[carrier.id] = {
      file: fileName,
      lines: scenario.lines.map((line, index) => ({ row: index + firstRow, ...line.expected })),
      missingPolicyNumbers: scenario.missingPolicyNumbers,
      ...(rendered.transcript ? { transcript: rendered.transcript } : {})
    };
  }

  return { policies: policies.sort((a, b) => a.policyNumber.localeCompare(b.policyNumber)), statements, labels };
}

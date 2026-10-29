import type { Period } from "../../reconciliation/domain/dates";
import type { Policy } from "../../reconciliation/domain/types";
import type { StatementTranscript } from "../../extraction/application/services/pdf-statement-reader.service";
import type { Tenant } from "../../reconciliation/infrastructure/tenant-files";
import type { PeriodLabels, PlannedLine } from "./planned-line";
import { renderHarborPineStatement } from "./pdf-renderer";
import { createPolicyMaker } from "./policies";
import { renderBluestemStatement, renderNorthwindStatement } from "./renderers";
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

const CARRIERS: Record<string, { scenario: typeof northwindScenario; render: Render }> = {
  "northwind": {
    scenario: northwindScenario,
    render: lines => Promise.resolve({ extension: "csv", content: renderNorthwindStatement(lines) })
  },
  "bluestem": {
    scenario: bluestemScenario,
    render: lines => Promise.resolve({ extension: "csv", content: renderBluestemStatement(lines) })
  },
  "harbor-pine": {
    scenario: harborPineScenario,
    render: async (lines, context) => {
      const { pdf, transcript } = await renderHarborPineStatement(lines, context);
      return { extension: "pdf", content: pdf, transcript };
    }
  }
};

/**
 * Builds one period of demo data for a tenant: the policy book, each carrier's statement file,
 * and the answer key. The same seed always produces the same data, byte for byte.
 */
export async function generateDemoData(input: { tenant: Tenant; period: Period; seed: number }): Promise<DemoData> {
  const makePolicy = createPolicyMaker(
    input.seed,
    input.tenant.agencies.map(agency => agency.agencyId)
  );

  const policies: Policy[] = [];
  const statements: DemoStatement[] = [];
  const labels: PeriodLabels = { period: input.period, carriers: {} };

  for (const carrier of input.tenant.carriers) {
    const generator = CARRIERS[carrier.id];
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

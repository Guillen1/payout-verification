import type { Period } from "../src/domain/dates";
import type { Policy } from "../src/domain/types";
import type { Tenant } from "../src/tenant/tenant";
import { NamePool } from "./people";
import type { PeriodLabels, PlannedLine } from "./planned-line";
import { PolicyFactory } from "./policy-factory";
import { SeededRandom } from "./random";
import { renderBluestemStatement, renderNorthwindStatement } from "./renderers";
import { bluestemScenario, northwindScenario, type CarrierScenario } from "./scenarios";

export interface DemoData {
  policies: Policy[];
  statements: { carrierId: string; fileName: string; content: string }[];
  labels: PeriodLabels;
}

const CARRIERS: Record<
  string,
  { scenario: typeof northwindScenario; render: (lines: readonly PlannedLine[]) => string }
> = {
  northwind: { scenario: northwindScenario, render: renderNorthwindStatement },
  bluestem: { scenario: bluestemScenario, render: renderBluestemStatement }
};

/**
 * Builds one period of demo data for a tenant: the policy book, each carrier's statement file,
 * and the answer key. The same seed always produces the same data.
 */
export function generateDemoData(input: { tenant: Tenant; period: Period; seed: number }): DemoData {
  const random = new SeededRandom(input.seed);
  const factory = new PolicyFactory({
    random,
    names: new NamePool(random),
    agencyIds: input.tenant.agencies.map(agency => agency.agencyId)
  });

  const policies: Policy[] = [];
  const statements: DemoData["statements"] = [];
  const labels: PeriodLabels = { period: input.period, carriers: {} };

  for (const carrier of input.tenant.carriers) {
    const generator = CARRIERS[carrier.id];
    if (!generator) throw new Error(`No demo scenario for carrier "${carrier.id}"`);

    const scenario: CarrierScenario = generator.scenario({
      factory,
      rates: input.tenant.rateRules,
      period: input.period
    });
    const fileName = `${carrier.id}.csv`;

    policies.push(...scenario.book);
    statements.push({ carrierId: carrier.id, fileName, content: generator.render(scenario.lines) });
    labels.carriers[carrier.id] = {
      file: fileName,
      lines: scenario.lines.map((line, index) => ({ row: index + 2, ...line.expected })),
      missingPolicyNumbers: scenario.missingPolicyNumbers
    };
  }

  return { policies: policies.sort((a, b) => a.policyNumber.localeCompare(b.policyNumber)), statements, labels };
}

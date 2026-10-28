import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { generateDemoData } from "../../synthetic/generate-demo";
import { isPeriod } from "../domain/dates";
import { renderPolicyBook } from "../tenant/policy-book";
import { loadTenant } from "../tenant/tenant";

const { values } = parseArgs({
  options: {
    tenant: { type: "string", default: "tenants/agency-network" },
    data: { type: "string", default: "data/demo" },
    period: { type: "string", default: "2026-09" },
    seed: { type: "string", default: "42" }
  }
});

if (!isPeriod(values.period)) throw new Error(`--period must look like 2026-09, got "${values.period}"`);

const tenant = await loadTenant(values.tenant);
const demo = generateDemoData({ tenant, period: values.period, seed: Number(values.seed) });

const write = async (path: string, content: string) => {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
  console.log(`  wrote ${path}`);
};

console.log(`Seeding ${tenant.name} for ${values.period} (seed ${values.seed})`);
await write(join(values.data, "book", "policies.csv"), renderPolicyBook(demo.policies));
for (const statement of demo.statements) {
  await write(join(values.data, "inbox", values.period, statement.fileName), statement.content);
}
await write(join(values.data, "labels", `${values.period}.json`), `${JSON.stringify(demo.labels, null, 2)}\n`);

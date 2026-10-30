import { join } from "node:path";
import { NotFoundException, Scope, type Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { REQUEST } from "@nestjs/core";

/** Where the admin reads config and data and writes results. The commands take the same paths as options. */
export class AppPaths {
  tenant!: string;
  data!: string;
  out!: string;
  /** The model's eval results. They measure the model, not a tenant, so tenants can share them. */
  evals!: string;
}

/** What a run reads and writes; the commands pass these as options. */
export type RunPaths = Pick<AppPaths, "tenant" | "data" | "out">;

/** The header the admin sends to say which tenant a request is for. */
export const TENANT_HEADER = "x-tenant";

/** The demo's tenants and where each keeps its data and results. */
const DEMO_TENANTS: Record<string, RunPaths> = {
  "agency-network": { tenant: "tenants/agency-network", data: "data/demo", out: "out" },
  "brand-group": { tenant: "tenants/brand-group", data: "data/brand-group", out: "out/brand-group" }
};

/**
 * The tenants the admin can show, by id. Setting TENANT_DIR serves that one tenant only, as the
 * tests do; otherwise the admin serves every demo tenant and the page picks one per request.
 */
export function tenantChoices(config: ConfigService): Record<string, AppPaths> {
  const evals = config.get<string>("EVALS_DIR") || join("out", "evals");
  const configured = config.get<string>("TENANT_DIR");
  if (configured) {
    const out = config.get<string>("OUT_DIR") || "out";
    return {
      default: {
        tenant: configured,
        data: config.get<string>("DATA_DIR") || "data/demo",
        out,
        evals: config.get<string>("EVALS_DIR") || join(out, "evals")
      }
    };
  }
  return Object.fromEntries(Object.entries(DEMO_TENANTS).map(([id, paths]) => [id, { ...paths, evals }]));
}

/** The paths for the tenant a request asks for; the first tenant when it names none or only one is served. */
export const appPathsProvider: Provider = {
  provide: AppPaths,
  scope: Scope.REQUEST,
  inject: [ConfigService, REQUEST],
  useFactory: (config: ConfigService, request: { headers?: Record<string, unknown> } | undefined): AppPaths => {
    const choices = Object.entries(tenantChoices(config));
    const asked = request?.headers?.[TENANT_HEADER];
    const paths =
      choices.length === 1 || typeof asked !== "string" ? choices[0]?.[1] : choices.find(([id]) => id === asked)?.[1];
    if (!paths) throw new NotFoundException(`No tenant "${String(asked)}"`);
    return Object.assign(new AppPaths(), paths);
  }
};

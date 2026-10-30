import { join } from "node:path";
import type { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

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

export const appPathsProvider: Provider = {
  provide: AppPaths,
  inject: [ConfigService],
  useFactory: (config: ConfigService): AppPaths => {
    const out = config.get<string>("OUT_DIR") || "out";
    return Object.assign(new AppPaths(), {
      tenant: config.get<string>("TENANT_DIR") || "tenants/agency-network",
      data: config.get<string>("DATA_DIR") || "data/demo",
      out,
      evals: config.get<string>("EVALS_DIR") || join(out, "evals")
    });
  }
};

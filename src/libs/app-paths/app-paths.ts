import type { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/** Where the admin reads config and data and writes results. The commands take the same paths as options. */
export class AppPaths {
  tenant!: string;
  data!: string;
  out!: string;
}

export const appPathsProvider: Provider = {
  provide: AppPaths,
  inject: [ConfigService],
  useFactory: (config: ConfigService): AppPaths =>
    Object.assign(new AppPaths(), {
      tenant: config.get<string>("TENANT_DIR") || "tenants/agency-network",
      data: config.get<string>("DATA_DIR") || "data/demo",
      out: config.get<string>("OUT_DIR") || "out"
    })
};

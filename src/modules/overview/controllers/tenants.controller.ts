import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { tenantChoices } from "../../../libs/app-paths/app-paths";
import { readTenantName } from "../../reconciliation/infrastructure/tenant-files";

/** The businesses the admin can show, for the switcher in its top bar. */
@Controller("tenants")
export class TenantsController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  async list(): Promise<{ id: string; name: string }[]> {
    return Promise.all(
      Object.entries(tenantChoices(this.config)).map(async ([id, paths]) => ({
        id,
        name: await readTenantName(paths.tenant)
      }))
    );
  }
}

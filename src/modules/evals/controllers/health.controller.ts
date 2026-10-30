import { Controller, Get } from "@nestjs/common";
import { AppPaths } from "../../../libs/app-paths/app-paths";
import { HealthService, type HealthView } from "../application/health.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly paths: AppPaths,
    private readonly health: HealthService
  ) {}

  @Get()
  view(): Promise<HealthView> {
    return this.health.view(this.paths);
  }
}

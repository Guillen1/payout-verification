import { Controller, Get } from "@nestjs/common";
import { AppPaths } from "../../../libs/app-paths/app-paths";
import { OverviewService, type OverviewView } from "../application/overview.service";

@Controller("overview")
export class OverviewController {
  constructor(
    private readonly paths: AppPaths,
    private readonly overview: OverviewService
  ) {}

  @Get()
  view(): Promise<OverviewView> {
    return this.overview.view(this.paths);
  }
}

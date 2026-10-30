import { Module } from "@nestjs/common";
import { AppPathsModule } from "../../libs/app-paths/app-paths.module";
import { ApprovalsModule } from "../approvals/approvals.module";
import { BonusModule } from "../bonus/bonus.module";
import { ReconciliationModule } from "../reconciliation/reconciliation.module";
import { OverviewService } from "./application/overview.service";
import { OverviewController } from "./controllers/overview.controller";

/** The admin's first screen: money found, what is waiting for a person, and how far to trust it. */
@Module({
  imports: [AppPathsModule, ReconciliationModule, BonusModule, ApprovalsModule],
  controllers: [OverviewController],
  providers: [OverviewService]
})
export class OverviewModule {}

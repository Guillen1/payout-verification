import { Module } from "@nestjs/common";
import { AppPathsModule } from "../../libs/app-paths/app-paths.module";
import { BonusModule } from "../bonus/bonus.module";
import { ReconciliationModule } from "../reconciliation/reconciliation.module";
import { ApprovalsService } from "./application/approvals.service";
import { ApprovalsController } from "./controllers/approvals.controller";

/** Model proposals that change config (a changed layout, a bonus agreement's rules), waiting for a person. */
@Module({
  imports: [AppPathsModule, ReconciliationModule, BonusModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
  exports: [ApprovalsService]
})
export class ApprovalsModule {}

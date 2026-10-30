import { Module } from "@nestjs/common";
import { AppPathsModule } from "../../libs/app-paths/app-paths.module";
import { ExtractionModule } from "../extraction/extraction.module";
import { PeriodRunsService } from "./application/services/period-runs.service";
import { ReconcilePeriodService } from "./application/services/reconcile-period.service";
import { ReconcileCli } from "./cli/reconcile.cli";
import { PeriodsController } from "./controllers/periods.controller";

/** Closing a period: reading every carrier's statement, checking it, and working out payouts. */
@Module({
  imports: [AppPathsModule, ExtractionModule],
  controllers: [PeriodsController],
  providers: [ReconcilePeriodService, PeriodRunsService, ReconcileCli],
  exports: [PeriodRunsService]
})
export class ReconciliationModule {}

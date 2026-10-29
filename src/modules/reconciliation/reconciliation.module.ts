import { Module } from "@nestjs/common";
import { ExtractionModule } from "../extraction/extraction.module";
import { ReconcilePeriodService } from "./application/services/reconcile-period.service";
import { ReconcileCli } from "./cli/reconcile.cli";

/** Closing a period: reading every carrier's statement, checking it, and working out payouts. */
@Module({
  imports: [ExtractionModule],
  providers: [ReconcilePeriodService, ReconcileCli]
})
export class ReconciliationModule {}

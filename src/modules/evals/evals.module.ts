import { Module } from "@nestjs/common";
import { AppPathsModule } from "../../libs/app-paths/app-paths.module";
import { BonusModule } from "../bonus/bonus.module";
import { ExtractionModule } from "../extraction/extraction.module";
import { ReconciliationModule } from "../reconciliation/reconciliation.module";
import { HealthService } from "./application/health.service";
import { EvalCli } from "./cli/eval.cli";
import { HealthController } from "./controllers/health.controller";

/** Measures the model's reading against the demo data's answer key, and reports the system's health. */
@Module({
  imports: [AppPathsModule, ExtractionModule, BonusModule, ReconciliationModule],
  controllers: [HealthController],
  providers: [EvalCli, HealthService]
})
export class EvalsModule {}

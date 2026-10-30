import { Module } from "@nestjs/common";
import { AppPathsModule } from "../../libs/app-paths/app-paths.module";
import { ModelClientModule } from "../../libs/model-client/model-client.module";
import { BonusRunsService } from "./application/services/bonus-runs.service";
import { BonusTermsService } from "./application/services/bonus-terms.service";
import { BonusVerificationService } from "./application/services/bonus-verification.service";
import { BonusCli } from "./cli/bonus.cli";
import { BonusController } from "./controllers/bonus.controller";

/** Profit-sharing bonuses: agreement terms read into rules, then each year's bonus checked against them. */
@Module({
  imports: [AppPathsModule, ModelClientModule],
  controllers: [BonusController],
  providers: [BonusTermsService, BonusVerificationService, BonusRunsService, BonusCli],
  exports: [BonusTermsService, BonusVerificationService, BonusRunsService]
})
export class BonusModule {}

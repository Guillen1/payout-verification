import { Module } from "@nestjs/common";
import { ModelClientModule } from "../../libs/model-client/model-client.module";
import { BonusTermsService } from "./application/services/bonus-terms.service";
import { BonusVerificationService } from "./application/services/bonus-verification.service";
import { BonusCli } from "./cli/bonus.cli";

/** Profit-sharing bonuses: agreement terms read into rules, then each year's bonus checked against them. */
@Module({
  imports: [ModelClientModule],
  providers: [BonusTermsService, BonusVerificationService, BonusCli],
  exports: [BonusTermsService, BonusVerificationService]
})
export class BonusModule {}

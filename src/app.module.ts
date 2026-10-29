import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DemoModule } from "./modules/demo/demo.module";
import { EvalsModule } from "./modules/evals/evals.module";
import { ReconciliationModule } from "./modules/reconciliation/reconciliation.module";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ReconciliationModule, DemoModule, EvalsModule]
})
export class AppModule {}

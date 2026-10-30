import { join } from "node:path";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ServeStaticModule } from "@nestjs/serve-static";
import { ApprovalsModule } from "./modules/approvals/approvals.module";
import { BonusModule } from "./modules/bonus/bonus.module";
import { EvalsModule } from "./modules/evals/evals.module";
import { ReconciliationModule } from "./modules/reconciliation/reconciliation.module";

/** The admin: the JSON API under /api, and the built web app for everything else. */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({ rootPath: join(process.cwd(), "web", "dist"), exclude: ["/api/{*path}"] }),
    ReconciliationModule,
    BonusModule,
    EvalsModule,
    ApprovalsModule
  ]
})
export class ServerModule {}

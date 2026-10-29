import { Module } from "@nestjs/common";
import { ModelAbstractClient } from "./contract/model.abstract-client";
import { ClaudeClient } from "./implementation/claude.client";
import { modelClientConfigProvider } from "./setup/model-client.config";

@Module({
  providers: [modelClientConfigProvider, { provide: ModelAbstractClient, useClass: ClaudeClient }],
  exports: [ModelAbstractClient]
})
export class ModelClientModule {}

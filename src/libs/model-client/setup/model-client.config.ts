import type { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";

const ModelClientConfigSchema = z.object({
  /**
   * replay: answer only from recordings. record: replay what is recorded and ask the model for the
   * rest, saving the answers. live: always ask the model and save nothing.
   */
  mode: z.enum(["replay", "record", "live"]).default("record"),
  model: z.string().min(1).default("claude-opus-5-5"),
  effort: z.enum(["low", "medium", "high"]).default("medium"),
  recordingsDirectory: z.string().min(1).default("recordings")
});

/** Validated at startup, so a typo in .env fails before any statement is read. */
export class ModelClientConfig {
  mode!: z.infer<typeof ModelClientConfigSchema>["mode"];
  model!: string;
  effort!: z.infer<typeof ModelClientConfigSchema>["effort"];
  recordingsDirectory!: string;
}

export const modelClientConfigProvider: Provider = {
  provide: ModelClientConfig,
  inject: [ConfigService],
  useFactory: (config: ConfigService): ModelClientConfig => {
    const valueOf = (key: string) => config.get<string>(key) || undefined;
    const parsed = ModelClientConfigSchema.safeParse({
      mode: valueOf("MODEL_MODE"),
      model: valueOf("MODEL_NAME"),
      effort: valueOf("MODEL_EFFORT"),
      recordingsDirectory: valueOf("RECORDINGS_DIR")
    });
    if (!parsed.success) {
      throw new Error(`Invalid model configuration: ${parsed.error.issues.map(issue => issue.message).join("; ")}`);
    }
    return Object.assign(new ModelClientConfig(), parsed.data);
  }
};

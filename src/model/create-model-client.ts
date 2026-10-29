import { AnthropicModelClient } from "./anthropic-model-client";
import type { ModelClient } from "./model-client";
import { RecordingModelClient, type RecordingMode } from "./recording-model-client";

/**
 * Builds the model client from environment variables:
 *
 *   MODEL_MODE       replay | record | live (default: record)
 *   MODEL_NAME       default claude-opus-5-5
 *   MODEL_EFFORT     low | medium | high (default: medium)
 *   RECORDINGS_DIR   default recordings
 *
 * Credentials are read by the Anthropic SDK itself (ANTHROPIC_API_KEY and friends). Without them,
 * record mode still works for every answer that is already recorded.
 */
export function createModelClient(env: NodeJS.ProcessEnv = process.env): ModelClient {
  const mode = parseMode(env.MODEL_MODE);
  const model = env.MODEL_NAME ?? "claude-opus-5-5";
  const effort = parseEffort(env.MODEL_EFFORT);

  return new RecordingModelClient({
    directory: env.RECORDINGS_DIR ?? "recordings",
    mode,
    model,
    live: mode === "replay" ? null : new AnthropicModelClient({ model, effort })
  });
}

function parseMode(value: string | undefined): RecordingMode {
  if (value === undefined || value === "") return "record";
  if (value === "replay" || value === "record" || value === "live") return value;
  throw new Error(`MODEL_MODE must be replay, record or live, got "${value}"`);
}

function parseEffort(value: string | undefined): "low" | "medium" | "high" {
  if (value === undefined || value === "") return "medium";
  if (value === "low" || value === "medium" || value === "high") return value;
  throw new Error(`MODEL_EFFORT must be low, medium or high, got "${value}"`);
}

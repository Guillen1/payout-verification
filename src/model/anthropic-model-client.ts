import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { ModelClient, ModelInput, ModelRequest, ModelResult, ModelUsage } from "./model-client";
import { estimateCostUsd } from "./model-pricing";

export interface AnthropicModelOptions {
  model: string;
  effort: "low" | "medium" | "high";
  client?: Anthropic;
}

/**
 * Asks Claude through the Messages API with structured outputs: the answer is validated against
 * the request's schema by the SDK before it is returned.
 *
 * Server-side fallbacks are on, so if the model declines a request on safety grounds the API
 * retries it on a model chosen for that category instead of failing the statement.
 */
export class AnthropicModelClient implements ModelClient {
  private readonly client: Anthropic;

  constructor(private readonly options: AnthropicModelOptions) {
    this.client = options.client ?? new Anthropic();
  }

  async ask<T>(request: ModelRequest<T>): Promise<ModelResult<T>> {
    const started = performance.now();
    const response = await this.client.beta.messages.parse({
      model: this.options.model,
      max_tokens: 16_000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: this.options.effort, format: betaZodOutputFormat(request.schema) },
      system: request.instructions,
      messages: [{ role: "user", content: request.inputs.map(toContentBlock) }]
    });

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const cacheReadTokens = response.usage.cache_read_input_tokens ?? 0;
    const usage: ModelUsage = {
      task: request.task,
      model: response.model,
      source: "live",
      inputTokens,
      outputTokens,
      cacheReadTokens,
      latencyMs: Math.round(performance.now() - started),
      estimatedCostUsd: estimateCostUsd(response.model, { inputTokens, outputTokens, cacheReadTokens })
    };

    if (response.stop_reason === "refusal") {
      const category = response.stop_details?.category ?? "unspecified";
      return { status: "declined", reason: `The model declined (${category}).`, usage };
    }
    if (response.stop_reason === "max_tokens") {
      return { status: "invalid_output", reason: "The answer was cut off before it was complete.", usage };
    }
    if (response.parsed_output === null || response.parsed_output === undefined) {
      return { status: "invalid_output", reason: "The answer did not match the expected shape.", usage };
    }
    return { status: "answered", output: response.parsed_output, usage };
  }
}

function toContentBlock(input: ModelInput): Anthropic.Beta.BetaContentBlockParam {
  if (input.type === "text") return { type: "text", text: input.text };
  return {
    type: "document",
    title: input.name,
    source: { type: "base64", media_type: "application/pdf", data: input.data.toString("base64") }
  };
}

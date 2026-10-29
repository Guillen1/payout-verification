import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { Injectable } from "@nestjs/common";
import { ModelAbstractClient } from "../contract/model.abstract-client";
import type { ModelInput, ModelRequest, ModelResult, ModelUsage } from "../contract/model.models";
import { ModelClientConfig } from "../setup/model-client.config";
import { readRecording, RecordingMissingError, recordingPath, saveRecording } from "./recordings";

/** US dollars per million tokens, as of 2026-10. Only used to report what a run cost. */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 }
};

/**
 * Asks Claude through the Messages API with structured outputs: the answer is validated against
 * the request's schema before it is returned. Server-side fallbacks retry a request the model
 * declines on a model chosen for that category, instead of failing the statement.
 *
 * Answers are replayed from recordings when they exist (see recordings.ts).
 */
@Injectable()
export class ClaudeClient extends ModelAbstractClient {
  private readonly anthropic: Anthropic | null;

  constructor(private readonly config: ModelClientConfig) {
    super();
    this.anthropic = config.mode === "replay" ? null : new Anthropic();
  }

  async ask<T>(request: ModelRequest<T>): Promise<ModelResult<T>> {
    const model = request.escalate ? this.config.escalationModel : this.config.model;
    const path = recordingPath(this.config.recordingsDirectory, request, model);

    if (this.config.mode !== "live") {
      const recorded = await readRecording(path, request);
      if (recorded) return recorded;
    }
    if (this.anthropic === null) throw new RecordingMissingError(request.task, path);

    const result = await this.askClaude(this.anthropic, model, request);
    if (this.config.mode === "record") await saveRecording(path, request, result);
    return result;
  }

  private async askClaude<T>(anthropic: Anthropic, model: string, request: ModelRequest<T>): Promise<ModelResult<T>> {
    const started = performance.now();
    const response = await anthropic.beta.messages.parse({
      model,
      max_tokens: 16_000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: this.config.effort, format: betaZodOutputFormat(request.schema) },
      system: request.instructions,
      messages: [{ role: "user", content: request.inputs.map(toContentBlock) }]
    });

    const price = PRICES[response.model];
    const { input_tokens: inputTokens, output_tokens: outputTokens } = response.usage;
    const usage: ModelUsage = {
      task: request.task,
      model: response.model,
      source: "live",
      inputTokens,
      outputTokens,
      latencyMs: Math.round(performance.now() - started),
      estimatedCostUsd: price ? (inputTokens * price.input + outputTokens * price.output) / 1_000_000 : null
    };

    if (response.stop_reason === "refusal") {
      return {
        status: "declined",
        reason: `The model declined (${response.stop_details?.category ?? "unspecified"}).`,
        usage
      };
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

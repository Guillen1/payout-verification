import type { ModelClient, ModelRequest, ModelResult, ModelUsage } from "./model-client";

export type ScriptedAnswer = { output: unknown } | { declined: string };

/**
 * A stand-in model for tests: answers come from a function the test provides, validated against
 * the request's schema exactly as a real answer would be. Tests of the code around the model stay
 * fast and deterministic; how well the real model reads is measured by the evals instead.
 */
export class ScriptedModelClient implements ModelClient {
  readonly requests: ModelRequest<unknown>[] = [];

  constructor(private readonly answer: (request: ModelRequest<unknown>) => ScriptedAnswer) {}

  ask<T>(request: ModelRequest<T>): Promise<ModelResult<T>> {
    this.requests.push(request);
    const usage: ModelUsage = {
      task: request.task,
      model: "scripted",
      source: "scripted",
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      latencyMs: 0,
      estimatedCostUsd: 0
    };

    const answer = this.answer(request);
    if ("declined" in answer) return Promise.resolve({ status: "declined", reason: answer.declined, usage });

    const parsed = request.schema.safeParse(answer.output);
    return Promise.resolve(
      parsed.success
        ? { status: "answered", output: parsed.data, usage }
        : { status: "invalid_output", reason: parsed.error.message, usage }
    );
  }
}

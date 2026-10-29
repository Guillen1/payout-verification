import type { z } from "zod";

/**
 * The only door to a language model in this codebase.
 *
 * The model is asked to read something and answer in a fixed shape (a schema). It is never asked
 * to compute money or make a decision: code checks every answer before anything depends on it.
 */
export interface ModelClient {
  ask<T>(request: ModelRequest<T>): Promise<ModelResult<T>>;
}

export interface ModelRequest<T> {
  /** What the call is for, for example "read-pdf-statement". Used for metering and recordings. */
  task: string;
  /** Bump when the instructions change, so the change is visible in recordings and reports. */
  promptVersion: number;
  instructions: string;
  inputs: ModelInput[];
  schema: z.ZodType<T>;
}

export type ModelInput = { type: "text"; text: string } | { type: "pdf"; name: string; data: Buffer };

export interface ModelUsage {
  task: string;
  model: string;
  /** "recording" when the answer was replayed instead of requested. */
  source: "live" | "recording" | "scripted";
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  latencyMs: number;
  /** Null when the model's price is not in the price table. */
  estimatedCostUsd: number | null;
}

export type ModelResult<T> =
  | { status: "answered"; output: T; usage: ModelUsage }
  | { status: "declined"; reason: string; usage: ModelUsage }
  | { status: "invalid_output"; reason: string; usage: ModelUsage };

import type { z } from "zod";

export interface ModelRequest<T> {
  /** What the call is for, for example "read-pdf-statement". Used for metering and recordings. */
  task: string;
  /** Bump when the instructions change, so the change is visible in recordings and reports. */
  promptVersion: number;
  instructions: string;
  inputs: ModelInput[];
  schema: z.ZodType<T>;
  /** Ask the stronger escalation model instead of the default one, for a retry after a failed check. */
  escalate?: boolean;
}

export type ModelInput = { type: "text"; text: string } | { type: "pdf"; name: string; data: Buffer };

export interface ModelUsage {
  task: string;
  model: string;
  /** "recording" when the answer was replayed instead of requested. */
  source: "live" | "recording" | "scripted";
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  /** Null when the model's price is not known. */
  estimatedCostUsd: number | null;
}

/** What a run actually spent: replayed answers cost nothing, whatever they cost when recorded. */
export function costOfLiveCalls(calls: readonly ModelUsage[]): number {
  return calls.filter(call => call.source === "live").reduce((total, call) => total + (call.estimatedCostUsd ?? 0), 0);
}

export type ModelResult<T> =
  | { status: "answered"; output: T; usage: ModelUsage }
  | { status: "declined"; reason: string; usage: ModelUsage }
  | { status: "invalid_output"; reason: string; usage: ModelUsage };

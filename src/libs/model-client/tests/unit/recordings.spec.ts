import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ModelRequest, ModelResult } from "../../contract/model.models";
import { readRecording, recordingPath, saveRecording } from "../../implementation/recordings";

const request: ModelRequest<{ total: string }> = {
  task: "test-task",
  promptVersion: 1,
  instructions: "Read the total.",
  inputs: [{ type: "pdf", name: "statement.pdf", data: Buffer.from("pdf bytes") }],
  schema: z.object({ total: z.string() })
};

const answered: ModelResult<{ total: string }> = {
  status: "answered",
  output: { total: "12.30" },
  usage: {
    task: "test-task",
    model: "m",
    source: "live",
    inputTokens: 10,
    outputTokens: 5,
    latencyMs: 1,
    estimatedCostUsd: 0
  }
};

describe("recordings", () => {
  it("replays a saved answer, marked as a recording", async () => {
    const path = recordingPath(await mkdtemp(join(tmpdir(), "rec-")), request, "m");
    await saveRecording(path, request, answered);

    expect(await readRecording(path, request)).toMatchObject({
      status: "answered",
      output: { total: "12.30" },
      usage: { source: "recording" }
    });
  });

  it("returns nothing when no answer was recorded", async () => {
    const path = recordingPath(await mkdtemp(join(tmpdir(), "rec-")), request, "m");
    expect(await readRecording(path, request)).toBeNull();
  });

  it("keys recordings by model, instructions and the exact input bytes", () => {
    const key = (changed: Partial<ModelRequest<unknown>>, model = "m") =>
      recordingPath("r", { ...request, ...changed }, model);
    const original = key({});

    expect(key({ instructions: "Read the total carefully." })).not.toBe(original);
    expect(key({ inputs: [{ type: "pdf", name: "statement.pdf", data: Buffer.from("changed") }] })).not.toBe(original);
    expect(key({}, "other-model")).not.toBe(original);
    expect(key({})).toBe(original);
  });

  it("reports a recorded answer that no longer matches the schema instead of trusting it", async () => {
    const path = recordingPath(await mkdtemp(join(tmpdir(), "rec-")), request, "m");
    await saveRecording(path, request, answered);

    const stricter = { ...request, schema: z.object({ total: z.string(), currency: z.string() }) };
    expect(await readRecording(path, stricter)).toMatchObject({ status: "invalid_output" });
  });
});

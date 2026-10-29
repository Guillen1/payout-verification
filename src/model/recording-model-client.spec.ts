import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ModelRequest } from "./model-client";
import { RecordingMissingError, RecordingModelClient } from "./recording-model-client";
import { ScriptedModelClient } from "./scripted-model-client";

const request: ModelRequest<{ total: string }> = {
  task: "test-task",
  promptVersion: 1,
  instructions: "Read the total.",
  inputs: [{ type: "pdf", name: "statement.pdf", data: Buffer.from("pdf bytes") }],
  schema: z.object({ total: z.string() })
};

async function setup(mode: "replay" | "record" | "live") {
  const directory = await mkdtemp(join(tmpdir(), "recordings-"));
  const live = new ScriptedModelClient(() => ({ output: { total: "12.30" } }));
  return { live, client: new RecordingModelClient({ directory, mode, model: "test-model", live }), directory };
}

describe("RecordingModelClient", () => {
  it("records an answer once and replays it after that", async () => {
    const { live, client } = await setup("record");

    const first = await client.ask(request);
    const second = await client.ask(request);

    expect(first).toMatchObject({ status: "answered", output: { total: "12.30" } });
    expect(second).toMatchObject({ status: "answered", output: { total: "12.30" }, usage: { source: "recording" } });
    expect(live.requests).toHaveLength(1);
  });

  it("does not replay an answer recorded for different inputs", async () => {
    const { live, client } = await setup("record");
    await client.ask(request);
    await client.ask({ ...request, inputs: [{ type: "pdf", name: "statement.pdf", data: Buffer.from("changed") }] });
    expect(live.requests).toHaveLength(2);
  });

  it("does not replay an answer recorded for different instructions", async () => {
    const { live, client } = await setup("record");
    await client.ask(request);
    await client.ask({ ...request, instructions: "Read the total carefully." });
    expect(live.requests).toHaveLength(2);
  });

  it("refuses to call the model in replay mode", async () => {
    const { client } = await setup("replay");
    await expect(client.ask(request)).rejects.toBeInstanceOf(RecordingMissingError);
  });

  it("reports a recorded answer that no longer matches the schema instead of trusting it", async () => {
    const { client, directory } = await setup("record");
    await client.ask(request);

    const stricter = { ...request, schema: z.object({ total: z.string(), currency: z.string() }) };
    const replayer = new RecordingModelClient({ directory, mode: "replay", model: "test-model", live: null });
    expect(await replayer.ask(stricter)).toMatchObject({ status: "invalid_output" });
  });
});

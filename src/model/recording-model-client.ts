import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ModelClient, ModelRequest, ModelResult } from "./model-client";

/**
 * - replay: answer only from recordings. A missing recording is an error.
 * - record: answer from a recording when there is one, otherwise ask the model and save the answer.
 * - live:   always ask the model and save nothing.
 */
export type RecordingMode = "replay" | "record" | "live";

export class RecordingMissingError extends Error {
  constructor(task: string, path: string) {
    super(
      `No recorded answer for "${task}" at ${path}. Run once with model credentials and MODEL_MODE=record to record it.`
    );
  }
}

/**
 * Saves model answers to files and replays them, keyed by everything that shapes the answer: the
 * model, the task, the instructions and the exact inputs (PDFs by content hash).
 *
 * This is what lets the demo and CI run without an API key and give the same result every time.
 * Any change to the instructions or the inputs misses the recording, so a stale answer is never
 * replayed for a different question.
 */
export class RecordingModelClient implements ModelClient {
  constructor(
    private readonly options: {
      directory: string;
      mode: RecordingMode;
      model: string;
      live: ModelClient | null;
    }
  ) {}

  async ask<T>(request: ModelRequest<T>): Promise<ModelResult<T>> {
    const path = join(this.options.directory, request.task, `${recordingKey(request, this.options.model)}.json`);

    if (this.options.mode !== "live") {
      const recorded = await readRecording(path);
      if (recorded) return replay(recorded.result, request);
    }

    if (this.options.mode === "replay" || this.options.live === null) {
      throw new RecordingMissingError(request.task, path);
    }

    const result = await this.options.live.ask(request);
    if (this.options.mode === "record") {
      await mkdir(join(this.options.directory, request.task), { recursive: true });
      await writeFile(path, `${JSON.stringify(toRecording(request, result), null, 2)}\n`);
    }
    return result;
  }
}

interface Recording {
  task: string;
  promptVersion: number;
  inputs: { type: string; name?: string; sha256?: string }[];
  result: ModelResult<unknown>;
}

export function recordingKey(request: ModelRequest<unknown>, model: string): string {
  const fingerprint = JSON.stringify({
    model,
    task: request.task,
    promptVersion: request.promptVersion,
    instructions: request.instructions,
    inputs: request.inputs.map(input =>
      input.type === "text" ? input : { type: "pdf", name: input.name, sha256: sha256(input.data) }
    )
  });
  return sha256(fingerprint).slice(0, 16);
}

function toRecording(request: ModelRequest<unknown>, result: ModelResult<unknown>): Recording {
  return {
    task: request.task,
    promptVersion: request.promptVersion,
    inputs: request.inputs.map(input =>
      input.type === "text" ? { type: "text" } : { type: "pdf", name: input.name, sha256: sha256(input.data) }
    ),
    result
  };
}

/** A replayed answer is validated against today's schema, so a schema change cannot slip past it. */
function replay<T>(recorded: ModelResult<unknown>, request: ModelRequest<T>): ModelResult<T> {
  const usage = { ...recorded.usage, source: "recording" as const };
  if (recorded.status !== "answered") return { ...recorded, usage };

  const parsed = request.schema.safeParse(recorded.output);
  return parsed.success
    ? { status: "answered", output: parsed.data, usage }
    : { status: "invalid_output", reason: "The recorded answer no longer matches the schema.", usage };
}

async function readRecording(path: string): Promise<Recording | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Recording;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

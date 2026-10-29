import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ModelRequest, ModelResult } from "../contract/model.models";

/*
 * Recorded model answers, saved as files and keyed by everything that shapes the answer: the
 * model, the task, the instructions and the exact inputs (PDFs by content hash).
 *
 * This is what lets the demo and CI run without an API key and give the same result every time.
 * Any change to the instructions or the inputs misses the recording, so a stale answer is never
 * replayed for a different question.
 */

export class RecordingMissingError extends Error {
  constructor(task: string, path: string) {
    super(`No recorded answer for "${task}" at ${path}. Run once with model credentials and MODEL_MODE=record.`);
  }
}

interface Recording {
  task: string;
  promptVersion: number;
  result: ModelResult<unknown>;
}

export function recordingPath(directory: string, request: ModelRequest<unknown>, model: string): string {
  const fingerprint = JSON.stringify({
    model,
    task: request.task,
    promptVersion: request.promptVersion,
    instructions: request.instructions,
    inputs: request.inputs.map(input =>
      input.type === "text" ? input : { type: "pdf", name: input.name, sha256: sha256(input.data) }
    )
  });
  return join(directory, request.task, `${sha256(fingerprint).slice(0, 16)}.json`);
}

/** The recorded answer, validated against today's schema so a schema change cannot slip past it. */
export async function readRecording<T>(path: string, request: ModelRequest<T>): Promise<ModelResult<T> | null> {
  let recording: Recording;
  try {
    recording = JSON.parse(await readFile(path, "utf8")) as Recording;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  const { result } = recording;
  const usage = { ...result.usage, source: "recording" as const };
  if (result.status !== "answered") return { ...result, usage };

  const parsed = request.schema.safeParse(result.output);
  return parsed.success
    ? { status: "answered", output: parsed.data, usage }
    : { status: "invalid_output", reason: "The recorded answer no longer matches the schema.", usage };
}

export async function saveRecording(path: string, request: ModelRequest<unknown>, result: ModelResult<unknown>) {
  const recording: Recording = { task: request.task, promptVersion: request.promptVersion, result };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(recording, null, 2)}\n`);
}

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

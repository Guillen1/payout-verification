import type { ModelClient, ModelRequest, ModelResult } from "../src/model/model-client";

/** Passes calls through and keeps the last answer, so an eval can score what the model read. */
export class LastAnswerModelClient implements ModelClient {
  lastAnswer: unknown = null;

  constructor(private readonly inner: ModelClient) {}

  async ask<T>(request: ModelRequest<T>): Promise<ModelResult<T>> {
    const result = await this.inner.ask(request);
    this.lastAnswer = result.status === "answered" ? result.output : null;
    return result;
  }
}

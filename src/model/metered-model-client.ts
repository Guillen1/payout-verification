import type { ModelClient, ModelRequest, ModelResult, ModelUsage } from "./model-client";

/** Wraps a model client and keeps the usage of every call, so a run can report what it cost. */
export class MeteredModelClient implements ModelClient {
  readonly calls: ModelUsage[] = [];

  constructor(private readonly inner: ModelClient) {}

  async ask<T>(request: ModelRequest<T>): Promise<ModelResult<T>> {
    const result = await this.inner.ask(request);
    this.calls.push(result.usage);
    return result;
  }
}

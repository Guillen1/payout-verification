import type { ModelRequest, ModelResult } from "./model.models";

/**
 * The only door to a language model in this codebase, and its DI token.
 *
 * The model is asked to read something and answer in a fixed shape (a schema). It is never asked
 * to compute money or make a decision: code checks every answer before anything depends on it.
 */
export abstract class ModelAbstractClient {
  abstract ask<T>(request: ModelRequest<T>): Promise<ModelResult<T>>;
}

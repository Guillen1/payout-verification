/**
 * Published per-token prices in US dollars per million tokens, as of 2026-10. Used only to report
 * what a run cost; nothing depends on it for correctness.
 */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 }
};

export function estimateCostUsd(
  model: string,
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number }
): number | null {
  const price = PRICES[model];
  if (!price) return null;
  const perToken = (dollarsPerMillion: number) => dollarsPerMillion / 1_000_000;
  return (
    usage.inputTokens * perToken(price.input) +
    usage.outputTokens * perToken(price.output) +
    usage.cacheReadTokens * perToken(price.cacheRead)
  );
}

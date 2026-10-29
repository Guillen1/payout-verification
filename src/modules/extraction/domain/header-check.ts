export interface HeaderCheck {
  matches: boolean;
  /** Expected headers the file does not have. */
  missing: string[];
  /** Headers in the file the format does not know. */
  unexpected: string[];
}

/**
 * Compares a file's header row with the format's. Order is ignored, names are not: a renamed
 * column is exactly the kind of silent carrier change that must stop processing.
 */
export function checkHeaders(expected: readonly string[], actual: readonly string[]): HeaderCheck {
  const actualTrimmed = actual.map(header => header.trim());
  const missing = expected.filter(header => !actualTrimmed.includes(header));
  const unexpected = actualTrimmed.filter(header => !expected.includes(header));
  return { matches: missing.length === 0 && unexpected.length === 0, missing, unexpected };
}

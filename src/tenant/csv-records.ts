import { parse } from "csv-parse/sync";
import type { z } from "zod";

/** Reads a CSV with a header row and validates every record against a schema. */
export function parseCsvRecords<T>(content: string, schema: z.ZodType<T>, source: string): T[] {
  const records: Record<string, string>[] = parse(content, { bom: true, columns: true, skip_empty_lines: true });
  return records.map((record, index) => {
    const result = schema.safeParse(record);
    if (!result.success) {
      const issues = result.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      throw new Error(`${source} row ${index + 2}: ${issues}`);
    }
    return result.data;
  });
}

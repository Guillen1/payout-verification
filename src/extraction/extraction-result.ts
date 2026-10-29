import type { Statement } from "../domain/types";
import type { HeaderCheck } from "./header-check";
import type { LineProblem } from "./statement-line-reader";

/** What came of reading one statement file. Only "extracted" goes on to reconciliation. */
export type ExtractionResult =
  | { status: "extracted"; statement: Statement }
  | { status: "format_drift"; headerCheck: HeaderCheck }
  | { status: "invalid_lines"; problems: LineProblem[] }
  | { status: "unreadable"; reason: string };

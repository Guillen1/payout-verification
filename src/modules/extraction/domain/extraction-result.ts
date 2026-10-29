import type { Statement } from "../../reconciliation/domain/types";
import type { HeaderCheck } from "./header-check";
import type { LineProblem } from "./statement-line-reader";

/** What came of reading a PDF statement. Only "extracted" goes on to reconciliation. */
export type ExtractionResult =
  | { status: "extracted"; statement: Statement }
  | { status: "invalid_lines"; problems: LineProblem[] }
  | { status: "unreadable"; reason: string };

/** A CSV can also have changed layout, which a PDF read by a model cannot. */
export type CsvExtractionResult = ExtractionResult | { status: "format_drift"; headerCheck: HeaderCheck };

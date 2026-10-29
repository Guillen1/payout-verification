import { sumCents, type Cents } from "./money";
import type { Statement } from "./types";

export interface TieOut {
  statedTotalCents: Cents;
  extractedTotalCents: Cents;
  /** Extracted minus stated. Anything other than zero means a line was missed, doubled or misread. */
  differenceCents: Cents;
  tiesOut: boolean;
}

/**
 * The extracted lines must add up to the total the carrier printed, to the cent. This one check
 * catches most extraction errors before any of them can reach a payout.
 */
export function tieOut(statement: Statement): TieOut {
  const extractedTotalCents = sumCents(statement.lines.map(line => line.commissionCents));
  const differenceCents = extractedTotalCents - statement.statedTotalCents;
  return {
    statedTotalCents: statement.statedTotalCents,
    extractedTotalCents,
    differenceCents,
    tiesOut: differenceCents === 0
  };
}

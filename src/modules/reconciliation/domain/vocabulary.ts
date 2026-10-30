import { z } from "zod";

/**
 * The words a tenant uses for the same money flow. The engine only knows statements, lines,
 * expected amounts and what was paid; an agency network calls them carriers, policies and
 * commissions, a consumer brand calls them retailers, invoices and remittances. Every word a
 * person or the model reads comes from here, so a second business is config, not code.
 *
 * The defaults are the agency network's words.
 */
export const VocabularySchema = z.object({
  /** Who pays: "carrier", "carriers". */
  counterparty: z.string().default("carrier"),
  counterparties: z.string().default("carriers"),
  /** What they send each period: "commission statement". */
  statement: z.string().default("commission statement"),
  /** The money, singular and plural: "commission", "commissions". */
  payment: z.string().default("commission"),
  payments: z.string().default("commissions"),
  /** What each line is paid on: "policy", "policies". */
  item: z.string().default("policy"),
  items: z.string().default("policies"),
  /** Who each one is for, and the date it is dated by: "insured", "effective date". */
  customer: z.string().default("insured"),
  date: z.string().default("effective date"),
  /** A line that takes money back: "cancellation chargeback". */
  reversal: z.string().default("cancellation chargeback"),
  /** The system of record those come from: "policy book". */
  book: z.string().default("policy book"),
  /** The amount the payment is computed on: "premium". */
  amount: z.string().default("premium"),
  /** Who shares in the money: "agency", "agencies". */
  partner: z.string().default("agency"),
  partners: z.string().default("agencies"),
  /** The tenant itself, as people say it: "the network". */
  organization: z.string().default("the network"),
  /** What the agreed percentages are called: "commission rates". */
  rates: z.string().default("commission rates"),
  /** Who a dispute letter goes to at the counterparty: "agency accounting". */
  disputeDesk: z.string().default("agency accounting"),
  /** How the model is told what document it is reading. */
  documentForModel: z.string().default("an insurance carrier's commission statement")
});

export type Vocabulary = z.infer<typeof VocabularySchema>;

export const DEFAULT_VOCABULARY: Vocabulary = VocabularySchema.parse({});

/** "Policy" from "policy": for words that start a sentence or a label. */
export function capitalized(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** "network" from "the network": for column headings. */
export function withoutArticle(phrase: string): string {
  return phrase.replace(/^the /, "");
}

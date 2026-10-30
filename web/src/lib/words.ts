import { useOverview } from "@/api/client";
import type { Words } from "@/api/types";

export type TenantWords = Pick<
  Words,
  "payments" | "counterparty" | "counterparties" | "statement" | "item" | "book" | "amount" | "partner" | "organization"
>;

/** Shown until the overview loads: the agency network's words, the server's defaults. */
const AGENCY_NETWORK: TenantWords = {
  payments: "commissions",
  counterparty: "carrier",
  counterparties: "carriers",
  statement: "commission statement",
  item: "policy",
  book: "policy book",
  amount: "premium",
  partner: "agency",
  organization: "the network"
};

/** The tenant's words, so the same screens read right for any business. */
export function useWords(): TenantWords {
  const { data } = useOverview();
  return data?.words ?? AGENCY_NETWORK;
}

/** "Policy" from "policy". */
export function capitalized(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

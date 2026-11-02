import { useOverview } from "@/api/client";
import type { Words } from "@/api/types";

export type TenantWords = Words;

/**
 * The tenant's words, so the same screens read right for any business. The layout shows pages only
 * once the overview has loaded, so they are always the current business's words, never a default.
 */
export function useWords(): TenantWords {
  const { data } = useOverview();
  if (!data) throw new Error("useWords is used outside the layout, before the overview has loaded");
  return data.words;
}

/** "Policy" from "policy". */
export function capitalized(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

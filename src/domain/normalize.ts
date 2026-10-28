/**
 * Carriers write the same policy number and the same name in different ways. These functions
 * reduce both to a comparable key. They never change what is shown in reports.
 */

/** "nw-1004231", "NW 1004231" and "NW1004231" all become "NW1004231". */
export function normalizePolicyNumber(policyNumber: string): string {
  return policyNumber.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** "LOPEZ, MARIA", "Maria  Lopez" and "maria lopez" all become "maria lopez". */
export function normalizeInsuredName(name: string): string {
  const [last, first] = name.split(",").map(part => part.trim());
  const ordered = first ? `${first} ${last}` : name;
  return ordered
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

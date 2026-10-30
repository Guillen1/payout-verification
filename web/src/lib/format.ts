/*
 * Display only. Every amount arrives from the API in integer cents, already computed; the page
 * formats it and never adds amounts up itself.
 */

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function money(cents: number): string {
  return dollars.format(cents / 100);
}

/** A signed difference, for variances: "+$12.00", "−$25.49". */
export function moneyDelta(cents: number): string {
  if (cents === 0) return money(0);
  return `${cents > 0 ? "+" : "−"}${money(Math.abs(cents))}`;
}

export function rate(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(2)}%`;
}

export function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(fraction === 1 ? 0 : 1)}%`;
}

/** "2026-09" as "September 2026". */
export function periodName(period: string): string {
  const [year, month] = period.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

import { money } from "@/lib/format";

/*
 * Where a carrier's payment went, as one stacked bar: to agencies, kept by the network, and held
 * for review. Three categorical slots in fixed order, a 2px gap between segments, a legend beside
 * it, and the exact amount on hover.
 */

const SEGMENTS = [
  { key: "toAgenciesCents", label: "To agencies", color: "var(--series-1)" },
  { key: "toNetworkCents", label: "To network", color: "var(--series-2)" },
  { key: "heldCents", label: "Held", color: "var(--series-3)" }
] as const;

type Amounts = Record<(typeof SEGMENTS)[number]["key"], number>;

export function AllocationBar({ amounts }: { amounts: Amounts }) {
  const total = SEGMENTS.reduce((sum, segment) => sum + Math.max(0, amounts[segment.key]), 0);
  if (total === 0) return null;
  return (
    <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={describe(amounts)}>
      {SEGMENTS.filter(segment => amounts[segment.key] > 0).map(segment => (
        <div
          key={segment.key}
          className="h-full first:rounded-l-full last:rounded-r-full"
          style={{ width: `${(amounts[segment.key] / total) * 100}%`, background: segment.color }}
          title={`${segment.label}: ${money(amounts[segment.key])}`}
        />
      ))}
    </div>
  );
}

export function AllocationLegend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      {SEGMENTS.map(segment => (
        <span key={segment.key} className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: segment.color }} />
          {segment.label}
        </span>
      ))}
    </div>
  );
}

function describe(amounts: Amounts): string {
  return SEGMENTS.map(segment => `${segment.label} ${money(amounts[segment.key])}`).join(", ");
}

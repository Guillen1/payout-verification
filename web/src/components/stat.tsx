import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** One headline number. Tone colors the value only when it needs action. */
export function Stat({
  label,
  value,
  hint,
  tone = "neutral"
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: "neutral" | "warning" | "critical";
}) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div
        className={cn(
          "tabular mt-1 text-xl font-semibold tracking-tight",
          tone === "warning" && "text-warning-ink",
          tone === "critical" && "text-critical-ink"
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

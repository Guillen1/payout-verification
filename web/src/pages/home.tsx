import { ArrowRight, CircleAlert } from "lucide-react";
import { Link } from "react-router";
import { useOverview } from "@/api/client";
import { ErrorState, Loading } from "@/components/states";
import { Card } from "@/components/ui/card";
import { money, percent, periodName } from "@/lib/format";
import { linkTo } from "@/lib/targets";

/** The money found, where it is, and anything waiting for a person. */
export function HomePage() {
  const { data: overview, error, isLoading } = useOverview();
  if (isLoading) return <Loading />;
  if (error || !overview) return <ErrorState error={error ?? new Error("No data")} />;

  const proof = [
    `${overview.checked.lines} lines checked automatically`,
    overview.accuracy && `${percent(overview.accuracy.lowestScore)} AI accuracy`,
    overview.costPerStatementUsd !== null && `$${overview.costPerStatementUsd.toFixed(2)} per statement`
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <p className="text-sm text-muted-foreground">{overview.period && periodName(overview.period)}</p>
        <h1 className="tabular mt-1 text-6xl font-semibold tracking-tight">{money(overview.foundCents)}</h1>
        <p className="mt-2 text-lg text-muted-foreground">owed to the network, found automatically.</p>
      </section>

      {overview.waiting.map(item => (
        <Link
          key={item.title}
          to={linkTo(item.target)}
          className="-mt-4 flex items-center gap-3 rounded-lg bg-warning-soft px-4 py-3 text-sm hover:bg-warning-soft/70"
        >
          <CircleAlert className="size-4 shrink-0 text-warning-ink" />
          <span className="font-medium">{item.title}</span>
          <span className="ml-auto flex items-center gap-1 text-warning-ink">
            Review <ArrowRight className="size-4" />
          </span>
        </Link>
      ))}

      <Card className="divide-y">
        {overview.found.map(entry => (
          <Link
            key={linkTo(entry.target)}
            to={linkTo(entry.target)}
            className="group flex items-center gap-6 px-6 py-5 transition-colors hover:bg-muted/40"
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {entry.carrierName} <span className="font-normal text-muted-foreground">· {entry.subject}</span>
              </div>
              <div className="mt-0.5 truncate text-sm text-muted-foreground">{entry.reasons.join(" · ")}</div>
            </div>
            <div className="tabular text-xl font-semibold text-critical-ink">{money(entry.cents)}</div>
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </Card>

      <p className="text-sm text-muted-foreground">{proof.join("   ·   ")}</p>
    </div>
  );
}

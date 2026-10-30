import { CircleAlert, CircleCheck } from "lucide-react";
import { useHealth } from "@/api/client";
import type { EvalSummary, Signal } from "@/api/types";
import { ErrorState, Loading } from "@/components/states";
import { Card } from "@/components/ui/card";
import { percent, periodName } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Whether the AI's reading can still be trusted. */
export function AccuracyPage() {
  const { data: health, error, isLoading } = useHealth();
  if (isLoading) return <Loading />;
  if (error || !health) return <ErrorState error={error ?? new Error("No data")} />;
  const evals = health.evals;
  if (!evals) return <p className="text-muted-foreground">The AI has not been tested yet. Run pnpm eval.</p>;

  const lowest = Math.min(...evals.scores.map(score => score.score));
  const reading = health.modelUse.find(row => row.task === "read-pdf-statement");
  const facts = [
    `${evals.escalations} of ${evals.statements} readings needed the stronger model`,
    reading && `$${reading.costPerCallUsd.toFixed(2)} per statement`,
    "rechecked on every change"
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <p className="text-sm text-muted-foreground">AI accuracy</p>
        <h1 className="tabular mt-1 text-6xl font-semibold tracking-tight">{percent(lowest)}</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          of the AI's readings correct, scored against an answer key.
        </p>
      </section>
      <Scores evals={evals} />
      <p className="text-sm text-muted-foreground">{facts.join("   ·   ")}</p>
      {health.latestPeriod && health.signals.length > 0 && (
        <Signals period={health.latestPeriod} signals={health.signals} />
      )}
    </div>
  );
}

/** The score as a bar; the tick is the minimum it must meet before a change can ship. */
function Scores({ evals }: { evals: EvalSummary }) {
  return (
    <Card className="flex flex-col gap-4 p-6">
      {evals.scores.map(({ measure, label, score, floor }) => (
        <div key={measure} className="grid grid-cols-[minmax(0,14rem)_1fr_3.5rem] items-center gap-4 text-sm">
          <span>{label}</span>
          <div className="relative h-1.5 rounded-full bg-muted" title={`${percent(score)}, minimum ${percent(floor)}`}>
            <div
              className={cn("h-full rounded-full", score >= floor ? "bg-[var(--series-1)]" : "bg-critical")}
              style={{ width: `${score * 100}%` }}
            />
            <div className="absolute -top-1 h-3.5 w-0.5 bg-foreground/70" style={{ left: `${floor * 100}%` }} />
          </div>
          <span className="tabular text-right font-medium">{percent(score)}</span>
        </div>
      ))}
    </Card>
  );
}

/** What would show the checks stopped working or quietly got worse, for the latest period. */
function Signals({ period, signals }: { period: string; signals: Signal[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm text-muted-foreground">Watched every month · {periodName(period)}</h2>
      <Card className="divide-y">
        {signals.map(signal => (
          <div key={signal.label} className="flex items-center gap-3 px-6 py-3 text-sm">
            {signal.status === "ok" ? (
              <CircleCheck className="size-4 shrink-0 text-good-ink" aria-label="Normal" />
            ) : (
              <CircleAlert className="size-4 shrink-0 text-warning-ink" aria-label="Needs a look" />
            )}
            <span className="flex-1">{signal.label}</span>
            <span className={cn("tabular", signal.status === "alert" && "font-medium text-warning-ink")}>
              {signal.value}
            </span>
          </div>
        ))}
      </Card>
    </section>
  );
}

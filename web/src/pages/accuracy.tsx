import { CircleAlert, CircleCheck } from "lucide-react";
import { useHealth } from "@/api/client";
import type { EvalSummary, HealthView } from "@/api/types";
import { PageHeader } from "@/components/page-header";
import { ErrorState, Loading } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateTime, percent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Whether the AI can still be trusted with the reading. A crash is easy to notice; this page is
 * for the quiet failure, where it keeps running but reads worse.
 */
export function AccuracyPage() {
  const { data: health, error, isLoading } = useHealth();
  if (isLoading) return <Loading />;
  if (error || !health) return <ErrorState error={error ?? new Error("No data")} />;

  return (
    <>
      <PageHeader
        title="AI accuracy"
        description="How the reading is checked, so a model that gets worse is caught before it costs money."
      />
      <div className="flex flex-col gap-6">
        <Evals evals={health.evals} />
        <Cost health={health} />
      </div>
    </>
  );
}

function Evals({ evals }: { evals: EvalSummary | null }) {
  if (!evals) {
    return (
      <Card className="p-6 text-sm">
        <div className="font-medium">The AI has not been tested yet.</div>
        <p className="mt-1 text-muted-foreground">
          Run <code className="rounded bg-muted px-1">pnpm eval</code> to score it against the answer key.
        </p>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Tested against an answer key</CardTitle>
          <CardDescription>
            Every change to a prompt or a model is scored before it can ship. Last run {dateTime(evals.ranAt)}.
          </CardDescription>
        </div>
        {evals.passed ? (
          <Badge tone="good">
            <CircleCheck /> Every minimum met
          </Badge>
        ) : (
          <Badge tone="critical">
            <CircleAlert /> Below a minimum
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {evals.scores.map(score => (
          <ScoreRow key={score.measure} {...score} />
        ))}
        <p className="text-xs text-muted-foreground">
          The bar is the score; the tick is the minimum it must meet. On a real statement every number the AI reads must
          also add up to the carrier's printed total, or the statement is held.
        </p>
        <div className="mt-2 grid gap-4 border-t pt-4 md:grid-cols-2">
          <Figure value={`${evals.escalations} of ${evals.statements}`} label="readings needed the stronger model">
            Sonnet reads first; Opus retries only a reading that does not add up. A rising count is the early warning
            that a carrier's documents changed or the model got worse.
          </Figure>
          <Figure value="Every push" label="when the scores are checked">
            Recorded answers replay in seconds and for free, so the check runs on every change, not once a quarter.
          </Figure>
        </div>
      </CardContent>
    </Card>
  );
}

/** A bullet bar: the score as a fill, the minimum as a tick, the number beside it. */
function ScoreRow({ label, score, floor }: { label: string; score: number; floor: number }) {
  const meets = score >= floor;
  return (
    <div className="grid grid-cols-[minmax(0,14rem)_1fr_4rem] items-center gap-4 text-sm">
      <span>{label}</span>
      <div className="relative h-2 rounded-full bg-muted" title={`${percent(score)}, minimum ${percent(floor)}`}>
        <div
          className={cn("h-full rounded-full", meets ? "bg-[var(--series-1)]" : "bg-critical")}
          style={{ width: `${score * 100}%` }}
        />
        <div className="absolute -top-1 h-4 w-0.5 bg-foreground" style={{ left: `${floor * 100}%` }} />
      </div>
      <span className={cn("tabular text-right font-medium", !meets && "text-critical-ink")}>{percent(score)}</span>
    </div>
  );
}

function Figure({ value, label, children }: { value: string; label: string; children: string }) {
  return (
    <div>
      <div className="tabular text-2xl font-semibold tracking-tight">{value}</div>
      <div className="text-sm font-medium">{label}</div>
      <p className="mt-1 text-xs text-muted-foreground">{children}</p>
    </div>
  );
}

function Cost({ health }: { health: HealthView }) {
  if (health.modelUse.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>What it costs</CardTitle>
        <CardDescription>The AI's work in the latest run, at list prices.</CardDescription>
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">Task</TableHead>
            <TableHead>Model</TableHead>
            <TableHead className="text-right">Calls</TableHead>
            <TableHead className="pr-5 text-right">Cost per call</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {health.modelUse.map(row => (
            <TableRow key={`${row.task}-${row.model}`}>
              <TableCell className="pl-5">{TASKS[row.task] ?? row.task}</TableCell>
              <TableCell className="text-muted-foreground">{row.model}</TableCell>
              <TableCell className="tabular text-right">{row.calls}</TableCell>
              <TableCell className="tabular pr-5 text-right font-medium">${row.costPerCallUsd.toFixed(3)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

const TASKS: Record<string, string> = {
  "read-pdf-statement": "Read a PDF statement",
  "propose-csv-format": "Map a changed file layout",
  "read-bonus-agreement": "Read a bonus agreement"
};

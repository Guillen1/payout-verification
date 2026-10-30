import { CircleAlert, CircleCheck } from "lucide-react";
import { useHealth } from "@/api/client";
import type { EvalSummary, HealthView } from "@/api/types";
import { PageHeader } from "@/components/page-header";
import { ErrorState, Loading } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateTime, percent, periodName } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Whether the system still works. A crash is easy to notice; this page is for the quiet failures:
 * the model reading worse, statements held, the model being asked more than it should.
 */
export function HealthPage() {
  const { data: health, error, isLoading } = useHealth();
  if (isLoading) return <Loading />;
  if (error || !health) return <ErrorState error={error ?? new Error("No data")} />;

  return (
    <>
      <PageHeader
        title="Health"
        description="The signals that say whether the system still works, not just whether it ran."
      />
      <div className="flex flex-col gap-6">
        <Evals evals={health.evals} />
        <Held health={health} />
        <ModelUse health={health} />
      </div>
    </>
  );
}

function Evals({ evals }: { evals: EvalSummary | null }) {
  if (!evals) {
    return (
      <Card className="p-6 text-sm">
        <div className="font-medium">The model has not been evaluated yet.</div>
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
          <CardTitle>Model evals against the answer key</CardTitle>
          <CardDescription>
            {dateTime(evals.ranAt)} · {evals.calls} calls, {evals.replayed} replayed · {evals.escalations} of{" "}
            {evals.statements} PDF readings retried on the stronger model
          </CardDescription>
        </div>
        {evals.passed ? (
          <Badge tone="good">
            <CircleCheck /> Every floor met
          </Badge>
        ) : (
          <Badge tone="critical">
            <CircleAlert /> Below a floor
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {evals.scores.map(score => (
          <ScoreRow key={score.measure} {...score} />
        ))}
        <p className="text-xs text-muted-foreground">
          The bar is the score; the tick is the floor it must meet. CI runs these on every push from recorded answers,
          and a change that drops a score below its floor cannot merge.
        </p>
      </CardContent>
    </Card>
  );
}

/** A bullet bar: the score as a fill, the floor as a tick, the number beside it. */
function ScoreRow({ label, score, floor }: { label: string; score: number; floor: number }) {
  const meets = score >= floor;
  return (
    <div className="grid grid-cols-[minmax(0,14rem)_1fr_4rem] items-center gap-4 text-sm">
      <span>{label}</span>
      <div className="relative h-2 rounded-full bg-muted" title={`${percent(score)}, floor ${percent(floor)}`}>
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

function Held({ health }: { health: HealthView }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Held statements</CardTitle>
        <CardDescription>
          {health.latestPeriod
            ? `In ${periodName(health.latestPeriod)}, the latest period run.`
            : "No period has run yet."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {health.held.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleCheck className="size-4 text-good" /> Every statement was processed.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {health.held.map(entry => (
              <li key={entry.carrier} className="rounded-lg border p-3 text-sm">
                <div className="font-medium">{entry.carrier}</div>
                <div className="text-muted-foreground">{entry.reason}</div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ModelUse({ health }: { health: HealthView }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>What the model was asked</CardTitle>
        <CardDescription>The latest period and bonus runs. Replayed answers cost nothing.</CardDescription>
      </CardHeader>
      {health.modelUse.length === 0 ? (
        <CardContent className="text-sm text-muted-foreground">No model calls.</CardContent>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Task</TableHead>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Calls</TableHead>
              <TableHead className="text-right">Tokens in / out</TableHead>
              <TableHead className="pr-5 text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {health.modelUse.map(row => (
              <TableRow key={`${row.task}-${row.model}`}>
                <TableCell className="pl-5 whitespace-nowrap">{row.task}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{row.model}</TableCell>
                <TableCell className="tabular text-right whitespace-nowrap">
                  {row.calls}
                  {row.replayed > 0 && <span className="text-muted-foreground"> ({row.replayed} replayed)</span>}
                </TableCell>
                <TableCell className="tabular text-right text-muted-foreground">
                  {row.inputTokens.toLocaleString()} / {row.outputTokens.toLocaleString()}
                </TableCell>
                <TableCell className="tabular pr-5 text-right">${row.costUsd.toFixed(4)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

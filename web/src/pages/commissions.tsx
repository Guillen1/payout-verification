import { ArrowRight } from "lucide-react";
import { Link, useParams } from "react-router";
import { ApiError, usePeriod, useRunPeriod } from "@/api/client";
import type { CarrierView } from "@/api/types";
import { PageHeader } from "@/components/page-header";
import { ErrorState, Loading, NotRunYet, RunButton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { money, periodName } from "@/lib/format";

/** One month of carrier statements: what each paid and what it still owes. */
export function CommissionsPage() {
  const { period = "" } = useParams();
  const { data: view, error, isLoading } = usePeriod(period);
  const run = useRunPeriod();
  const runPeriod = () => run.mutate(period);

  if (isLoading) return <Loading />;
  if (error instanceof ApiError && error.status === 404) {
    return <NotRunYet what={periodName(period)} onRun={runPeriod} running={run.isPending} />;
  }
  if (error || !view) return <ErrorState error={error ?? new Error("No data")} />;

  return (
    <>
      <PageHeader
        eyebrow={`${periodName(view.period)} commissions`}
        title={<span className="tabular text-4xl">{money(view.totals.owedCents)} owed</span>}
        description={`of ${money(view.totals.paidCents)} paid by ${view.carriers.length} carriers`}
        actions={<RunButton onRun={runPeriod} running={run.isPending} label="Run again" />}
      />
      <Card className="divide-y">
        {view.carriers.map(carrier => (
          <CarrierRow key={carrier.id} period={view.period} carrier={carrier} />
        ))}
      </Card>
    </>
  );
}

function CarrierRow({ period, carrier }: { period: string; carrier: CarrierView }) {
  return (
    <Link
      to={`/periods/${period}/carriers/${carrier.id}`}
      className="group flex items-center gap-6 px-6 py-5 transition-colors hover:bg-muted/40"
    >
      <div className="min-w-0 flex-1">
        <div className="font-medium">{carrier.name}</div>
        <div className="text-sm text-muted-foreground">
          {carrier.totals ? `${money(carrier.totals.paidCents)} paid` : carrier.hold?.reason}
        </div>
      </div>
      {carrier.state === "processed" ? (
        carrier.owedCents > 0 ? (
          <span className="tabular text-lg font-semibold text-critical-ink">{money(carrier.owedCents)}</span>
        ) : (
          <Badge tone="good">Paid in full</Badge>
        )
      ) : (
        <Badge tone="warning">Held</Badge>
      )}
      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

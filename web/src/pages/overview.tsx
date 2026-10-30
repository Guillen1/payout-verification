import { ArrowRight, FileSpreadsheet, FileText } from "lucide-react";
import { Link, useParams } from "react-router";
import { ApiError, usePeriod, useRunPeriod } from "@/api/client";
import type { CarrierView, PeriodView } from "@/api/types";
import { AllocationBar, AllocationLegend } from "@/components/allocation-bar";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { ErrorState, Loading, NotRunYet, RunButton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { dateTime, money, periodName } from "@/lib/format";

/** One period at a glance: is it safe to pay, and what needs a person. */
export function OverviewPage() {
  const { period = "" } = useParams();
  const { data: view, error, isLoading } = usePeriod(period);
  const run = useRunPeriod();
  const runPeriod = () => run.mutate(period);

  if (isLoading) return <Loading />;
  if (error instanceof ApiError && error.status === 404) {
    return (
      <>
        <PageHeader title={`${periodName(period)} commissions`} />
        <NotRunYet what={periodName(period)} onRun={runPeriod} running={run.isPending} />
      </>
    );
  }
  if (error || !view) return <ErrorState error={error ?? new Error("No data")} />;

  return (
    <>
      <PageHeader
        eyebrow={view.tenantName}
        title={`${periodName(view.period)} commissions`}
        description={`Last run ${dateTime(view.ranAt)}`}
        actions={<RunButton onRun={runPeriod} running={run.isPending} label="Run again" />}
      />

      <Totals view={view} />

      <div className="mt-8 mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Carriers</h2>
        <AllocationLegend />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {view.carriers.map(carrier => (
          <CarrierCard key={carrier.id} period={view.period} carrier={carrier} />
        ))}
      </div>

      <ModelNote view={view} />
    </>
  );
}

function Totals({ view }: { view: PeriodView }) {
  const { totals } = view;
  const held = view.carriers.filter(carrier => carrier.state !== "processed").length;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <Stat
        label="Paid by carriers"
        value={money(totals.paidCents)}
        hint={`${view.carriers.length - held} of ${view.carriers.length} statements processed`}
      />
      <Stat label="To agencies" value={money(totals.toAgenciesCents)} />
      <Stat label="Kept by the network" value={money(totals.toNetworkCents)} />
      <Stat
        label="Held for review"
        value={money(totals.heldCents)}
        tone={totals.heldCents > 0 ? "warning" : "neutral"}
        hint="Not paid out until a person decides"
      />
      <Stat
        label="Owed by carriers"
        value={money(totals.owedCents)}
        tone={totals.owedCents > 0 ? "critical" : "neutral"}
        hint="Underpaid lines and missing commission"
      />
    </div>
  );
}

function CarrierCard({ period, carrier }: { period: string; carrier: CarrierView }) {
  const FileIcon = carrier.fileKind === "pdf" ? FileText : FileSpreadsheet;
  return (
    <Link to={`/periods/${period}/carriers/${carrier.id}`} className="group">
      <Card className="flex h-full flex-col p-5 transition-shadow group-hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold">{carrier.name}</div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <FileIcon className="size-3.5" />
              {carrier.fileKind.toUpperCase()} statement
            </div>
          </div>
          <StateBadge carrier={carrier} />
        </div>

        {carrier.totals ? (
          <>
            <div className="tabular mt-4 text-2xl font-semibold tracking-tight">{money(carrier.totals.paidCents)}</div>
            <div className="mb-3 text-xs text-muted-foreground">paid this period</div>
            <AllocationBar amounts={carrier.totals} />
            <div className="mt-4 flex flex-wrap gap-1.5">
              <Badge tone="good">{carrier.counts.clear} clear</Badge>
              {carrier.counts.dispute > 0 && <Badge tone="critical">{carrier.counts.dispute} dispute</Badge>}
              {carrier.counts.review > 0 && <Badge tone="warning">{carrier.counts.review} review</Badge>}
              {carrier.counts.missing > 0 && <Badge tone="critical">{carrier.counts.missing} never paid</Badge>}
            </div>
          </>
        ) : (
          <div className="mt-4 text-sm">
            <p className="font-medium">{carrier.hold?.reason}</p>
            {carrier.hold?.details[0] && <p className="mt-1 text-muted-foreground">{carrier.hold.details[0]}</p>}
            {carrier.hold?.details.some(detail => detail.includes("waiting for approval")) && (
              <Badge tone="warning" className="mt-3">
                New mapping waiting for approval
              </Badge>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between pt-4 text-sm">
          {carrier.owedCents > 0 ? (
            <span className="tabular font-medium text-critical-ink">Owed {money(carrier.owedCents)}</span>
          ) : (
            <span className="text-muted-foreground">{carrier.state === "processed" ? "Nothing owed" : ""}</span>
          )}
          <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>
      </Card>
    </Link>
  );
}

function StateBadge({ carrier }: { carrier: CarrierView }) {
  switch (carrier.state) {
    case "processed":
      return <Badge tone="good">Reconciled</Badge>;
    case "held":
      return <Badge tone="warning">Held</Badge>;
    case "not_received":
      return <Badge tone="warning">Not received</Badge>;
  }
}

function ModelNote({ view }: { view: PeriodView }) {
  if (view.modelCalls.length === 0) return null;
  const models = [...new Set(view.modelCalls.map(call => call.model))].join(", ");
  const replayed = view.modelCalls.filter(call => call.source === "recording").length;
  return (
    <p className="mt-8 text-xs text-muted-foreground">
      PDF statements read by {models}. {view.modelCalls.length} model call(s)
      {replayed > 0 ? `, ${replayed} replayed from recordings` : ""}. The model reads; every amount is computed and
      checked by code.
    </p>
  );
}

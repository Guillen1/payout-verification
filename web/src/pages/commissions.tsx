import { ArrowRight, FileSpreadsheet, FileText } from "lucide-react";
import { Link, useParams } from "react-router";
import { ApiError, usePeriod, useRunPeriod } from "@/api/client";
import type { CarrierView, PeriodView } from "@/api/types";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { ErrorState, Loading, NotRunYet, RunButton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { dateTime, money, periodName } from "@/lib/format";

/** One month of carrier statements: what each carrier paid, what it still owes, what needs a person. */
export function CommissionsPage() {
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

      <h2 className="mt-8 mb-3 text-sm font-semibold">Carriers</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {view.carriers.map(carrier => (
          <CarrierCard key={carrier.id} period={view.period} carrier={carrier} />
        ))}
      </div>
    </>
  );
}

function Totals({ view }: { view: PeriodView }) {
  const { totals } = view;
  const processed = view.carriers.filter(carrier => carrier.state === "processed").length;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Stat
        label="Paid by carriers"
        value={money(totals.paidCents)}
        hint={`${processed} of ${view.carriers.length} statements checked`}
      />
      <Stat
        label="Owed by carriers"
        value={money(totals.owedCents)}
        tone={totals.owedCents > 0 ? "critical" : "neutral"}
        hint="Paid below the agreed rate, or never paid"
      />
      <Stat
        label="Held for review"
        value={money(totals.heldCents)}
        tone={totals.heldCents > 0 ? "warning" : "neutral"}
        hint="Not paid out until a person decides"
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
            <div className="text-xs text-muted-foreground">paid this period</div>
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

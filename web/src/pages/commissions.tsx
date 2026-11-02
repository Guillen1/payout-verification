import { ArrowRight } from "lucide-react";
import { Link, useParams } from "react-router";
import { ApiError, usePeriod, useRunPeriod } from "@/api/client";
import type { CarrierView, PeriodView } from "@/api/types";
import { PageHeader } from "@/components/page-header";
import { ErrorState, Loading, NotRunYet, RunButton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { money, periodName } from "@/lib/format";
import { useWords, type TenantWords } from "@/lib/words";

/** One month of carrier statements: what each paid and what it still owes. */
export function CommissionsPage() {
  const { period = "" } = useParams();
  const { data: view, error, isLoading } = usePeriod(period);
  const run = useRunPeriod();
  const words = useWords();
  const runPeriod = () => run.mutate(period);

  if (isLoading) return <Loading />;
  if (error instanceof ApiError && error.status === 404) {
    return <NotRunYet what={periodName(period)} onRun={runPeriod} running={run.isPending} />;
  }
  if (error || !view) return <ErrorState error={error ?? new Error("No data")} />;

  return (
    <>
      <PageHeader
        eyebrow={`${periodName(view.period)} ${words.payments}`}
        title={<span className="tabular text-4xl">{money(view.totals.owedCents)} owed</span>}
        description={`of ${money(view.totals.paidCents)} paid by ${view.carriers.length} ${words.counterparties}`}
        actions={<RunButton onRun={runPeriod} running={run.isPending} label="Run again" />}
      />
      <Card className="divide-y">
        {view.carriers.map(carrier => (
          <CarrierRow key={carrier.id} period={view.period} carrier={carrier} />
        ))}
      </Card>
      {view.payouts.length > 0 && <Split view={view} words={words} />}
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

/**
 * Where the money that was paid goes: each partner's share and what the organization keeps, one bar
 * per partner. Money held for a person is in neither until it is decided.
 */
function Split({ view, words }: { view: PeriodView; words: TenantWords }) {
  const largest = Math.max(...view.payouts.map(payout => payout.paidCents));
  const { toAgenciesCents, toNetworkCents, heldCents } = view.totals;
  return (
    <section className="mt-12 flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">
          Split between the {words.partners} and {words.organization}
        </h2>
        <p className="text-sm text-muted-foreground">
          {money(toAgenciesCents)} to the {words.partners} · {money(toNetworkCents)} kept by {words.organization}
          {heldCents > 0 && ` · ${money(heldCents)} held until a person decides`}
        </p>
      </div>
      <Card className="divide-y">
        {view.payouts.map(payout => (
          <div
            key={payout.agency}
            className="grid grid-cols-[minmax(0,13rem)_1fr_auto] items-center gap-6 px-6 py-3 text-sm"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{payout.agency}</div>
              <div className="text-xs text-muted-foreground">
                {payout.lines} lines · {money(payout.paidCents)} paid
              </div>
            </div>
            <div
              className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
              style={{ width: `${(payout.paidCents / largest) * 100}%` }}
              title={`${money(payout.agencyCents)} to the ${words.partner}, ${money(payout.networkCents)} kept by ${words.organization}`}
            >
              <div className="h-full bg-[var(--series-1)]" style={{ flexGrow: payout.agencyCents }} />
              {payout.networkCents > 0 && (
                <div className="h-full bg-muted-foreground/40" style={{ flexGrow: payout.networkCents }} />
              )}
            </div>
            <div className="tabular text-right">
              <div className="font-medium">{money(payout.agencyCents)}</div>
              <div className="text-xs text-muted-foreground">+ {money(payout.networkCents)} kept</div>
            </div>
          </div>
        ))}
      </Card>
      <div className="flex gap-5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[var(--series-1)]" /> To the {words.partner}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-muted-foreground/40" /> Kept by {words.organization}
        </span>
      </div>
    </section>
  );
}

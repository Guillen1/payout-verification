import { Navigate, useParams } from "react-router";
import { ApiError, useBonus, useBonusLetter, useBonusPrograms, useRunBonus } from "@/api/client";
import type { BonusView } from "@/api/types";
import { ApprovalPanel } from "@/components/approval-panel";
import { BonusPicture } from "@/components/bonus-picture";
import { LetterDialog } from "@/components/letter-dialog";
import { PageHeader } from "@/components/page-header";
import { ErrorState, Loading, NotRunYet, RunButton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { money, rate } from "@/lib/format";
import { capitalized, useWords } from "@/lib/words";

/** With no program in the address, open the first one. */
export function BonusIndexPage() {
  const { data: programs, error, isLoading } = useBonusPrograms();
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  const first = programs?.[0];
  if (!first) return <PageHeader title="Profit sharing" description="No bonus programs are configured." />;
  return <Navigate to={`/bonus/${first.id}`} replace />;
}

/** One bonus: what was owed, what was paid, and why they differ. The calculation is one click away. */
export function BonusPage() {
  const { programId = "" } = useParams();
  const { data: view, error, isLoading } = useBonus(programId);
  const run = useRunBonus();
  const runProgram = () => run.mutate(programId);
  const useLetter = (enabled: boolean) => useBonusLetter(programId, enabled);

  if (isLoading) return <Loading />;
  if (error instanceof ApiError && error.status === 404) {
    return <NotRunYet what="This bonus" onRun={runProgram} running={run.isPending} />;
  }
  if (error || !view) return <ErrorState error={error ?? new Error("No data")} />;

  const check = view.check;
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={`${view.carrierName} · ${view.programYear} profit-sharing bonus`}
        title={
          check ? (
            <span className="tabular text-4xl">
              {check.disposition === "dispute" ? `${money(-check.varianceCents)} owed` : "Paid as agreed"}
            </span>
          ) : (
            "Not checked yet"
          )
        }
        description={check && `Paid ${money(check.paidCents)} · the agreement supports ${money(check.expectedCents)}`}
        actions={
          <>
            {check?.disposition === "dispute" && (
              <LetterDialog title={`Letter to ${view.carrierName}`} useLetter={useLetter} />
            )}
            <RunButton onRun={runProgram} running={run.isPending} label={check ? "Check again" : "Check"} />
          </>
        }
      />
      {check ? <Checked view={view} check={check} /> : <ApprovalPanel approvalId={`bonus:${view.programId}`} />}
    </div>
  );
}

function Checked({ view, check }: { view: BonusView; check: NonNullable<BonusView["check"]> }) {
  const words = useWords();
  return (
    <>
      {view.picture && <BonusPicture picture={view.picture} counterparty={capitalized(words.counterparty)} />}
      <Card className="divide-y">
        {check.findings.map(finding => (
          <div key={finding.description} className="flex items-start gap-4 px-6 py-4 text-sm">
            <Badge tone="outline" className="mt-0.5">
              § {finding.clause}
            </Badge>
            <span>{finding.description.replace(/ \(clause [\d.]+\)\.?$/, ".")}</span>
          </div>
        ))}
      </Card>

      {view.allocation && <BonusSplit view={view} check={check} allocation={view.allocation} />}

      <details className="group">
        <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
          Show the calculation
        </summary>
        <Card className="mt-3 divide-y">
          {check.steps.map(step => (
            <div key={step.step} className="flex items-center gap-4 px-6 py-3 text-sm">
              <span className="flex-1">{step.step}</span>
              <span className="tabular font-medium">{step.value}</span>
              <span className="w-12 text-right text-xs text-muted-foreground">{step.clause && `§ ${step.clause}`}</span>
            </div>
          ))}
        </Card>
      </details>
    </>
  );
}

/**
 * Who gets the bonus that was paid: the network's share, and the rest to each agency in proportion
 * to the premium it sold, from the network's own records. An agency the carrier left off its
 * statement still gets its share.
 */
function BonusSplit({
  view,
  check,
  allocation
}: {
  view: BonusView;
  check: NonNullable<BonusView["check"]>;
  allocation: NonNullable<BonusView["allocation"]>;
}) {
  const words = useWords();
  const agencies = [...allocation.agencies].sort((a, b) => b.agencyCents - a.agencyCents);
  const toAgencies = agencies.reduce((sum, agency) => sum + agency.agencyCents, 0);
  const largest = Math.max(...agencies.map(agency => agency.agencyCents));
  const leftOut = new Set(
    (view.picture?.agencies ?? [])
      .filter(agency => agency.statementCents < agency.networkCents)
      .map(agency => agency.name)
  );

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">
          Split between the {words.partners} and {words.organization}
        </h2>
        <p className="text-sm text-muted-foreground">
          Of {money(check.paidCents)} paid: {money(toAgencies)} to the {words.partners} by the premium each sold ·{" "}
          {money(allocation.networkCents)} kept by {words.organization} ({rate(allocation.networkShareBps)}).
          {check.varianceCents < 0 && ` The ${money(-check.varianceCents)} owed is split the same way when it is paid.`}
        </p>
      </div>
      <Card className="divide-y">
        {agencies.map(agency => (
          <div
            key={agency.agencyId}
            className="grid grid-cols-[minmax(0,13rem)_1fr_auto] items-center gap-6 px-6 py-3 text-sm"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{agency.name}</div>
              <div className="text-xs text-muted-foreground">
                {leftOut.has(agency.name)
                  ? "left off the statement, still gets its share"
                  : `${money(agency.eligiblePremiumCents)} premium`}
              </div>
            </div>
            <div
              className="h-2.5 rounded-full bg-[var(--series-1)]"
              style={{ width: `${(agency.agencyCents / largest) * 100}%` }}
            />
            <div className="tabular text-right font-medium">{money(agency.agencyCents)}</div>
          </div>
        ))}
      </Card>
    </section>
  );
}

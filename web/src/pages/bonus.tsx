import { Navigate, useParams } from "react-router";
import { ApiError, useBonus, useBonusLetter, useBonusPrograms, useRunBonus } from "@/api/client";
import type { BonusView } from "@/api/types";
import { ApprovalPanel } from "@/components/approval-panel";
import { LetterDialog } from "@/components/letter-dialog";
import { PageHeader } from "@/components/page-header";
import { ErrorState, Loading, NotRunYet, RunButton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { money } from "@/lib/format";

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
      {check ? <Checked check={check} /> : <ApprovalPanel approvalId={`bonus:${view.programId}`} />}
    </div>
  );
}

function Checked({ check }: { check: NonNullable<BonusView["check"]> }) {
  return (
    <>
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

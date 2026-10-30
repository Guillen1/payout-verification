import { CircleAlert } from "lucide-react";
import { Navigate, useParams } from "react-router";
import { ApiError, useBonus, useBonusLetter, useBonusPrograms, useRunBonus } from "@/api/client";
import type { BonusView } from "@/api/types";
import { ApprovalPanel } from "@/components/approval-panel";
import { AgencyShares } from "@/components/bonus-charts";
import { DispositionBadge } from "@/components/disposition-badge";
import { LetterDialog } from "@/components/letter-dialog";
import { PageHeader } from "@/components/page-header";
import { ErrorState, Loading, NotRunYet, RunButton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { dateTime, money, rate } from "@/lib/format";

/** With no program in the address, open the first one. */
export function BonusIndexPage() {
  const { data: programs, error, isLoading } = useBonusPrograms();
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  const first = programs?.[0];
  if (!first) return <PageHeader title="Profit sharing" description="No bonus programs are configured." />;
  return <Navigate to={`/bonus/${first.id}`} replace />;
}

/** One program year: what the agreement supports, what was paid, why they differ, and the split. */
export function BonusPage() {
  const { programId = "" } = useParams();
  const { data: view, error, isLoading } = useBonus(programId);
  const run = useRunBonus();
  const runProgram = () => run.mutate(programId);
  const useLetter = (enabled: boolean) => useBonusLetter(programId, enabled);

  if (isLoading) return <Loading />;
  if (error instanceof ApiError && error.status === 404) {
    return (
      <>
        <PageHeader eyebrow="Profit sharing" title={programId} />
        <NotRunYet what="This bonus program" onRun={runProgram} running={run.isPending} />
      </>
    );
  }
  if (error || !view) return <ErrorState error={error ?? new Error("No data")} />;

  return (
    <>
      <PageHeader
        eyebrow="Profit sharing"
        title={`${view.carrierName}, program year ${view.programYear}`}
        description={`Last checked ${dateTime(view.ranAt)}`}
        actions={
          <>
            {view.check?.disposition === "dispute" && (
              <LetterDialog title={`Letter to ${view.carrierName}`} useLetter={useLetter} />
            )}
            <RunButton onRun={runProgram} running={run.isPending} label="Check again" />
          </>
        }
      />
      {view.check && view.allocation ? <Checked view={view} /> : <NotChecked view={view} />}
    </>
  );
}

function NotChecked({ view }: { view: BonusView }) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="border-warning/40 bg-warning-soft/40 p-6">
        <div className="font-semibold">Not checked yet. {view.hold?.reason}</div>
        {view.status !== "awaiting_approval" && (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {view.hold?.details.map(detail => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        )}
      </Card>
      {view.status === "awaiting_approval" && <ApprovalPanel approvalId={`bonus:${view.programId}`} />}
    </div>
  );
}

function Checked({ view }: { view: BonusView }) {
  const check = view.check!;
  const allocation = view.allocation!;

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <DispositionBadge disposition={check.disposition} />
        <div className="tabular mt-3 text-5xl font-semibold tracking-tight">
          {money(check.disposition === "dispute" ? -check.varianceCents : check.paidCents)}
        </div>
        <p className="mt-2 text-muted-foreground">{headline(check)}</p>
        <div className="mt-5 flex flex-wrap gap-x-10 gap-y-2 text-sm">
          <span>
            <span className="text-muted-foreground">Carrier paid </span>
            <span className="tabular font-medium">{money(check.paidCents)}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Agreement supports </span>
            <span className="tabular font-medium">{money(check.expectedCents)}</span>
          </span>
        </div>
      </Card>

      {check.findings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Why</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {check.findings.map(finding => (
              <div key={finding.description} className="flex gap-3 rounded-lg border p-3">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-critical" />
                <p className="text-sm">{finding.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>How the expected bonus was computed</CardTitle>
          <CardDescription>
            From the approved rules, clause by clause. Earned premium and losses are the carrier's figures.
          </CardDescription>
        </CardHeader>
        <Table>
          <TableBody>
            {check.steps.map(step => (
              <TableRow key={step.step}>
                <TableCell className="pl-5 text-sm">{step.step}</TableCell>
                <TableCell className="tabular text-right font-medium whitespace-nowrap">{step.value}</TableCell>
                <TableCell className="w-20 pr-5">
                  {step.clause && <Badge tone="outline">§ {step.clause}</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Who gets the bonus that was paid</CardTitle>
          <CardDescription>
            The network keeps {rate(allocation.networkShareBps)} ({money(allocation.networkCents)}); agencies share the
            rest by the premium each wrote. The underpayment, once recovered, is split the same way.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AgencyShares allocation={allocation} />
        </CardContent>
      </Card>
    </div>
  );
}

function headline(check: NonNullable<BonusView["check"]>): string {
  switch (check.disposition) {
    case "dispute":
      return "owed by the carrier under the agreement.";
    case "review":
      return `paid, ${money(check.varianceCents)} more than the agreement supports. Check before accepting it.`;
    case "clear":
      return "paid, matching what the agreement supports.";
  }
}

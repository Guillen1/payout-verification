import { BadgeCheck, CircleAlert } from "lucide-react";
import { Link, Navigate, useParams } from "react-router";
import { ApiError, useBonus, useBonusLetter, useBonusPrograms, useRunBonus } from "@/api/client";
import type { BonusView } from "@/api/types";
import { AgencyShares, PaidVsExpected } from "@/components/bonus-charts";
import { DispositionBadge } from "@/components/disposition-badge";
import { LetterDialog } from "@/components/letter-dialog";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { ErrorState, Loading, NotRunYet, RunButton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
    <Card className="border-warning/40 bg-warning-soft/40 p-6">
      <div className="font-semibold">Not checked. {view.hold?.reason}</div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {view.hold?.details.map(detail => (
          <li key={detail}>{detail}</li>
        ))}
      </ul>
      {view.status === "awaiting_approval" && view.draft && (
        <Button asChild className="mt-4">
          <Link to="/approvals">
            <BadgeCheck /> Review the drafted rules
          </Link>
        </Button>
      )}
    </Card>
  );
}

function Checked({ view }: { view: BonusView }) {
  const check = view.check!;
  const allocation = view.allocation!;
  const owed = -check.varianceCents;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="grid gap-6 pt-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:items-center">
          <div>
            <DispositionBadge disposition={check.disposition} />
            <div className="tabular mt-3 text-3xl font-semibold tracking-tight">
              {check.disposition === "dispute" ? money(owed) : money(check.paidCents)}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{headline(check)}</p>
          </div>
          <PaidVsExpected paidCents={check.paidCents} expectedCents={check.expectedCents} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>How the expected bonus was computed</CardTitle>
            <CardDescription>
              By code, from the approved rules. Earned premium and losses are the carrier's figures.
            </CardDescription>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Step</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="pr-5">Clause</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {check.steps.map(step => (
                <TableRow key={step.step}>
                  <TableCell className="pl-5 text-sm">{step.step}</TableCell>
                  <TableCell className="tabular text-right font-medium whitespace-nowrap">{step.value}</TableCell>
                  <TableCell className="pr-5">{step.clause && <Badge tone="outline">§ {step.clause}</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Findings</CardTitle>
            <CardDescription>Where the statement departs from the agreement or the network's records.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {check.findings.length === 0 && (
              <p className="text-sm text-muted-foreground">
                The statement matches the agreement and the network's records.
              </p>
            )}
            {check.findings.map(finding => (
              <div key={finding.description} className="flex gap-3 rounded-lg border p-3">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-critical" />
                <p className="text-sm">{finding.description}</p>
              </div>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Stat label="Loss ratio" value={rate(check.lossRatioBps)} hint="Carrier's figures" />
              <Stat label="Rate the agreement sets" value={rate(check.rateBps)} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Split of the bonus that was paid</CardTitle>
          <CardDescription>
            The network keeps {rate(allocation.networkShareBps)} ({money(allocation.networkCents)}). The rest goes to
            agencies by the eligible premium each wrote, to the cent. A recovered underpayment is split the same way.
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
      return `owed by the carrier. It paid ${money(check.paidCents)}; the agreement and the network's records support ${money(check.expectedCents)}.`;
    case "review":
      return `paid, ${money(check.varianceCents)} more than the agreement supports. Check before accepting it.`;
    case "clear":
      return "paid, matching what the agreement supports.";
  }
}

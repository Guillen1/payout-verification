import { ArrowRight, BadgeCheck, CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import { useState } from "react";
import { useApprovals, useApprove, useRunBonus, useRunPeriod } from "@/api/client";
import type { BonusRules, PendingApproval } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money, rate } from "@/lib/format";

const REVIEWER_KEY = "payout-verification:reviewer";

/**
 * A model's proposal, shown where the problem is: on the held carrier, or on the bonus program
 * waiting for its rules. Approving saves it to config with the reviewer's name and runs again.
 */
export function ApprovalPanel({ approvalId }: { approvalId: string }) {
  const { data: pending } = useApprovals();
  const item = pending?.find(entry => entry.id === approvalId);
  const [reviewer, setReviewer] = useState(readReviewer);
  const approve = useApprove();
  const runPeriod = useRunPeriod();
  const runBonus = useRunBonus();

  if (!item) return null;
  const working = approve.isPending || runPeriod.isPending || runBonus.isPending;
  const canApprove = reviewer.trim().length > 0 && (item.kind !== "layout" || item.verified);

  const approveAndRun = () =>
    approve.mutate(
      { id: item.id, approvedBy: reviewer.trim() },
      { onSuccess: () => (item.kind === "layout" ? runPeriod.mutate(item.period) : runBonus.mutate(item.programId)) }
    );

  return (
    <Card className="border-warning/50">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">
            {item.kind === "layout"
              ? "A new mapping is ready for approval"
              : "The rules from the agreement are ready to check"}
          </CardTitle>
          <CardDescription>
            {item.kind === "layout"
              ? "The carrier renamed columns in its file. A model worked out the new mapping, and code checked it against every line."
              : "A model read the agreement into rules. Check each one against the clause it cites."}
          </CardDescription>
        </div>
        {item.kind === "layout" &&
          (item.verified ? (
            <Badge tone="good">
              <CircleCheck /> Reads every line, ties out to the cent
            </Badge>
          ) : (
            <Badge tone="critical">
              <CircleAlert /> Failed its check
            </Badge>
          ))}
      </CardHeader>
      <CardContent>
        {item.kind === "layout" ? <LayoutChanges item={item} /> : <RulesTable rules={item.rules} notes={item.notes} />}

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
          <Input
            aria-label="Your name"
            className="max-w-56"
            placeholder="Your name"
            value={reviewer}
            onChange={event => {
              setReviewer(event.target.value);
              saveReviewer(event.target.value);
            }}
          />
          <Button disabled={!canApprove || working} onClick={approveAndRun}>
            {working ? <Loader2 className="animate-spin" /> : <BadgeCheck />}
            {item.kind === "layout" ? "Approve and run again" : "Approve and check the bonus"}
          </Button>
          <span className="text-xs text-muted-foreground">Recorded with your name in the approvals log.</span>
          {approve.error && <span className="text-xs text-critical-ink">{approve.error.message}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function LayoutChanges({ item }: { item: Extract<PendingApproval, { kind: "layout" }> }) {
  return (
    <>
      <div className="flex flex-col gap-2">
        {item.changes.map(change => (
          <div key={change.field} className="flex flex-wrap items-center gap-3 text-sm">
            <span className="w-28 text-muted-foreground">{change.field}</span>
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs line-through decoration-muted-foreground/50">
              {change.from}
            </code>
            <ArrowRight className="size-4 text-muted-foreground" />
            <code className="rounded bg-good-soft px-1.5 py-0.5 text-xs text-good-ink">{change.to}</code>
          </div>
        ))}
      </div>
      <details className="mt-4 text-sm text-muted-foreground">
        <summary className="cursor-pointer text-foreground">Show the model's reasoning</summary>
        <p className="mt-2">{item.explanation}</p>
      </details>
    </>
  );
}

function RulesTable({ rules, notes }: { rules: BonusRules; notes: string[] }) {
  const rows = [
    {
      rule: "Eligible lines",
      value: rules.eligibleProducts.products.join(", "),
      clause: rules.eligibleProducts.clause
    },
    {
      rule: "Minimum premium to qualify",
      value: money(rules.minimumPremium.cents),
      clause: rules.minimumPremium.clause
    },
    ...rules.lossRatioBands.bands.map(band => ({
      rule: `Loss ratio up to ${rate(band.upToLossRatioBps)}`,
      value: `${rate(band.rateBps)} bonus`,
      clause: rules.lossRatioBands.clause
    })),
    ...(rules.maximumBonus
      ? [{ rule: "Maximum bonus", value: money(rules.maximumBonus.cents), clause: rules.maximumBonus.clause }]
      : [])
  ];
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Rule</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Clause</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(row => (
            <TableRow key={row.rule}>
              <TableCell>{row.rule}</TableCell>
              <TableCell className="tabular font-medium">{row.value}</TableCell>
              <TableCell>
                <Badge tone="outline">§ {row.clause}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {notes.length > 0 && (
        <div className="mt-4 rounded-lg bg-warning-soft/60 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-warning-ink">
            <CircleAlert className="size-4" /> Terms the rules cannot express. Read before approving.
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {notes.map(note => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function readReviewer(): string {
  try {
    return localStorage.getItem(REVIEWER_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveReviewer(name: string) {
  try {
    localStorage.setItem(REVIEWER_KEY, name);
  } catch {
    // Remembering the name is a convenience; approving works without it.
  }
}

import { ArrowRight, BadgeCheck, CircleAlert, CircleCheck, Info, Loader2 } from "lucide-react";
import { useState } from "react";
import { useApprovals, useApprove, useRunBonus, useRunPeriod } from "@/api/client";
import type { BonusRules, PendingApproval } from "@/api/types";
import { PageHeader } from "@/components/page-header";
import { ErrorState, Loading, RunButton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money, periodName, rate } from "@/lib/format";

const REVIEWER_KEY = "payout-verification:reviewer";

/**
 * Everything a model proposed that would change config. Nothing it proposes takes effect until a
 * person approves it here, and each approval is recorded with the reviewer's name.
 */
export function ApprovalsPage() {
  const { data: pending, error, isLoading } = useApprovals();
  const [reviewer, setReviewer] = useState(() => readReviewer());
  const [approved, setApproved] = useState<{ item: PendingApproval; file: string }[]>([]);

  const saveReviewer = (name: string) => {
    setReviewer(name);
    try {
      localStorage.setItem(REVIEWER_KEY, name);
    } catch {
      // Remembering the name is a convenience; the page works without it.
    }
  };

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Model proposals that change config. Each one is checked by code first, and takes effect only once a person approves it."
      />

      <Card className="mb-6 flex flex-wrap items-center gap-3 p-4">
        <label htmlFor="reviewer" className="text-sm font-medium">
          Approving as
        </label>
        <Input
          id="reviewer"
          className="max-w-xs"
          placeholder="Your name"
          value={reviewer}
          onChange={event => saveReviewer(event.target.value)}
        />
        <span className="text-xs text-muted-foreground">
          Recorded with every approval in the tenant's approvals log.
        </span>
      </Card>

      {approved.map(({ item, file }) => (
        <ApprovedNotice key={item.id} item={item} file={file} />
      ))}

      {isLoading && <Loading />}
      {error && <ErrorState error={error} />}
      {pending?.length === 0 && approved.length === 0 && (
        <Card className="flex flex-col items-center gap-2 p-12 text-center">
          <BadgeCheck className="size-6 text-muted-foreground" />
          <div className="font-medium">Nothing is waiting for approval</div>
          <p className="max-w-md text-sm text-muted-foreground">
            Proposals appear here when a carrier changes its statement layout, or when a bonus agreement needs its rules
            read.
          </p>
        </Card>
      )}

      <div className="flex flex-col gap-6">
        {pending?.map(item => (
          <ApprovalCard
            key={item.id}
            item={item}
            reviewer={reviewer.trim()}
            onApproved={file => setApproved(current => [...current, { item, file }])}
          />
        ))}
      </div>
    </>
  );
}

function ApprovalCard({
  item,
  reviewer,
  onApproved
}: {
  item: PendingApproval;
  reviewer: string;
  onApproved: (file: string) => void;
}) {
  const approve = useApprove();
  const canApprove = reviewer.length > 0 && (item.kind !== "layout" || item.verified);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">
            {item.kind === "layout"
              ? `${item.carrierName}: new statement layout`
              : `${item.carrierName}: profit-sharing rules for ${item.programYear}`}
          </CardTitle>
          <CardDescription>
            {item.kind === "layout"
              ? `The ${periodName(item.period)} statement arrived with different columns. A model proposed a new mapping.`
              : "A model read the agreement into rules. Check each rule against the clause it cites."}
          </CardDescription>
        </div>
        <CheckBadge item={item} />
      </CardHeader>
      <CardContent>
        {item.kind === "layout" ? (
          <LayoutChanges item={item} />
        ) : (
          <BonusRulesTable rules={item.rules} notes={item.notes} />
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
          <Button
            disabled={!canApprove || approve.isPending}
            onClick={() =>
              approve.mutate({ id: item.id, approvedBy: reviewer }, { onSuccess: result => onApproved(result.file) })
            }
          >
            {approve.isPending ? <Loader2 className="animate-spin" /> : <BadgeCheck />}
            Approve
          </Button>
          <span className="text-xs text-muted-foreground">
            {reviewer.length === 0
              ? "Enter your name above to approve."
              : item.kind === "layout" && !item.verified
                ? "This proposal failed its check, so it cannot be approved. Edit the format by hand."
                : `Saves it to the tenant's config as approved by ${reviewer}.`}
          </span>
          {approve.error && <span className="text-xs text-critical-ink">{approve.error.message}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function CheckBadge({ item }: { item: PendingApproval }) {
  if (item.kind === "bonus_rules") {
    return (
      <Badge tone="outline">
        <Info /> Needs a person to check clauses
      </Badge>
    );
  }
  return item.verified ? (
    <Badge tone="good">
      <CircleCheck /> Reads every line and ties out
    </Badge>
  ) : (
    <Badge tone="critical">
      <CircleAlert /> Failed its check
    </Badge>
  );
}

function LayoutChanges({ item }: { item: Extract<PendingApproval, { kind: "layout" }> }) {
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Field</TableHead>
            <TableHead>Column before</TableHead>
            <TableHead />
            <TableHead>Column now</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {item.changes.map(change => (
            <TableRow key={change.field}>
              <TableCell className="font-medium">{change.field}</TableCell>
              <TableCell>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{change.from}</code>
              </TableCell>
              <TableCell>
                <ArrowRight className="size-4 text-muted-foreground" />
              </TableCell>
              <TableCell>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{change.to}</code>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="mt-4 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">The model's reasoning: </span>
        {item.explanation}
      </p>
    </>
  );
}

function BonusRulesTable({ rules, notes }: { rules: BonusRules; notes: string[] }) {
  const rows: { rule: string; value: string; clause: string }[] = [
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
        <div className="mt-4 rounded-lg border border-warning/40 bg-warning-soft/50 p-4">
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
      <p className="mt-3 text-xs text-muted-foreground">
        Tied to the agreement document by its fingerprint {rules.agreementSha256.slice(0, 12)}. If the document changes,
        the rules need approving again.
      </p>
    </>
  );
}

/** After approving, the change applies on the next run, so offer that run here. */
function ApprovedNotice({ item, file }: { item: PendingApproval; file: string }) {
  const runPeriod = useRunPeriod();
  const runBonus = useRunBonus();
  const running = runPeriod.isPending || runBonus.isPending;
  const ran = runPeriod.isSuccess || runBonus.isSuccess;
  const rerun = () => (item.kind === "layout" ? runPeriod.mutate(item.period) : runBonus.mutate(item.programId));

  return (
    <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 border-good/30 bg-good-soft/60 p-4">
      <div className="text-sm">
        <div className="flex items-center gap-1.5 font-medium text-good-ink">
          <CircleCheck className="size-4" /> Approved and saved to <code className="text-xs">{file}</code>
        </div>
        <div className="mt-0.5 text-muted-foreground">
          {ran
            ? "Done. The results are updated."
            : item.kind === "layout"
              ? `Run ${periodName(item.period)} again to process ${item.carrierName}'s statement with it.`
              : `Run the ${item.programYear} bonus check with the approved rules.`}
        </div>
      </div>
      {!ran && <RunButton onRun={rerun} running={running} label="Run now" />}
    </Card>
  );
}

function readReviewer(): string {
  try {
    return localStorage.getItem(REVIEWER_KEY) ?? "";
  } catch {
    return "";
  }
}

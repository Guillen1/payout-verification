import { ArrowRight, BadgeCheck, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { useApprovals, useApprove, useRunBonus, useRunPeriod, useStatementCsv } from "@/api/client";
import type { BonusRules, PendingApproval } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { parseCsv } from "@/lib/csv";
import { money, rate } from "@/lib/format";
import { cn } from "@/lib/utils";

const REVIEWER_KEY = "payout-verification:reviewer";

/**
 * A model's proposal, shown where the problem is. Approving saves it with the reviewer's name in
 * the approvals log, then runs again.
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
    <Card className="p-6">
      <h2 className="font-semibold">
        {item.kind === "layout" ? "The AI found the new columns" : "The AI read the agreement into rules"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {item.kind === "layout"
          ? item.verified
            ? "Checked against every line: it ties out to the cent."
            : "It failed the check against the file, so it cannot be approved."
          : "Check each rule against its clause."}
      </p>

      <div className="mt-5">
        {item.kind === "layout" ? <LayoutChanges item={item} /> : <Rules rules={item.rules} notes={item.notes} />}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Input
          aria-label="Your name"
          className="max-w-52"
          placeholder="Your name"
          value={reviewer}
          onChange={event => {
            setReviewer(event.target.value);
            saveReviewer(event.target.value);
          }}
        />
        <Button disabled={!canApprove || working} onClick={approveAndRun}>
          {working ? <Loader2 className="animate-spin" /> : <BadgeCheck />}
          Approve and run
        </Button>
        {approve.error && <span className="text-xs text-critical-ink">{approve.error.message}</span>}
      </div>
    </Card>
  );
}

/**
 * The AI's fix for a changed layout, with its reasoning and the evidence: the new file's first rows,
 * the renamed columns marked. The check above says whether code proved it against every line.
 */
function LayoutChanges({ item }: { item: Extract<PendingApproval, { kind: "layout" }> }) {
  const columns = [...new Map(item.changes.map(change => [`${change.from}>${change.to}`, change])).values()];
  const carrierId = item.id.split(":")[2] ?? "";
  const { data: csv } = useStatementCsv(item.period, carrierId, carrierId !== "");
  const [header = [], ...rows] = csv ? parseCsv(csv) : [];
  const renamed = new Set(columns.map(change => change.to));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {columns.map(change => (
          <div key={change.field} className="flex items-center gap-3 text-sm">
            <code className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground line-through">{change.from}</code>
            <ArrowRight className="size-4 text-muted-foreground" />
            <code className="rounded bg-good-soft px-2 py-1 text-xs text-good-ink">{change.to}</code>
          </div>
        ))}
      </div>

      {item.explanation && (
        <div className="rounded-lg bg-muted px-4 py-3 text-sm">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5" /> Why the AI thinks so
          </div>
          {item.explanation}
        </div>
      )}

      {header.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs text-muted-foreground">
            The new file's first rows, with the renamed column marked
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full font-mono text-xs">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  {header.map(cell => (
                    <th
                      key={cell}
                      className={cn(
                        "px-3 py-2 text-left font-normal whitespace-nowrap",
                        renamed.has(cell) && "bg-good-soft font-medium text-good-ink"
                      )}
                    >
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 3).map((cells, index) => (
                  <tr key={index} className="border-t">
                    {cells.map((cell, column) => (
                      <td
                        key={column}
                        className={cn(
                          "px-3 py-1.5 whitespace-nowrap",
                          renamed.has(header[column] ?? "") && "bg-good-soft/60"
                        )}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Rules({ rules, notes }: { rules: BonusRules; notes: string[] }) {
  const rows = [
    {
      rule: "Eligible lines",
      value: rules.eligibleProducts.products.join(", "),
      clause: rules.eligibleProducts.clause
    },
    { rule: "Minimum premium", value: money(rules.minimumPremium.cents), clause: rules.minimumPremium.clause },
    ...rules.lossRatioBands.bands.map(band => ({
      rule: `Loss ratio up to ${rate(band.upToLossRatioBps)}`,
      value: rate(band.rateBps),
      clause: rules.lossRatioBands.clause
    })),
    ...(rules.maximumBonus
      ? [{ rule: "Maximum", value: money(rules.maximumBonus.cents), clause: rules.maximumBonus.clause }]
      : [])
  ];
  return (
    <>
      <div className="divide-y rounded-lg border">
        {rows.map(row => (
          <div key={row.rule} className="flex items-center gap-4 px-4 py-2.5 text-sm">
            <span className="flex-1">{row.rule}</span>
            <span className="tabular font-medium">{row.value}</span>
            <span className="w-12 text-right text-xs text-muted-foreground">§ {row.clause}</span>
          </div>
        ))}
      </div>
      {notes.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-warning-ink">
            {notes.length} other terms to read before approving
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            {notes.map(note => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </details>
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

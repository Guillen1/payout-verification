import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router";
import { useCommissionLetter, usePeriod } from "@/api/client";
import type { CarrierView, LineView } from "@/api/types";
import { ApprovalPanel } from "@/components/approval-panel";
import { LetterDialog } from "@/components/letter-dialog";
import { ErrorState, Loading } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { money, moneyDelta, periodName } from "@/lib/format";

/** One carrier's statement: only what needs a person, and how much each item is worth. */
export function CarrierPage() {
  const { period = "", carrierId = "" } = useParams();
  const { data: view, error, isLoading } = usePeriod(period);
  const useLetter = (enabled: boolean) => useCommissionLetter(period, carrierId, enabled);

  if (isLoading) return <Loading />;
  if (error || !view) return <ErrorState error={error ?? new Error("No data")} />;
  const carrier = view.carriers.find(entry => entry.id === carrierId);
  if (!carrier) return <ErrorState error={new Error(`No carrier ${carrierId} in ${period}`)} />;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          to={`/periods/${period}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {periodName(period)}
        </Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{carrier.name}</h1>
            {carrier.state === "processed" && (
              <p className="mt-1 text-muted-foreground">
                <span className="tabular font-semibold text-critical-ink">{money(carrier.owedCents)} owed</span> ·{" "}
                {issues(carrier).length} of {carrier.lines.length} lines need a person
              </p>
            )}
          </div>
          {carrier.owedCents > 0 && <LetterDialog title={`Letter to ${carrier.name}`} useLetter={useLetter} />}
        </div>
      </div>

      {carrier.hold ? (
        <>
          <p className="rounded-lg bg-warning-soft px-4 py-3 text-sm">
            <span className="font-medium">Held:</span> {carrier.hold.reason} Nothing is paid out until it is resolved.
          </p>
          <ApprovalPanel approvalId={`layout:${period}:${carrier.id}`} />
        </>
      ) : (
        <Issues carrier={carrier} />
      )}
    </div>
  );
}

interface Issue {
  key: string;
  policy: string;
  insured: string;
  what: string;
  tone: "critical" | "warning";
  amount: string;
}

function Issues({ carrier }: { carrier: CarrierView }) {
  const rows = issues(carrier);
  if (rows.length === 0) return <p className="text-muted-foreground">Every line was paid as agreed.</p>;
  return (
    <Card className="divide-y">
      {rows.map(row => (
        <div key={row.key} className="flex items-center gap-6 px-6 py-4">
          <div className="w-40 shrink-0">
            <div className="font-medium">{row.policy}</div>
            <div className="truncate text-xs text-muted-foreground">{row.insured}</div>
          </div>
          <div className="flex-1">
            <Badge tone={row.tone}>{row.what}</Badge>
          </div>
          <div className="tabular text-right font-medium">{row.amount}</div>
        </div>
      ))}
    </Card>
  );
}

function issues(carrier: CarrierView): Issue[] {
  const lines: Issue[] = carrier.lines
    .filter(line => line.disposition !== "clear")
    .map(line => ({
      key: `line-${line.row}`,
      policy: line.policyNumber ?? "No policy number",
      insured: line.insuredName,
      what: describe(line),
      tone: line.disposition === "dispute" ? "critical" : "warning",
      amount:
        line.disposition === "dispute" && line.varianceCents !== null
          ? moneyDelta(line.varianceCents)
          : `${money(line.paidCents)} held`
    }));
  const missing: Issue[] = carrier.missing.map(entry => ({
    key: `missing-${entry.policyNumber}`,
    policy: entry.policyNumber,
    insured: entry.insuredName,
    what: "Never paid",
    tone: "critical",
    amount: entry.expectedCents === null ? "Unknown" : moneyDelta(-entry.expectedCents)
  }));
  return [...lines, ...missing];
}

function describe(line: LineView): string {
  switch (line.finding) {
    case "rate_variance":
      return (line.varianceCents ?? 0) < 0 ? "Paid below the agreed rate" : "Paid above the agreed rate";
    case "duplicate":
      return "Printed twice";
    case "unmatched":
      return "Not in the policy book";
    case "ambiguous_match":
      return "Matches more than one policy";
    case "premium_variance":
      return "Premium differs from the policy book";
    case "no_rate_rule":
      return "No rate on file";
    case "no_split_rule":
      return "No agency split on file";
    default:
      return line.explanation;
  }
}

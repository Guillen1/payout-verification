import { ArrowLeft, FileSearch } from "lucide-react";
import { Link, useParams } from "react-router";
import { useCommissionLetter, usePeriod } from "@/api/client";
import type { CarrierView, LineView, MissingView } from "@/api/types";
import { ApprovalPanel } from "@/components/approval-panel";
import { LetterDialog } from "@/components/letter-dialog";
import { ReadingReplay } from "@/components/reading-replay";
import { CsvExcerpt, PdfExcerpt } from "@/components/statement-excerpt";
import { ErrorState, Loading } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { money, moneyDelta, periodName } from "@/lib/format";
import { occurrenceOf } from "@/lib/pdf";
import { cn } from "@/lib/utils";
import { capitalized, useWords, type TenantWords } from "@/lib/words";

/** One carrier's statement: only what needs a person, and how much each item is worth. */
export function CarrierPage() {
  const { period = "", carrierId = "" } = useParams();
  const { data: view, error, isLoading } = usePeriod(period);
  const words = useWords();
  const useLetter = (enabled: boolean) => useCommissionLetter(period, carrierId, enabled);

  if (isLoading) return <Loading />;
  if (error || !view) return <ErrorState error={error ?? new Error("No data")} />;
  const carrier = view.carriers.find(entry => entry.id === carrierId);
  if (!carrier) return <ErrorState error={new Error(`No ${carrierId} in ${period}`)} />;

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
                {carrier.owedCents > 0 ? (
                  <span className="tabular font-semibold text-critical-ink">{money(carrier.owedCents)} owed</span>
                ) : (
                  <span className="font-medium text-foreground">Nothing owed</span>
                )}{" "}
                · {issues(carrier, words).length} of {carrier.lines.length} lines need a person
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {carrier.owedCents > 0 && <LetterDialog title={`Letter to ${carrier.name}`} useLetter={useLetter} />}
            {carrier.fileKind === "pdf" && carrier.state === "processed" && (
              <ReadingReplay
                period={period}
                carrier={carrier}
                statement={words.statement}
                describe={line => describe(line, words)}
              />
            )}
          </div>
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
        <Issues carrier={carrier} period={period} words={words} />
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
  source: { kind: "line"; line: LineView } | { kind: "missing"; entry: MissingView };
}

function Issues({ carrier, period, words }: { carrier: CarrierView; period: string; words: TenantWords }) {
  const rows = issues(carrier, words);
  if (rows.length === 0) return <p className="text-muted-foreground">Every line was paid as agreed.</p>;
  return (
    <Card className="divide-y">
      {rows.map(row => (
        <Dialog key={row.key}>
          <DialogTrigger asChild>
            <button className="group flex w-full items-center gap-6 px-6 py-4 text-left transition-colors hover:bg-muted/40">
              <div className="w-44 shrink-0">
                <div className="font-medium">{row.policy}</div>
                <div className="truncate text-xs text-muted-foreground">{row.insured}</div>
              </div>
              <div className="flex-1">
                <Badge tone={row.tone}>{row.what}</Badge>
              </div>
              <div className="tabular text-right font-medium">{row.amount}</div>
              <span className="flex items-center gap-1 text-sm text-muted-foreground group-hover:text-foreground">
                <FileSearch className="size-4" /> See it
              </span>
            </button>
          </DialogTrigger>
          <Evidence carrier={carrier} period={period} issue={row} words={words} />
        </Dialog>
      ))}
    </Card>
  );
}

/** The finding next to the document it came from, so anyone can see it with their own eyes. */
function Evidence({
  carrier,
  period,
  issue,
  words
}: {
  carrier: CarrierView;
  period: string;
  issue: Issue;
  words: TenantWords;
}) {
  const { source } = issue;
  const figures =
    source.kind === "line"
      ? [
          { label: `${capitalized(words.counterparty)} paid`, value: money(source.line.paidCents) },
          source.line.expectedCents !== null && {
            label: "The agreement says",
            value: money(source.line.expectedCents)
          },
          {
            label: issue.tone === "warning" ? "Held until a person decides" : "Difference",
            value: issue.amount,
            strong: true
          }
        ]
      : [
          { label: `${capitalized(words.counterparty)} paid`, value: money(0) },
          {
            label: "The agreement says",
            value: source.entry.expectedCents === null ? "Unknown" : money(source.entry.expectedCents)
          },
          { label: "Difference", value: issue.amount, strong: true }
        ];

  return (
    <DialogContent className="w-[min(900px,calc(100vw-2rem))]">
      <DialogTitle className="flex items-center gap-3 text-lg font-semibold">
        {issue.policy} <Badge tone={issue.tone}>{issue.what}</Badge>
      </DialogTitle>
      <DialogDescription className="mt-1 text-sm text-muted-foreground">
        {source.kind === "line"
          ? `${issue.insured} · ${source.line.explanation}`
          : `${issue.insured} · dated ${source.entry.effectiveDate}, in the ${words.book}, but on no line of the ${words.statement}.`}
      </DialogDescription>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {figures.filter(Boolean).map(figure =>
          figure ? (
            <div key={figure.label} className="rounded-lg bg-muted px-4 py-3">
              <div className="text-xs text-muted-foreground">{figure.label}</div>
              <div className={cn("tabular text-lg font-semibold", "strong" in figure && "text-critical-ink")}>
                {figure.value}
              </div>
            </div>
          ) : null
        )}
      </div>

      <div className="mt-6">
        <div className="mb-2 text-sm font-medium">
          {source.kind === "missing"
            ? `${carrier.name}'s ${words.statement}: not there`
            : carrier.fileKind === "pdf"
              ? `${carrier.name}'s printed ${words.statement}, page ${source.line.page ?? 1}, as the AI read it`
              : `${carrier.name}'s ${words.statement} file, row ${source.line.row}`}
        </div>
        {source.kind === "missing" ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Every line of the {words.statement} was checked. {issue.policy} is not on any of them.
          </p>
        ) : carrier.fileKind === "pdf" ? (
          <PdfExcerpt
            period={period}
            carrierId={carrier.id}
            page={source.line.page ?? 1}
            findText={source.line.insuredName}
            occurrence={occurrenceOf(source.line, carrier.lines)}
          />
        ) : (
          <CsvExcerpt period={period} carrierId={carrier.id} row={source.line.row} columns={carrier.csvColumns ?? []} />
        )}
      </div>
    </DialogContent>
  );
}

function issues(carrier: CarrierView, words: TenantWords): Issue[] {
  const lines: Issue[] = carrier.lines
    .filter(line => line.disposition !== "clear")
    .map(line => ({
      key: `line-${line.row}`,
      policy: line.policyNumber ?? `No ${words.item} number`,
      insured: line.insuredName,
      what: describe(line, words),
      tone: line.disposition === "dispute" ? "critical" : "warning",
      amount:
        line.disposition === "dispute" && line.varianceCents !== null
          ? moneyDelta(line.varianceCents)
          : `${money(line.paidCents)} held`,
      source: { kind: "line", line }
    }));
  const missing: Issue[] = carrier.missing.map(entry => ({
    key: `missing-${entry.policyNumber}`,
    policy: entry.policyNumber,
    insured: entry.insuredName,
    what: "Never paid",
    tone: "critical",
    amount: entry.expectedCents === null ? "Unknown" : moneyDelta(-entry.expectedCents),
    source: { kind: "missing", entry }
  }));
  return [...lines, ...missing];
}

function describe(line: LineView, words: TenantWords): string {
  switch (line.finding) {
    case "rate_variance":
      return (line.varianceCents ?? 0) < 0 ? "Paid below the agreed rate" : "Paid above the agreed rate";
    case "duplicate":
      return "Printed twice";
    case "unmatched":
      return `Not in the ${words.book}`;
    case "ambiguous_match":
      return `Matches more than one ${words.item}`;
    case "premium_variance":
      return `${capitalized(words.amount)} differs from the ${words.book}`;
    case "no_rate_rule":
      return "No rate on file";
    case "no_split_rule":
      return `No ${words.partner} split on file`;
    default:
      return line.explanation;
  }
}

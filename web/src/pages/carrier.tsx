import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState
} from "@tanstack/react-table";
import { ArrowLeft, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useCommissionLetter, usePeriod } from "@/api/client";
import type { CarrierView, LineView, MissingView } from "@/api/types";
import { ApprovalPanel } from "@/components/approval-panel";
import { DispositionBadge } from "@/components/disposition-badge";
import { LetterDialog } from "@/components/letter-dialog";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { ErrorState, Loading } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { label, money, moneyDelta, periodName } from "@/lib/format";
import { cn } from "@/lib/utils";

/** One carrier's statement: every line with its outcome, and the commission that never came. */
export function CarrierPage() {
  const { period = "", carrierId = "" } = useParams();
  const { data: view, error, isLoading } = usePeriod(period);
  const useLetter = (enabled: boolean) => useCommissionLetter(period, carrierId, enabled);

  if (isLoading) return <Loading />;
  if (error || !view) return <ErrorState error={error ?? new Error("No data")} />;
  const carrier = view.carriers.find(entry => entry.id === carrierId);
  if (!carrier) return <ErrorState error={new Error(`No carrier ${carrierId} in ${period}`)} />;

  return (
    <>
      <Link
        to={`/periods/${period}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {periodName(period)}
      </Link>
      <PageHeader
        eyebrow={`${carrier.fileKind.toUpperCase()} statement, ${periodName(period)}`}
        title={carrier.name}
        actions={carrier.owedCents > 0 && <LetterDialog title={`Letter to ${carrier.name}`} useLetter={useLetter} />}
      />
      {carrier.hold ? <HoldCard period={period} carrier={carrier} /> : <Statement carrier={carrier} />}
    </>
  );
}

function HoldCard({ period, carrier }: { period: string; carrier: CarrierView }) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="border-warning/40 bg-warning-soft/40 p-6">
        <div className="font-semibold">Held. {carrier.hold?.reason}</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Nothing from this statement is paid out until this is resolved. The other carriers still close.
        </p>
      </Card>
      <ApprovalPanel approvalId={`layout:${period}:${carrier.id}`} />
    </div>
  );
}

function Statement({ carrier }: { carrier: CarrierView }) {
  const totals = carrier.totals!;
  const attention = carrier.lines.filter(line => line.disposition !== "clear");

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <Stat
          label="Paid"
          value={money(totals.paidCents)}
          hint={`${carrier.lines.length} lines, adds up to the statement total`}
        />
        <Stat label="Owed" value={money(carrier.owedCents)} tone={carrier.owedCents > 0 ? "critical" : "neutral"} />
        <Stat
          label="Held for review"
          value={money(totals.heldCents)}
          tone={totals.heldCents > 0 ? "warning" : "neutral"}
        />
      </div>

      <Tabs defaultValue="attention" className="mt-8">
        <TabsList>
          <TabsTrigger value="attention">Needs a person · {attention.length + carrier.missing.length}</TabsTrigger>
          <TabsTrigger value="all">All lines · {carrier.lines.length}</TabsTrigger>
        </TabsList>
        <TabsContent value="attention" className="mt-3 flex flex-col gap-4">
          <Card>
            <LinesTable lines={attention} />
          </Card>
          {carrier.missing.length > 0 && (
            <Card>
              <MissingTable missing={carrier.missing} />
            </Card>
          )}
        </TabsContent>
        <TabsContent value="all" className="mt-3">
          <Card>
            <LinesTable lines={carrier.lines} />
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

const columns: ColumnDef<LineView>[] = [
  {
    id: "source",
    header: "Row",
    accessorFn: line => line.row,
    cell: ({ row: { original: line } }) => (
      <span className="tabular text-muted-foreground">{line.page ? `p${line.page} · ${line.row}` : line.row}</span>
    )
  },
  {
    accessorKey: "policyNumber",
    header: "Policy",
    cell: ({ row: { original: line } }) => (
      <div>
        <div className="font-medium whitespace-nowrap">{line.policyNumber ?? "(blank)"}</div>
        <div className="text-xs text-muted-foreground">{line.insuredName}</div>
      </div>
    )
  },
  {
    accessorKey: "agency",
    header: "Agency",
    cell: ({ row: { original: line } }) => <span className="text-muted-foreground">{line.agency ?? "Not matched"}</span>
  },
  {
    accessorKey: "disposition",
    header: "Outcome",
    cell: ({ row: { original: line } }) => (
      <div className="flex flex-col items-start gap-1">
        <DispositionBadge disposition={line.disposition} />
        <span className="text-xs text-muted-foreground">{label(line.finding)}</span>
      </div>
    )
  },
  {
    accessorKey: "paidCents",
    header: "Paid",
    cell: ({ row: { original: line } }) => <Amount cents={line.paidCents} />
  },
  {
    accessorKey: "expectedCents",
    header: "Expected",
    cell: ({ row: { original: line } }) =>
      line.expectedCents === null ? (
        <span className="text-muted-foreground">-</span>
      ) : (
        <Amount cents={line.expectedCents} />
      )
  },
  {
    accessorKey: "varianceCents",
    header: "Difference",
    cell: ({ row: { original: line } }) =>
      line.varianceCents === null || line.varianceCents === 0 ? (
        <span className="text-muted-foreground">-</span>
      ) : (
        <span className={cn("tabular whitespace-nowrap", line.varianceCents < 0 && "font-medium text-critical-ink")}>
          {moneyDelta(line.varianceCents)}
        </span>
      )
  },
  {
    accessorKey: "explanation",
    header: "Detail",
    enableSorting: false,
    cell: ({ row: { original: line } }) => (
      <span className="block max-w-sm text-xs leading-relaxed text-muted-foreground">{line.explanation}</span>
    )
  }
];

function LinesTable({ lines }: { lines: LineView[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const data = useMemo(() => lines, [lines]);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  if (lines.length === 0) return <Empty text="No lines here." />;
  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map(group => (
          <TableRow key={group.id} className="hover:bg-transparent">
            {group.headers.map(header => (
              <TableHead key={header.id}>
                {header.column.getCanSort() ? (
                  <button
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    <ArrowUpDown className="size-3" />
                  </button>
                ) : (
                  flexRender(header.column.columnDef.header, header.getContext())
                )}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map(row => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map(cell => (
              <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function MissingTable({ missing }: { missing: MissingView[] }) {
  if (missing.length === 0) return <Empty text="Every policy that took effect this period was paid." />;
  return (
    <>
      <p className="px-5 pt-4 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Never paid. </span>
        These policies took effect this month but appear nowhere on the statement. They are found by starting from the
        policy book, because nothing on a statement points at a payment that never came.
      </p>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Policy</TableHead>
            <TableHead>Agency</TableHead>
            <TableHead>Effective</TableHead>
            <TableHead>Expected commission</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {missing.map(entry => (
            <TableRow key={entry.policyNumber}>
              <TableCell>
                <div className="font-medium">{entry.policyNumber}</div>
                <div className="text-xs text-muted-foreground">{entry.insuredName}</div>
              </TableCell>
              <TableCell className="text-muted-foreground">{entry.agency}</TableCell>
              <TableCell className="tabular text-muted-foreground">{entry.effectiveDate}</TableCell>
              <TableCell>{entry.expectedCents === null ? "Unknown" : <Amount cents={entry.expectedCents} />}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}

function Amount({ cents }: { cents: number }) {
  return <span className="tabular whitespace-nowrap">{money(cents)}</span>;
}

function Empty({ text }: { text: string }) {
  return <p className="p-8 text-center text-sm text-muted-foreground">{text}</p>;
}

import { getDocument } from "pdfjs-dist";
import { CircleAlert, CircleCheck, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStatementPdf } from "@/api/client";
import type { CarrierView, LineView } from "@/api/types";
import { Loading } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { money } from "@/lib/format";
import { findLine, occurrenceOf, type LineMark } from "@/lib/pdf";
import { cn } from "@/lib/utils";

/** How long the scan takes over one page. */
const PAGE_MS = 5_000;

interface PreparedPage {
  image: string;
  /** The page's width over its height, and how much of the height has print on it. */
  aspect: number;
  crop: number;
  /** Where each line read from this page is printed, by statement row. */
  marks: Map<number, LineMark>;
}

/**
 * A replay of how the AI read a printed statement this month: the page, a scan moving down it, and
 * each line appearing as it is passed, checked or flagged. It replays the recorded reading; nothing
 * is read again, so it is the same every time.
 */
export function ReadingReplay({
  period,
  carrier,
  statement,
  describe
}: {
  period: string;
  carrier: CarrierView;
  statement: string;
  describe: (line: LineView) => string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Sparkles /> Watch the AI read it
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(1160px,calc(100vw-2rem))] max-h-[92vh]">
        <DialogTitle className="text-lg font-semibold">
          The AI reading {carrier.name}'s printed {statement}
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          A replay of this month's reading. Code checks every line it reads against the agreement.
        </DialogDescription>
        <Replay period={period} carrier={carrier} describe={describe} />
      </DialogContent>
    </Dialog>
  );
}

function Replay({
  period,
  carrier,
  describe
}: {
  period: string;
  carrier: CarrierView;
  describe: (line: LineView) => string;
}) {
  const { data } = useStatementPdf(period, carrier.id, true);
  const [pages, setPages] = useState<PreparedPage[] | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [run, setRun] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  // Draw each page once and find where every line is printed on it.
  useEffect(() => {
    if (!data) return;
    const loading = getDocument({ data: data.slice() });
    let cancelled = false;
    void (async () => {
      const document = await loading.promise;
      const prepared: PreparedPage[] = [];
      for (let number = 1; number <= document.numPages; number++) {
        const page = await document.getPage(number);
        const viewport = page.getViewport({ scale: 1.6 });
        const canvas = window.document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas, viewport }).promise;
        const marks = new Map<number, LineMark>();
        for (const line of carrier.lines.filter(entry => (entry.page ?? 1) === number)) {
          const mark = await findLine(page, viewport, line.insuredName, occurrenceOf(line, carrier.lines));
          if (mark) marks.set(line.row, mark);
        }
        // Show the page down to just below its last line, where the subtotal and total are printed.
        const lowest = Math.max(0, ...[...marks.values()].map(mark => mark.top + mark.height));
        prepared.push({
          image: canvas.toDataURL("image/png"),
          aspect: viewport.width / viewport.height,
          crop: Math.min(1, lowest + 0.1),
          marks
        });
      }
      if (!cancelled) setPages(prepared);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      void loading.destroy();
    };
  }, [data, carrier.lines]);

  const total = (pages?.length ?? 1) * PAGE_MS;

  // The scan runs once per replay; with less motion it starts at the end.
  useEffect(() => {
    if (!pages) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setElapsed(total);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const next = Math.min(total, now - start);
      setElapsed(next);
      if (next < total) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [pages, total, run]);

  const pageIndex = Math.min((pages?.length ?? 1) - 1, Math.floor(elapsed / PAGE_MS));
  const scan = elapsed >= total ? 1 : (elapsed % PAGE_MS) / PAGE_MS;
  const done = pages !== null && elapsed >= total;

  const isRead = useCallback(
    (line: LineView) => {
      if (!pages) return false;
      const page = (line.page ?? 1) - 1;
      if (page < pageIndex || done) return true;
      if (page > pageIndex) return false;
      const prepared = pages[page];
      const mark = prepared?.marks.get(line.row);
      return mark && prepared ? mark.top + mark.height / 2 <= scan * prepared.crop : false;
    },
    [pages, pageIndex, scan, done]
  );

  const read = carrier.lines.filter(isRead);
  const needPerson = carrier.lines.filter(line => line.disposition !== "clear").length;

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [read.length]);

  if (!pages) return <Loading />;
  const page = pages[pageIndex]!;

  return (
    <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div
        className="relative self-start overflow-hidden rounded-lg border bg-white"
        style={{ aspectRatio: `${page.aspect} / ${page.crop}` }}
      >
        <img
          src={page.image}
          alt={`Page ${pageIndex + 1} of the statement`}
          className="absolute inset-x-0 top-0 block h-auto w-full"
        />
        {carrier.lines
          .filter(line => (line.page ?? 1) - 1 === pageIndex && isRead(line))
          .map(line => {
            const mark = page.marks.get(line.row);
            if (!mark) return null;
            return (
              <div
                key={line.row}
                className={cn(
                  "absolute inset-x-1 rounded-sm",
                  line.disposition === "clear" && "bg-good/10",
                  line.disposition === "review" && "border-2 border-warning bg-warning/20",
                  line.disposition === "dispute" && "border-2 border-critical bg-critical/15"
                )}
                style={{ top: `${(mark.top / page.crop) * 100}%`, height: `${(mark.height / page.crop) * 100}%` }}
              />
            );
          })}
        {!done && (
          <div
            className="pointer-events-none absolute inset-x-0 h-16 -translate-y-full bg-gradient-to-b from-transparent to-[var(--series-1)]/25"
            style={{ top: `${scan * 100}%` }}
          >
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--series-1)] shadow-[0_0_12px_var(--series-1)]" />
          </div>
        )}
        <div className="absolute top-2 right-2 rounded-full bg-foreground/80 px-2.5 py-1 text-xs text-background">
          Page {pageIndex + 1} of {pages.length}
        </div>
      </div>

      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <div className="tabular text-3xl font-semibold">
            {read.length}{" "}
            <span className="text-base font-normal text-muted-foreground">of {carrier.lines.length} lines read</span>
          </div>
          {done && (
            <Button variant="outline" size="sm" onClick={() => setRun(count => count + 1)}>
              <RotateCcw /> Replay
            </Button>
          )}
        </div>

        <div ref={list} className="max-h-[46vh] min-h-0 divide-y overflow-y-auto rounded-lg border bg-card">
          {read.map(line => (
            <div key={line.row} className="animate-rise flex items-center gap-3 px-4 py-2 text-sm">
              {line.disposition === "clear" ? (
                <CircleCheck className="size-4 shrink-0 text-good-ink" aria-label="Paid as agreed" />
              ) : line.disposition === "dispute" ? (
                <CircleAlert className="size-4 shrink-0 text-critical-ink" aria-label="Wrong amount" />
              ) : (
                <TriangleAlert className="size-4 shrink-0 text-warning-ink" aria-label="Needs a person" />
              )}
              <span className="tabular w-24 shrink-0 font-medium">{line.policyNumber ?? "(blank)"}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {line.disposition === "clear" ? line.insuredName : describe(line)}
              </span>
              <span className="tabular">{money(line.paidCents)}</span>
            </div>
          ))}
        </div>

        {done && (
          <div className="animate-rise flex flex-col gap-2 text-sm">
            <div className="flex items-center gap-2 rounded-lg bg-good-soft px-4 py-2.5 text-good-ink">
              <CircleCheck className="size-4" />
              Adds up to the printed total, {money(carrier.totals?.paidCents ?? 0)}, to the cent
            </div>
            {(needPerson > 0 || carrier.missing.length > 0) && (
              <div className="flex items-center gap-2 rounded-lg bg-critical-soft px-4 py-2.5 text-critical-ink">
                <CircleAlert className="size-4" />
                {[
                  needPerson > 0 && `${needPerson} ${needPerson === 1 ? "line needs" : "lines need"} a person`,
                  carrier.missing.length > 0 && `${carrier.missing.length} never paid: not on the statement at all`
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
